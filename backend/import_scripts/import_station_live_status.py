# import_station_live_status.py
import json
import requests
import psycopg2
from datetime import datetime, timezone

API_BASE = "https://api.nextbike.net/maps/nextbike-live.json"


conn = psycopg2.connect(
    dbname="bikesharing",
    user="postgres",          # dein DB-User
    password="imane123",      # HIER dein Passwort
    host="db",
    port=5432,
)
cur = conn.cursor()


cur.execute("SELECT id FROM providers WHERE name = 'Nextbike'")
row = cur.fetchone()
if not row:
    raise Exception("Provider 'Nextbike' nicht gefunden!")
provider_id = row[0]
print("Provider-ID:", provider_id)


# 1) Stations + zugehörige city_uid aus DB laden
#    (nur Deutschland, damit es nicht zu groß wird)

cur.execute("""
    SELECT
        s.id          AS station_id,
        s.external_place_id,
        c.uid         AS city_uid
    FROM stations s
    JOIN cities c      ON s.city_id = c.id
    JOIN countries co  ON c.country_id = co.id
    WHERE co.iso = 'DE' AND s.provider_id = %s
""", (provider_id,))

rows = cur.fetchall()
print("Stations aus DB:", len(rows))

# Mapping: city_uid -> { external_place_id -> station_id }
city_map = {}
for station_id, external_place_id, city_uid in rows:
    city_map.setdefault(city_uid, {})
    city_map[city_uid][int(external_place_id)] = station_id

print("Städte im Mapping:", len(city_map))



# 2) Pro Stadt Live-Daten abholen und speichern


insert_sql = """
    INSERT INTO station_live_status (
        station_id,
        ts,
        bikes_available,
        docks_available,
        bike_types
    )
    VALUES (%s, %s, %s, %s, %s)
"""

now = datetime.now(timezone.utc)
total_snapshots = 0

for city_uid, station_dict in city_map.items():
    print(f"\n==> Lade Live-Status für city_uid={city_uid}, "
          f"{len(station_dict)} Stations in DB")

    # API-Call für diese Stadt
    res = requests.get(API_BASE, params={"city": city_uid})
    res.raise_for_status()
    data = res.json()

    countries = data.get("countries", [])
    if not countries:
        print("  Keine Daten von API für diese Stadt.")
        continue

    # Meistens ist unsere Stadt das erste Element
    nb_city = countries[0]["cities"][0]
    places = nb_city.get("places", [])
    print("  Places in API:", len(places))

    count_city = 0

    for place in places:
        # externe ID der Station
        ext_id = place.get("uid") or place.get("place_id")
        if ext_id is None:
            continue

        try:
            ext_id_int = int(ext_id)
        except (TypeError, ValueError):
            continue

        # station_id in unserer DB finden
        station_id = station_dict.get(ext_id_int)
        if not station_id:
            # Station existiert (noch) nicht in unserer stations-Tabelle
            continue

        # Anzahl verfügbarer Räder
        bikes = place.get("bikes")
        if bikes is None:
            # manchmal ist es ein Array (bike_numbers)
            bike_numbers = place.get("bike_numbers") or []
            bikes = len(bike_numbers)

        # Kapazität aus DB? -> haben wir in 'capacity'
        # hier nehmen wir API-Feld 'bike_racks' als Fallback
        capacity = place.get("bike_racks")
        docks_available = None
        if capacity is not None and bikes is not None:
            try:
                docks_available = int(capacity) - int(bikes)
            except Exception:
                docks_available = None

        bike_types = place.get("bike_types")  # ist bereits ein dict

        cur.execute(
            insert_sql,
            (
                station_id,
                now,
                bikes,
                docks_available,
                json.dumps(bike_types) if bike_types is not None else None,
            ),
        )
        count_city += 1
        total_snapshots += 1

    conn.commit()
    print(f"  -> {count_city} Live-Snapshots gespeichert.")

cur.close()
conn.close()
print(f"\nFERTIG   Insgesamt {total_snapshots} Snapshots gespeichert.")
