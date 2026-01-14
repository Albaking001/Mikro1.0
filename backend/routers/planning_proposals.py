# backend/routers/planning_proposals.py

from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from database import SessionLocal
from models import PlanningProposal

router = APIRouter(prefix="/api/v1/planning", tags=["planning"])


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()



class ProposalCreate(BaseModel):
    city_name: str
    lat: float
    lng: float
    radius: int

    score: int
    score_label: str

    stations_in_radius: Optional[int] = None
    nearest_station: Optional[str] = None

    nearest_distance_m: Optional[float] = None

    bus_stops: int = 0
    railway_stations: int = 0
    schools: int = 0
    universities: int = 0
    shops: int = 0



class ProposalOut(ProposalCreate):
    id: int
    is_best: bool
    model_config = ConfigDict(from_attributes=True)


@router.post("/proposals", response_model=ProposalOut)
def create_proposal(payload: ProposalCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()

   
    data.pop("is_best", None)

    proposal = PlanningProposal(**data)

   
    proposal.is_best = False

    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return proposal


@router.get("/proposals", response_model=List[ProposalOut])
def list_proposals(db: Session = Depends(get_db)):
    return db.query(PlanningProposal).order_by(PlanningProposal.created_at.desc()).all()


@router.post("/proposals/{proposal_id}/set-best", response_model=ProposalOut)
def set_best(proposal_id: int, db: Session = Depends(get_db)):
    proposal = db.query(PlanningProposal).filter(PlanningProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

   
    db.query(PlanningProposal).filter(
        PlanningProposal.city_name == proposal.city_name
    ).update({"is_best": False})

    
    proposal.is_best = True

    db.commit()
    db.refresh(proposal)
    return proposal
