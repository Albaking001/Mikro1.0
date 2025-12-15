"""Helpers for building hexagon aggregates and PostGIS-friendly artefacts."""
from collections import defaultdict
from typing import Dict, Iterable

from geoalchemy2 import WKTElement
from h3 import geo_to_h3, h3_to_geo_boundary
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from models import MeinradStation, MeinradUsage, StationHexAggregate


def _polygon_wkt(boundary: Iterable) -> str:
    """Convert an H3 boundary (lat, lng tuples) into a WKT polygon string."""

    coords = ", ".join([f"{lng} {lat}" for lat, lng in list(boundary) + [boundary[0]]])
    return f"POLYGON(({coords}))"


def rebuild_station_hex_aggregates(db: Session, resolution: int = 8) -> None:
    """Aggregate meinRad usage into H3 buckets and persist PostGIS geometries."""

    station_map: Dict[int, MeinradStation] = {
        station.id: station for station in db.query(MeinradStation).all()
    }

    usage_rows = (
        db.query(
            MeinradUsage.station_id,
            func.sum(MeinradUsage.rides_started).label("rides_started"),
            func.sum(MeinradUsage.rides_ended).label("rides_ended"),
            func.avg(MeinradUsage.bikes_available).label("avg_bikes_available"),
        )
        .group_by(MeinradUsage.station_id)
        .all()
    )

    aggregates: Dict[str, Dict] = defaultdict(
        lambda: {"rides_started": 0, "rides_ended": 0, "bikes_available": []}
    )

    for row in usage_rows:
        station = station_map.get(row.station_id)
        if not station:
            continue

        hex_id = geo_to_h3(station.lat, station.lng, resolution)
        aggregates[hex_id]["rides_started"] += row.rides_started or 0
        aggregates[hex_id]["rides_ended"] += row.rides_ended or 0
        if row.avg_bikes_available is not None:
            aggregates[hex_id]["bikes_available"].append(row.avg_bikes_available)

    db.query(StationHexAggregate).filter(StationHexAggregate.resolution == resolution).delete()

    for hex_id, payload in aggregates.items():
        boundary = h3_to_geo_boundary(hex_id, geo_json=True)
        wkt = _polygon_wkt(boundary)
        avg_bikes = None
        if payload["bikes_available"]:
            avg_bikes = sum(payload["bikes_available"]) / len(payload["bikes_available"])

        db.add(
            StationHexAggregate(
                hex_id=hex_id,
                resolution=resolution,
                total_rides_started=payload["rides_started"],
                total_rides_ended=payload["rides_ended"],
                avg_bikes_available=avg_bikes,
                geom=WKTElement(wkt, srid=4326),
            )
        )

    db.commit()


def ensure_postgis(db: Session) -> None:
    """Enable PostGIS if the extension is available in the current database."""

    db.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    db.commit()


def create_or_refresh_materialized_view(db: Session) -> None:
    """Expose aggregates as a materialized view for fast vector-tile reads."""

    ensure_postgis(db)
    db.execute(
        text(
            """
            CREATE MATERIALIZED VIEW IF NOT EXISTS station_hex_tiles AS
            SELECT id, hex_id, resolution, total_rides_started, total_rides_ended,
                   avg_bikes_available, geom
            FROM station_hex_aggregates;
            """
        )
    )
    db.execute(text("REFRESH MATERIALIZED VIEW station_hex_tiles"))
    db.commit()
