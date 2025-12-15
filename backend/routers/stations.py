from datetime import datetime, timedelta
import math
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import SessionLocal
from models import City, Station, StationLiveStatus

router = APIRouter(
    prefix="/api/v1/stations",
    tags=["stations"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("")
def get_stations(city_uid: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Station)

    if city_uid is not None:
        query = query.join(City, City.id == Station.city_id).filter(City.uid == city_uid)

    stations = query.all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "lat": s.lat,
            "lng": s.lng,
            "capacity": s.capacity,
        }
        for s in stations
    ]


@router.get("/{station_id}")
def get_station(station_id: int, db: Session = Depends(get_db)):
    station = db.query(Station).filter(Station.id == station_id).first()

    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    return {
        "id": station.id,
        "name": station.name,
        "lat": station.lat,
        "lng": station.lng,
        "capacity": station.capacity,
    }


@router.get("/{station_id}/details")
def get_station_details(station_id: int, db: Session = Depends(get_db)):
    station = (
        db.query(Station)
        .join(City, City.id == Station.city_id, isouter=True)
        .filter(Station.id == station_id)
        .first()
    )

    if not station:
        raise HTTPException(status_code=404, detail="Station nicht gefunden")

    status = (
        db.query(StationLiveStatus)
        .filter(StationLiveStatus.station_id == station_id)
        .order_by(StationLiveStatus.ts.desc())
        .first()
    )

    return {
        "id": station.id,
        "name": station.name,
        "city": station.city.name if station.city else None,
        "lat": station.lat,
        "lng": station.lng,
        "capacity": station.capacity,
        "station_number": station.station_number,
        "status": "In Betrieb" if station.active else "Außer Betrieb",
        "bikes_available": status.bikes_available if status else None,
        "docks_available": status.docks_available if status else None,
        "updated_at": status.ts.isoformat() if status and status.ts else None,
    }


def _calculate_turnover(statuses: List[StationLiveStatus]):
    if not statuses:
        return {"total_changes": 0, "average_daily_changes": 0.0, "days_count": 0}

    ordered = sorted(statuses, key=lambda s: s.ts)
    total_changes = 0
    daily_changes: Dict[datetime.date, int] = {}

    previous = ordered[0]
    for status in ordered[1:]:
        change = abs((status.bikes_available or 0) - (previous.bikes_available or 0))
        total_changes += change
        day_key = status.ts.date()
        daily_changes[day_key] = daily_changes.get(day_key, 0) + change
        previous = status

    days_count = len(daily_changes) if daily_changes else 1
    return {
        "total_changes": total_changes,
        "average_daily_changes": round(total_changes / days_count, 2),
        "days_count": days_count,
    }


@router.get("/{station_id}/metrics")
def get_station_metrics(
    station_id: int,
    lookback_days: int = Query(7, ge=1, le=30),
    limit: int = Query(200, ge=10, le=500),
    db: Session = Depends(get_db),
):
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    since = datetime.utcnow() - timedelta(days=lookback_days)

    statuses = (
        db.query(StationLiveStatus)
        .filter(StationLiveStatus.station_id == station_id)
        .filter(StationLiveStatus.ts >= since)
        .order_by(StationLiveStatus.ts.desc())
        .limit(limit)
        .all()
    )

    utilization_history = [
        {
            "ts": status.ts.isoformat(),
            "bikes_available": status.bikes_available,
            "docks_available": status.docks_available,
            "utilization": round(
                (status.bikes_available / station.capacity) * 100, 2
            )
            if station.capacity
            else None,
        }
        for status in reversed(statuses)
    ]

    turnover = _calculate_turnover(statuses)

    return {
        "station": {
            "id": station.id,
            "name": station.name,
            "capacity": station.capacity,
            "lat": station.lat,
            "lng": station.lng,
        },
        "utilization_history": utilization_history,
        "turnover": turnover,
    }


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_earth_km = 6371
    lat1_rad, lon1_rad, lat2_rad, lon2_rad = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_earth_km * c


@router.get("/metrics/nearby")
def get_nearby_station_metrics(
    lat: float = Query(..., description="Latitude of the reference point"),
    lng: float = Query(..., description="Longitude of the reference point"),
    radius_km: float = Query(0.75, gt=0, le=10),
    lookback_days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=lookback_days)

    stations = db.query(Station).all()
    nearby = []
    for station in stations:
        if station.lat is None or station.lng is None:
            continue
        distance_km = _haversine_distance_km(lat, lng, station.lat, station.lng)
        if distance_km <= radius_km:
            nearby.append({"station": station, "distance_km": round(distance_km, 3)})

    if not nearby:
        return {
            "center": {"lat": lat, "lng": lng, "radius_km": radius_km},
            "station_count": 0,
            "stations": [],
            "daily_metrics": [],
            "overall": {},
        }

    station_ids = [item["station"].id for item in nearby]
    statuses = (
        db.query(StationLiveStatus)
        .filter(StationLiveStatus.station_id.in_(station_ids))
        .filter(StationLiveStatus.ts >= since)
        .order_by(StationLiveStatus.ts.asc())
        .all()
    )

    capacity_lookup = {item["station"].id: item["station"].capacity or 0 for item in nearby}
    daily_metrics: Dict[str, Dict[str, float | int]] = {}

    for status in statuses:
        date_key = status.ts.date().isoformat()
        capacity = capacity_lookup.get(status.station_id, 0)
        occupancy = (status.bikes_available / capacity) if capacity else 0

        day_entry = daily_metrics.setdefault(
            date_key,
            {"samples": 0, "occupancy_sum": 0.0, "peak_load": 0, "empty_events": 0, "full_events": 0},
        )

        day_entry["samples"] += 1
        day_entry["occupancy_sum"] += occupancy
        day_entry["peak_load"] = max(day_entry["peak_load"], status.bikes_available)
        if status.bikes_available == 0:
            day_entry["empty_events"] += 1
        if status.docks_available == 0:
            day_entry["full_events"] += 1

    daily_response = []
    total_days = len(daily_metrics)
    overall = {
        "average_occupancy": 0.0,
        "peak_load": 0,
        "empty_events": 0,
        "full_events": 0,
    }

    for date_key, metrics in sorted(daily_metrics.items()):
        samples = metrics["samples"] or 1
        avg_occ = (metrics["occupancy_sum"] / samples) * 100
        daily_response.append(
            {
                "date": date_key,
                "average_occupancy": round(avg_occ, 2),
                "peak_load": metrics["peak_load"],
                "empty_events": metrics["empty_events"],
                "full_events": metrics["full_events"],
            }
        )

        overall["average_occupancy"] += avg_occ
        overall["peak_load"] = max(overall["peak_load"], metrics["peak_load"])
        overall["empty_events"] += metrics["empty_events"]
        overall["full_events"] += metrics["full_events"]

    if total_days:
        overall["average_occupancy"] = round(overall["average_occupancy"] / total_days, 2)

    return {
        "center": {"lat": lat, "lng": lng, "radius_km": radius_km},
        "station_count": len(nearby),
        "stations": [
            {
                "id": item["station"].id,
                "name": item["station"].name,
                "distance_km": item["distance_km"],
                "capacity": item["station"].capacity,
            }
            for item in sorted(nearby, key=lambda entry: entry["distance_km"])
        ],
        "daily_metrics": daily_response,
        "overall": overall,
    }
