# routers/cities.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
from models import City

router = APIRouter(
    prefix="/api/v1/cities",
    tags=["cities"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ▷ 1) Liste aller Städte
@router.get("")
def list_cities(db: Session = Depends(get_db)):
    cities = db.query(City).all()

    return [
        {
            "id": c.id,
            "uid": c.uid,
            "name": c.name,
            "lat": c.lat,
            "lng": c.lng,
            "booked_bikes": c.booked_bikes,
            "available_bikes": c.available_bikes,
        }
        for c in cities
    ]


# ▷ 2) Eine Stadt per ID
@router.get("/{city_id}")
def get_city(city_id: int, db: Session = Depends(get_db)):
    city = db.query(City).filter(City.id == city_id).first()

    if not city:
        raise HTTPException(status_code=404, detail="City not found")

    return {
        "id": city.id,
        "uid": city.uid,
        "name": city.name,
        "lat": city.lat,
        "lng": city.lng,
        "num_places": city.available_bikes,
        "booked_bikes": city.booked_bikes,
    }
