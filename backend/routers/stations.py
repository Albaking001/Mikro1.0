from fastapi import APIRouter, Depends,HTTPException 
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Station, StationLiveStatus, City

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