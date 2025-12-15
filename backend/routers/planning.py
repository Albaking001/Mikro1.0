# backend/routers/planning.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import math

from database import SessionLocal
from models import City, Station
from services.overpass import (
    OverpassError,
    count_bus_stops,
    count_pois,
    count_rail_stations,
    count_sbahn_stations,
    count_schools_universities,
    count_shops,
    count_tram_stops,
    count_ubahn_stations,
)

router = APIRouter(prefix="/api/v1/planning", tags=["planning"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def _fetch_context_data(lat: float, lng: float, radius: int):
    try:
        bus_stops = count_bus_stops(lat, lng, radius)
        tram_stops = count_tram_stops(lat, lng, radius)
        rail_stations = count_rail_stations(lat, lng, radius)
        sbahn_stations = count_sbahn_stations(lat, lng, radius)
        ubahn_stations = count_ubahn_stations(lat, lng, radius)

        edu = count_schools_universities(lat, lng, radius)
        shops = count_shops(lat, lng, radius)
        pois = count_pois(lat, lng, radius)

        return {
            "lat": lat,
            "lng": lng,
            "radius_m": radius,
            "bus_stops": bus_stops,
            "tram_stops": tram_stops,
            "rail_stations": rail_stations,
            "sbahn_stations": sbahn_stations,
            "ubahn_stations": ubahn_stations,
            "schools": edu["schools"],
            "universities": edu["universities"],
            "shops": shops,
            "pois_total": pois["total"],
            "pois": pois["breakdown"],
        }
    except OverpassError as e:
        raise HTTPException(status_code=502, detail=f"Overpass error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


def _score_label(score: float) -> str:
    if score >= 80:
        return "sehr gut"
    if score >= 60:
        return "gut"
    if score >= 40:
        return "okay"
    if score >= 20:
        return "eher schlecht"
    return "schlecht"


def _station_size_recommendation(score: float) -> str:
    if score >= 80:
        return "große Station (hohe Nachfrage erwartet)"
    if score >= 60:
        return "mittlere Station (solide Grundnachfrage)"
    if score >= 40:
        return "kleine Station (vorsichtig ausbauen)"
    return "Mikro-Station / Testbetrieb"


def _distance_score(distance_m: float | None) -> float:
    if distance_m is None:
        return 0
    if distance_m <= 200:
        return 10
    if distance_m <= 400:
        return 8
    if distance_m <= 600:
        return 6
    if distance_m <= 800:
        return 4
    if distance_m <= 1200:
        return 2
    return 0


def _evaluate_score(context: dict, nearby: dict) -> tuple[float, dict]:
    transport_score = min(
        context["bus_stops"]
        + context["tram_stops"] * 2
        + (context["rail_stations"] + context["sbahn_stations"] + context["ubahn_stations"]) * 3,
        40,
    )
    education_score = min(context["schools"] * 2 + context["universities"] * 3, 15)
    shop_score = min(context["shops"] * 0.5, 10)
    poi_score = min(context["pois_total"] * 0.2, 10)
    station_density_score = min(nearby["stations_in_radius"] * 3, 15)
    distance_score = _distance_score(nearby.get("nearest_station_distance_m"))

    total_score = min(
        transport_score
        + education_score
        + shop_score
        + poi_score
        + station_density_score
        + distance_score,
        100,
    )

    components = {
        "transport": round(transport_score, 1),
        "education": round(education_score, 1),
        "shops": round(shop_score, 1),
        "pois": round(poi_score, 1),
        "station_density": round(station_density_score, 1),
        "distance": round(distance_score, 1),
    }

    return round(total_score, 1), components


def _build_decision(score: float, components: dict) -> dict:
    """Translate the numeric score into a build/no-build recommendation."""
    decision: str
    rationale: str

    if score >= 80:
        decision = "bauen empfohlen"
        rationale = "hohe Nachfrage durch starken ÖPNV-Knoten, Bildung und POIs"
    elif score >= 60:
        decision = "bauen sinnvoll"
        rationale = "gute Grundnachfrage, ergänzt durch vorhandene Stationen im Umfeld"
    elif score >= 40:
        decision = "testen / pilotieren"
        rationale = "durchschnittliches Umfeld – zuerst klein starten"
    else:
        decision = "nicht priorisieren"
        rationale = "wenig ÖPNV/POIs oder kaum Nachfrageindikatoren"

    demand_drivers = {
        "transport_strength": components.get("transport", 0) + components.get("station_density", 0),
        "education_presence": components.get("education", 0),
        "amenities": components.get("shops", 0) + components.get("pois", 0),
    }

    return {
        "build_score": score,
        "decision": decision,
        "rationale": rationale,
        "demand_drivers": demand_drivers,
    }


@router.get("/context")
def planning_context(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(500, ge=50, le=5000),
):
    """
    Kontextdaten (OSM/Overpass) rund um einen Punkt:
    - Bus, Tram, Rail, S-Bahn, U-Bahn
    - Schulen, Unis
    - Shops
    - POIs (breakdown + total)
    """
    return _fetch_context_data(lat, lng, radius)


@router.get("/nearby-stations")
def nearby_stations(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(500, ge=50, le=5000),
    city_name: str = Query("Mainz"),
    db: Session = Depends(get_db),
):
    stations = (
        db.query(Station)
        .join(City, City.id == Station.city_id)
        .filter(City.name.ilike(city_name))
        .filter(Station.lat.isnot(None))
        .filter(Station.lng.isnot(None))
        .all()
    )

    count_in_radius = 0
    nearest_station = None
    nearest_distance = None

    for s in stations:
        d = haversine_m(lat, lng, s.lat, s.lng)

        if nearest_distance is None or d < nearest_distance:
            nearest_distance = d
            nearest_station = s

        if d <= radius:
            count_in_radius += 1

    return {
        "lat": lat,
        "lng": lng,
        "radius_m": radius,
        "city_name": city_name,
        "stations_in_radius": count_in_radius,
        "nearest_station": None
        if nearest_station is None
        else {
            "id": nearest_station.id,
            "name": nearest_station.name,
            "station_number": nearest_station.station_number,
            "lat": nearest_station.lat,
            "lng": nearest_station.lng,
        },
        "nearest_station_distance_m": None if nearest_distance is None else round(nearest_distance, 1),
        "debug_stations_total": len(stations),
    }


@router.get("/evaluate")
def evaluate_location(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(500, ge=50, le=5000),
    city_name: str = Query("Mainz"),
    db: Session = Depends(get_db),
):
    """Bewertet einen Standort mit Score (0–100) und Label."""

    context = _fetch_context_data(lat, lng, radius)
    nearby = nearby_stations(lat=lat, lng=lng, radius=radius, city_name=city_name, db=db)
    score, components = _evaluate_score(context, nearby)
    build_decision = _build_decision(score, components)

    return {
        "lat": lat,
        "lng": lng,
        "radius_m": radius,
        "city_name": city_name,
        "score": score,
        "label": _score_label(score),
        "recommended_station_size": _station_size_recommendation(score),
        "build_recommendation": build_decision,
        "components": components,
        "context": context,
        "stations": nearby,
    }
