# routers/live_status.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from database import SessionLocal
from models import Station, StationLiveStatus

router = APIRouter(
    prefix="/api/v1/stations",
    tags=["live-status"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/live")
def list_stations_live(db: Session = Depends(get_db)):
    stations = db.query(Station).all()
    result = []

    for s in stations:
        snap = (
            db.query(StationLiveStatus)
            .filter(StationLiveStatus.station_id == s.id)
            .order_by(desc(StationLiveStatus.ts))
            .first()
        )
        if not snap:
            continue

        result.append({
            "id": s.id,
            "name": s.name,
            "lat": s.lat,
            "lng": s.lng,
            "capacity": s.capacity,
            "bikes_available": snap.bikes_available,
            "docks_available": snap.docks_available,
            "ts": snap.ts,
        })

    return result


@router.get("/{station_id}/live")
def get_station_live(station_id: int, db: Session = Depends(get_db)):
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    snap = (
        db.query(StationLiveStatus)
        .filter(StationLiveStatus.station_id == station_id)
        .order_by(desc(StationLiveStatus.ts))
        .first()
    )

    if not snap:
        return {"id": station.id, "name": station.name, "message": "kein Live-Status vorhanden"}

    return {
        "id": station.id,
        "name": station.name,
        "lat": station.lat,
        "lng": station.lng,
        "capacity": station.capacity,
        "bikes_available": snap.bikes_available,
        "docks_available": snap.docks_available,
        "ts": snap.ts,
    }
