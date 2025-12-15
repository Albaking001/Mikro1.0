from fastapi import APIRouter, Depends, HTTPException
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
def get_stations(
    city_id: int | None = None,
    city_name: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Station)

  
    if city_id is not None:
        query = query.filter(Station.city_id == city_id)

    
    if city_name is not None:
        query = (
            query.join(City, City.id == Station.city_id)
                 .filter(City.name.ilike(city_name))
        )

    stations = query.all()

    return [
        {
            "id": s.id,
            "name": s.name,
            "lat": s.lat,
            "lng": s.lng,
            "capacity": s.capacity,
            "bikes_available": s.bikes_available,
            "docks_available": s.docks_available,
        }
        for s in stations
    ]



@router.get("/wiesbaden")
def get_wiesbaden_stations(db: Session = Depends(get_db)):
    
    stations = (
        db.query(Station)
        .filter(Station.city_id == 470)
        .all()
    )

    return [
        {
            "id": s.id,
            "name": s.name,
            "lat": s.lat,
            "lng": s.lng,
            "capacity": s.capacity,
            "bikes_available": s.bikes_available,
            "docks_available": s.docks_available,
        }
        for s in stations
    ]
@router.get("/mainz")
def get_mainz_stations(db: Session = Depends(get_db)):
    stations = (
        db.query(Station)
        .join(City, City.id == Station.city_id)
        .filter(City.name == "Mainz")
        .all()
    )

    return [
        {
            "id": s.id,
            "name": s.name,
            "lat": s.lat,
            "lng": s.lng,
            "station_number": s.station_number,
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
        "bikes_available": station.bikes_available,
        "docks_available": station.docks_available,
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

    
    status_live = (
        db.query(StationLiveStatus)
        .filter(StationLiveStatus.station_id == station_id)
        .order_by(StationLiveStatus.ts.desc())
        .first()
    )

    
    bikes_available = station.bikes_available
    docks_available = station.docks_available
    updated_at = station.updated_at
    status_text = station.status or "Unbekannt"

    if status_live:
        bikes_available = status_live.bikes_available
        docks_available = status_live.docks_available
        updated_at = status_live.ts

    return {
        "id": station.id,
        "name": station.name,
        "city": station.city.name if station.city else None,
        "lat": station.lat,
        "lng": station.lng,
        "capacity": station.capacity,
        "station_number": station.station_number,
        "status": status_text,
        "bikes_available": bikes_available,
        "docks_available": docks_available,
        "updated_at": updated_at.isoformat() if updated_at else None,
    }

