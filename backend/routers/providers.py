from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Provider

router = APIRouter(
    prefix="/api/v1/providers",
    tags=["providers"]
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/")
def list_providers(db: Session = Depends(get_db)):
    providers = db.query(Provider).all()
    return providers
