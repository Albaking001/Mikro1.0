from typing import Iterable, List, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Station
from services.geospatial import score_location

router = APIRouter(prefix="/api/v1", tags=["scoring"])


class Point(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)

    def to_tuple(self) -> Tuple[float, float]:
        return (self.lat, self.lng)


class ScoreRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    population: int = Field(0, ge=0)
    pois: List[Point] = Field(default_factory=list)


class ScoreResponse(BaseModel):
    nearest_station_distance_m: float
    station_access_score: float
    population_score: float
    poi_coverage_ratio: float
    poi_within_radius: int
    poi_proximity_score: float
    composite_score: float


# Dependency

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _station_coords(db: Session) -> Iterable[Tuple[float, float]]:
    stations = db.query(Station).all()
    return [(station.lat, station.lng) for station in stations if station.lat is not None and station.lng is not None]


@router.post("/scoring", response_model=ScoreResponse)
def compute_score(payload: ScoreRequest, db: Session = Depends(get_db)):
    stations = list(_station_coords(db))
    if not stations:
        raise HTTPException(status_code=400, detail="Keine Stationsdaten verfügbar")

    pois = [poi.to_tuple() for poi in payload.pois]

    result = score_location((payload.lat, payload.lng), stations, pois, payload.population)
    return result
