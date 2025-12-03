from fastapi import APIRouter, Depends,HTTPException 
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Station

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
def get_stations(db: Session = Depends(get_db)):
    stations = db.query(Station).all()
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