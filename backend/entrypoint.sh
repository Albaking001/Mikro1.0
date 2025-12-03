#!/bin/sh
set -e

echo "==> Warte auf Datenbank"
python - <<'PY'
from database import engine, wait_for_database

wait_for_database(engine)
print("[DB WAIT] Database is reachable, continuing with startup")
PY

echo "==> Initialer Import: Cities & Stations"
python import_scripts/import_nextbike.py || echo "[WARN] Import Nextbike failed, continuing without seed data"
python import_scripts/import_stations.py || echo "[WARN] Import stations failed, continuing without seed data"
#python import_scripts/import_heatmap.py || echo "[WARN] Import heatmap failed"

echo "==> Starte Loop für Live-Status (alle 10 Minuten)"
while true; do
  python import_scripts/import_station_live_status.py || echo "[WARN] Live status import failed, retrying in 10 minutes"
 # python import_scripts/import_heatmap.py || echo "[WARN] Heatmap import failed, retrying in 10 minutes"
  echo "Live-Status aktualisiert – warte 10 Minuten..."
  sleep 600   # 600 Sekunden = 10 Minuten
done &


echo "==> Starte FastAPI"
exec uvicorn main:app --host 0.0.0.0 --port 8000
