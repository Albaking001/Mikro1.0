# main.py
from fastapi import FastAPI

from routers.cities import router as cities_router
from routers.stations import router as stations_router
from routers.live_status import router as live_status_router
from routers.heatmap import router as heatmap_router
from database import engine
from models import Base
from routers.providers import router as providers_router
from routers.planning import router as planning_router



app = FastAPI()
Base.metadata.create_all(bind=engine)
app.include_router(cities_router)
app.include_router(stations_router)
app.include_router(live_status_router)
app.include_router(heatmap_router)
app.include_router(providers_router)
app.include_router(planning_router)