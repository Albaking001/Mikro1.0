# main.py
import time

from fastapi import FastAPI
from sqlalchemy.exc import OperationalError

from database import SessionLocal, engine, refresh_collation_version, wait_for_database
from models import Base
from routers.cities import router as cities_router
from routers.context import router as context_router
from routers.heatmap import router as heatmap_router
from routers.live_status import router as live_status_router
from routers.providers import router as providers_router
from routers.scoring import router as scoring_router
from routers.stations import router as stations_router
from routers.aggregates import router as aggregates_router
from services.aggregation import ensure_postgis

app = FastAPI()
wait_for_database(engine)

refresh_collation_version(engine)

with SessionLocal() as session:
    ensure_postgis(session)

Base.metadata.create_all(bind=engine)
app.include_router(cities_router)
app.include_router(stations_router)
app.include_router(live_status_router)
app.include_router(heatmap_router)
app.include_router(providers_router)
app.include_router(scoring_router)
app.include_router(context_router)
app.include_router(aggregates_router)


@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "Mikromobilität API läuft. Siehe /docs für verfügbare Endpunkte.",
    }


@app.get("/.well-known/appspecific/{probe:path}", include_in_schema=False)
def devtools_placeholder(probe: str):
    """Return a minimal response for Chromium-based DevTools probes (Chrome, Edge)."""

    return {"status": "ok", "probe": probe}
