"""Import meinRad CSV data, hydrate tables, and build hex aggregates."""
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict

import pandas as pd
from sqlalchemy.orm import Session

from database import SessionLocal, engine
from models import Base, MeinradStation, MeinradUsage
from services.aggregation import (
    create_or_refresh_materialized_view,
    ensure_postgis,
    rebuild_station_hex_aggregates,
)


COLUMN_ALIASES: Dict[str, str] = {
    "station_id": "station_id",
    "id": "station_id",
    "name": "name",
    "station": "name",
    "lat": "lat",
    "latitude": "lat",
    "lng": "lng",
    "lon": "lng",
    "longitude": "lng",
    "capacity": "capacity",
    "slots": "capacity",
    "timestamp": "timestamp",
    "ts": "timestamp",
    "rides_started": "rides_started",
    "departures": "rides_started",
    "rides_ended": "rides_ended",
    "arrivals": "rides_ended",
    "bikes_available": "bikes_available",
    "available_bikes": "bikes_available",
    "city": "city",
}


MANDATORY_FIELDS = {"station_id", "name", "lat", "lng"}


def normalise_frame(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {}
    for column in df.columns:
        key = column.lower()
        if key in COLUMN_ALIASES:
            rename_map[column] = COLUMN_ALIASES[key]
    df = df.rename(columns=rename_map)

    missing = MANDATORY_FIELDS - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")

    return df


def upsert_rows(session: Session, df: pd.DataFrame) -> None:
    """Persist stations and usage rows from the provided dataframe."""

    for _, row in df.iterrows():
        station = (
            session.query(MeinradStation)
            .filter(MeinradStation.external_id == str(row["station_id"]))
            .one_or_none()
        )
        if not station:
            station = MeinradStation(
                external_id=str(row["station_id"]),
                name=row["name"],
                lat=float(row["lat"]),
                lng=float(row["lng"]),
            )
            session.add(station)
            session.flush()
        else:
            station.name = row["name"]
            station.lat = float(row["lat"])
            station.lng = float(row["lng"])

        if "capacity" in row and not pd.isna(row.get("capacity")):
            station.capacity = int(row.get("capacity"))
        if "city" in row:
            station.city = row.get("city")

        ts = row.get("timestamp") or row.get("ts")
        parsed_ts = None
        if pd.notna(ts):
            parsed_ts = pd.to_datetime(ts)
        else:
            parsed_ts = datetime.utcnow()

        usage = MeinradUsage(
            station_id=station.id,
            ts=parsed_ts,
            rides_started=int(row.get("rides_started", 0) or 0),
            rides_ended=int(row.get("rides_ended", 0) or 0),
            bikes_available=int(row.get("bikes_available", 0) or 0),
        )
        session.add(usage)

    session.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest meinRad CSV into Postgres")
    parser.add_argument("csv", type=Path, help="Path to meinRad.csv export")
    parser.add_argument("--resolution", type=int, default=8, help="H3 resolution for aggregates")
    args = parser.parse_args()

    with SessionLocal() as session:
        ensure_postgis(session)

    Base.metadata.create_all(bind=engine)

    df = pd.read_csv(args.csv)
    df = normalise_frame(df)

    with SessionLocal() as session:
        upsert_rows(session, df)
        rebuild_station_hex_aggregates(session, resolution=args.resolution)
        create_or_refresh_materialized_view(session)

    print("meinRad ingest completed with refreshed aggregates")


if __name__ == "__main__":
    main()
