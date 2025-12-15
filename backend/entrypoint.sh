#!/bin/sh
set -e

echo "==> Waiting for DB..."
python - <<'PY'
import os, time
import psycopg2

host = os.getenv("DB_HOST", "db")
port = int(os.getenv("DB_PORT", "5432"))
user = os.getenv("DB_USER", "postgres")
password = os.getenv("DB_PASSWORD", "imane123")
dbname = os.getenv("DB_NAME", "bikesharing")

for i in range(60):
    try:
        conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname)
        conn.close()
        print("DB is ready.")
        break
    except Exception as e:
        print(f"DB not ready yet ({i+1}/60): {e}")
        time.sleep(1)
else:
    raise SystemExit("DB did not become ready in time")
PY

echo "==> Creating tables (if not exist)..."
python - <<'PY'
import models  
from database import engine, Base
Base.metadata.create_all(bind=engine)
print("Tables ensured.")
PY

echo "==> Checking if meinRad stations already exist (Mainz)..."
HAS_MAINZ=$(
python - <<'PY'
from database import SessionLocal
from models import Station, City

db = SessionLocal()
count = (
    db.query(Station)
      .join(City)
      .filter(City.name == "Mainz")
      .count()
)
db.close()
print("1" if count > 0 else "0")
PY
)

if [ "$HAS_MAINZ" = "0" ]; then
  echo "==> Importing meinRad stations (initial seed)"
  python -m import_scripts.import_meinrad_stations || echo "[WARN] meinRad import failed, continuing"
else
  echo "==> meinRad stations already present, skipping import"
fi

echo "==> Initialer Import: Cities & Stations (Nextbike)"
python import_scripts/import_nextbike.py || echo "[WARN] Import Nextbike failed, continuing"

echo "==> Starte Loop für Live-Status (alle 10 Minuten)"
(
  while true; do
    python import_scripts/import_station_live_status.py || echo "[WARN] Live status import failed, retrying in 10 minutes"
    echo "Live-Status aktualisiert – warte 10 Minuten..."
    sleep 600
  done
) &

echo "==> Starte FastAPI"
exec uvicorn main:app --host 0.0.0.0 --port 8000