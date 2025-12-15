# routers/aggregates.py
from fastapi import APIRouter, Depends, Query, Response
from h3 import h3_to_geo_boundary
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import SessionLocal
from models import StationHexAggregate

router = APIRouter(prefix="/api/v1", tags=["aggregates"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/aggregates/hex")
def list_hex_aggregates(
    resolution: int = Query(8, description="H3 resolution"),
    min_lat: float | None = None,
    min_lng: float | None = None,
    max_lat: float | None = None,
    max_lng: float | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(StationHexAggregate).filter(StationHexAggregate.resolution == resolution)

    if None not in (min_lat, min_lng, max_lat, max_lng):
        # Bounding boxes stay index-friendly when PostGIS is enabled
        query = query.filter(
            text(
                "geom && ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)"
            )
        ).params(min_lat=min_lat, min_lng=min_lng, max_lat=max_lat, max_lng=max_lng)

    results = []
    for row in query.all():
        results.append(
            {
                "hex_id": row.hex_id,
                "resolution": row.resolution,
                "total_rides_started": row.total_rides_started,
                "total_rides_ended": row.total_rides_ended,
                "avg_bikes_available": row.avg_bikes_available,
                "geometry": [
                    {"lat": lat, "lng": lng}
                    for lat, lng in h3_to_geo_boundary(row.hex_id, geo_json=True)
                ],
            }
        )

    return results


@router.get(
    "/aggregates/tiles/{z}/{x}/{y}",
    responses={200: {"content": {"application/vnd.mapbox-vector-tile": {}}}},
)
def vector_tiles(z: int, x: int, y: int, db: Session = Depends(get_db)):
    """Return an MVT tile if PostGIS is available."""

    sql = text(
        """
        WITH bounds AS (
            SELECT ST_TileEnvelope(:z, :x, :y) AS geom
        )
        SELECT ST_AsMVT(tile, 'hexes', 4096, 'geom') AS mvt
        FROM (
            SELECT hex_id, total_rides_started, total_rides_ended, avg_bikes_available,
                   ST_AsMVTGeom(geom, bounds.geom, 4096, 64, true) AS geom
            FROM station_hex_aggregates, bounds
            WHERE geom && bounds.geom
        ) AS tile;
        """
    )
    tile = db.execute(sql, {"z": z, "x": x, "y": y}).scalar()
    if tile is None:
        return Response(content=b"", media_type="application/vnd.mapbox-vector-tile", status_code=204)

    return Response(content=tile, media_type="application/vnd.mapbox-vector-tile")
