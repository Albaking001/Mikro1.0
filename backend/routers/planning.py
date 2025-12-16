# backend/routers/planning.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
import math

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
        bus_stops = count_bus_stops(lat, lng, radius)
        tram_stops = count_tram_stops(lat, lng, radius)
        rail_stations = count_rail_stations(lat, lng, radius)
        sbahn_stations = count_sbahn_stations(lat, lng, radius)
        ubahn_stations = count_ubahn_stations(lat, lng, radius)

        edu = count_schools_universities(lat, lng, radius)
        shops = count_shops(lat, lng, radius)
        pois = count_pois(lat, lng, radius)

    except OverpassError as e:
       
        raise HTTPException(status_code=502, detail=f"Overpass error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

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
