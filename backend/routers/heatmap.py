# routers/heatmap.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from database import SessionLocal
from models import Station, StationLiveStatus

router = APIRouter(
    prefix="/api/v1",
    tags=["heatmap"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/heatmap")
def get_heatmap(db: Session = Depends(get_db)):
    stations = db.query(Station).all()
    result = []

    for s in stations:
        snap = (
            db.query(StationLiveStatus)
            .filter(StationLiveStatus.station_id == s.id)
            .order_by(desc(StationLiveStatus.ts))
            .first()
        )
        if not snap or not s.capacity or s.capacity == 0:
            continue

        utilisation = snap.bikes_available / s.capacity  # Wert 0..1

        result.append({
            "station_id": s.id,
            "name": s.name,
            "lat": s.lat,
            "lng": s.lng,
            "value": utilisation
        })

    return result
