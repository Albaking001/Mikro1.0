# main.py
import time

from fastapi import FastAPI
from sqlalchemy.exc import OperationalError

from database import engine, wait_for_database
from models import Base
from routers.cities import router as cities_router
from routers.heatmap import router as heatmap_router
from routers.live_status import router as live_status_router
from routers.providers import router as providers_router
from routers.stations import router as stations_router

app = FastAPI()
wait_for_database(engine)
Base.metadata.create_all(bind=engine)
app.include_router(cities_router)
app.include_router(stations_router)
app.include_router(live_status_router)
app.include_router(heatmap_router)
app.include_router(providers_router)
