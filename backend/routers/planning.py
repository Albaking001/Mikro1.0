# backend/routers/planning.py
from fastapi import APIRouter, Depends, Query, HTTPException
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy.orm import Session
import math
import json
from pathlib import Path

from database import SessionLocal
from models import Station, City
from services.overpass import (
    OverpassError,
    count_bus_stops,
    count_tram_stops,
    count_rail_stations,
    count_sbahn_stations,
    count_ubahn_stations,
    count_schools_universities,
    count_shops,
    count_pois,
    fetch_bus_stops_bbox,
    fetch_rail_stations_bbox,
    fetch_schools_bbox,
    fetch_shops_bbox,
    fetch_universities_bbox,
)
from services.planning_precompute import PrecomputeError, precompute_planning_scores

router = APIRouter(prefix="/api/v1/planning", tags=["planning"])

OVERPASS_MAX_WORKERS = 6


def run_parallel(tasks: dict[str, callable]) -> dict[str, object]:
    results: dict[str, object] = {}
    with ThreadPoolExecutor(max_workers=min(len(tasks), OVERPASS_MAX_WORKERS)) as executor:
        future_map = {executor.submit(fn): key for key, fn in tasks.items()}
        for future in as_completed(future_map):
            key = future_map[future]
            results[key] = future.result()
    return results


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

#APIs
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
    try:
        results = run_parallel(
            {
                "bus_stops": lambda: count_bus_stops(lat, lng, radius),
                "tram_stops": lambda: count_tram_stops(lat, lng, radius),
                "rail_stations": lambda: count_rail_stations(lat, lng, radius),
                "sbahn_stations": lambda: count_sbahn_stations(lat, lng, radius),
                "ubahn_stations": lambda: count_ubahn_stations(lat, lng, radius),
                "edu": lambda: count_schools_universities(lat, lng, radius),
                "shops": lambda: count_shops(lat, lng, radius),
                "pois": lambda: count_pois(lat, lng, radius),
            }
        )

    except OverpassError as e:
       
        raise HTTPException(status_code=502, detail=f"Overpass error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    return {
        "lat": lat,
        "lng": lng,
        "radius_m": radius,

        "bus_stops": results["bus_stops"],
        "tram_stops": results["tram_stops"],

        "rail_stations": results["rail_stations"],
        "sbahn_stations": results["sbahn_stations"],
        "ubahn_stations": results["ubahn_stations"],

        "schools": results["edu"]["schools"],
        "universities": results["edu"]["universities"],

        "shops": results["shops"],

        "pois_total": results["pois"]["total"],
        "pois": results["pois"]["breakdown"],
    }


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
        "nearest_station": None if nearest_station is None else {
            "id": nearest_station.id,
            "name": nearest_station.name,
            "station_number": nearest_station.station_number,
            "lat": nearest_station.lat,
            "lng": nearest_station.lng,
        },
        "nearest_station_distance_m": None if nearest_distance is None else round(nearest_distance, 1),
        "debug_stations_total": len(stations),
    }

@router.get("/precomputed-scores")
def get_precomputed_scores(
    city_name: str = Query("Mainz"),
    step_m: int = Query(250, ge=50, le=2000),
    radius_m: int = Query(500, ge=50, le=5000),
    sw_lat: float | None = None,
    sw_lng: float | None = None,
    ne_lat: float | None = None,
    ne_lng: float | None = None,
):
    slug = "".join(ch.lower() if ch.isalnum() else "_" for ch in city_name).strip("_")
    base = Path(__file__).resolve().parents[1]  # backend/
    path = base / "precomputed" / f"planning_{slug}_step{step_m}_r{radius_m}.json"

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Precomputed file not found: {path.name}. Run precompute script first.",
        )

    data = json.loads(path.read_text(encoding="utf-8"))
    pts = data.get("points", [])

    # optional bbox filter (falls du später nur sichtbare Punkte schicken willst)
    if None not in (sw_lat, sw_lng, ne_lat, ne_lng):
        pts = [p for p in pts if sw_lat <= p["lat"] <= ne_lat and sw_lng <= p["lng"] <= ne_lng]
        data["points"] = pts
        data.setdefault("meta", {})["points_returned"] = len(pts)

    return data


@router.post("/heatmap/precompute")
def precompute_heatmap(
    city_name: str = Query("Mainz"),
    step_m: int = Query(250, ge=50, le=2000),
    radius_m: int = Query(500, ge=50, le=5000),
    db: Session = Depends(get_db),
):
    try:
        out_path, payload = precompute_planning_scores(db, city_name, step_m, radius_m)
    except PrecomputeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    return {
        "status": "ok",
        "file": out_path.name,
        "points_total": payload["meta"]["points_total"],
    }


@router.get("/poi-layers")
def planning_poi_layers(
    sw_lat: float = Query(...),
    sw_lng: float = Query(...),
    ne_lat: float = Query(...),
    ne_lng: float = Query(...),
):
    """
    Punktdaten (OSM/Overpass) für Kartenlayer im aktuellen Kartenausschnitt:
    - Bus Stops
    - Rail Stations
    - Schools
    - Universities
    - Shops
    """
    try:
        results = run_parallel(
            {
                "bus_stops": lambda: fetch_bus_stops_bbox(sw_lat, sw_lng, ne_lat, ne_lng),
                "rail_stations": lambda: fetch_rail_stations_bbox(sw_lat, sw_lng, ne_lat, ne_lng),
                "schools": lambda: fetch_schools_bbox(sw_lat, sw_lng, ne_lat, ne_lng),
                "universities": lambda: fetch_universities_bbox(sw_lat, sw_lng, ne_lat, ne_lng),
                "shops": lambda: fetch_shops_bbox(sw_lat, sw_lng, ne_lat, ne_lng),
            }
        )
    except OverpassError as e:
        raise HTTPException(status_code=502, detail=f"Overpass error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    return {
        "bbox": {"sw_lat": sw_lat, "sw_lng": sw_lng, "ne_lat": ne_lat, "ne_lng": ne_lng},
        "bus_stops": results["bus_stops"],
        "rail_stations": results["rail_stations"],
        "schools": results["schools"],
        "universities": results["universities"],
        "shops": results["shops"],
    }
