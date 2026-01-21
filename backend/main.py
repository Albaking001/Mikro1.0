# main.py
from fastapi import FastAPI, Request
from fastapi.responses import Response
import httpx

from routers.cities import router as cities_router
from routers.stations import router as stations_router
from routers.live_status import router as live_status_router
from routers.heatmap import router as heatmap_router
from database import engine
from models import Base
from routers.providers import router as providers_router
from routers.planning import router as planning_router
from routers.planning_proposals import router as planning_proposals_router

app = FastAPI()

# --- WMS Proxy (fixes CORS/CORB by serving tiles from our backend) ---
WMS_SOURCES = {
    # Generalisierte Bodenrichtwerte (RLP) – aus deinem Capabilities XML
    "boris_gen": "https://geo5.service24.rlp.de/wms/genbori_rp.fcgi",
    "boris_vboris": "https://geo5.service24.rlp.de/wms/RLP_VBORISFREE2024.fcgi",
}

@app.get("/api/wms")
async def wms_proxy(request: Request):
    src = request.query_params.get("src", "boris_gen")
    base_url = WMS_SOURCES.get(src)
    if not base_url:
        return Response(
            content=f"Unknown src '{src}'. Allowed: {', '.join(WMS_SOURCES.keys())}".encode("utf-8"),
            media_type="text/plain",
            status_code=400,
        )

    params = {k: v for k, v in request.query_params.items() if k != "src"}

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        r = await client.get(base_url, params=params)

    content_type = r.headers.get("content-type", "application/octet-stream")
    headers = {"Cache-Control": "no-store"}
    return Response(content=r.content, media_type=content_type, headers=headers, status_code=r.status_code)

# --- DB & Routers ---
Base.metadata.create_all(bind=engine)
app.include_router(cities_router)
app.include_router(stations_router)
app.include_router(live_status_router)
app.include_router(heatmap_router)
app.include_router(providers_router)
app.include_router(planning_router)
app.include_router(planning_proposals_router)
