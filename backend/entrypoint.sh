#!/bin/sh
set -e

echo "==> Initialer Import: Cities & Stations"
python import_scripts/import_nextbike.py
python import_scripts/import_stations.py
#python import_scripts/import_heatmap.py

echo "==> Starte Loop für Live-Status (alle 10 Minuten)"
while true; do
  python import_scripts/import_station_live_status.py
 # python import_scripts/import_heatmap.py
  echo "Live-Status aktualisiert – warte 10 Minuten..."
  sleep 600   # 600 Sekunden = 10 Minuten
done &


echo "==> Starte FastAPI"
uvicorn main:app --host 0.0.0.0 --port 8000
