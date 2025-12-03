# import_nextbike.py
import requests
import psycopg2

API_URL = "https://api.nextbike.net/maps/nextbike-live.json?list_cities=1"


conn = psycopg2.connect(
    dbname="bikesharing",
    user="postgres",          # dein DB-User
    password="imane123", # dein Passwort
    host="db",
    port=5432,
)
cur = conn.cursor()

# Provider-ID holen
cur.execute("SELECT id FROM providers WHERE name = 'Nextbike'")
row = cur.fetchone()

# Provider automatisch anlegen, falls er fehlt
if not row:
    cur.execute(
        "INSERT INTO providers (name, domain) VALUES (%s, %s) RETURNING id;",
        ("Nextbike", "nextbike"),
    )
    provider_id = cur.fetchone()[0]
else:
    provider_id = row[0]
print("Hole Daten von Nextbike API…")
res = requests.get(API_URL)
res.raise_for_status()
data = res.json()

# Länder + Städte speichern
for country in data["countries"]:
    # 1) Country
    cur.execute("""
        INSERT INTO countries (iso, name, currency, timezone, calling_code)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (iso) DO UPDATE
          SET name = EXCLUDED.name,
              currency = EXCLUDED.currency,
              timezone = EXCLUDED.timezone,
              calling_code = EXCLUDED.calling_code
        RETURNING id;
    """, (
        country.get("country"),
        country.get("country_name"),
        country.get("currency"),
        country.get("timezone"),
        country.get("country_calling_code"),
    ))
    country_id = cur.fetchone()[0]

    # 2) Cities
    for city in country.get("cities", []):
        bounds = city.get("bounds", {})
        sw = bounds.get("south_west", {})
        ne = bounds.get("north_east", {})

        cur.execute("""
            INSERT INTO cities (
              provider_id,
              country_id,
              uid,
              name,
              lat,
              lng,
              zoom,
              bounds_sw_lat,
              bounds_sw_lng,
              bounds_ne_lat,
              bounds_ne_lng,
              booked_bikes,
              available_bikes
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (uid) DO UPDATE
              SET name = EXCLUDED.name,
                  lat  = EXCLUDED.lat,
                  lng  = EXCLUDED.lng,
                  zoom = EXCLUDED.zoom,
                  booked_bikes    = EXCLUDED.booked_bikes,
                  available_bikes = EXCLUDED.available_bikes
            RETURNING id;
        """, (
            provider_id,
            country_id,
            city["uid"],
            city["name"],
            city.get("lat"),
            city.get("lng"),
            city.get("zoom"),
            sw.get("lat"),
            sw.get("lng"),
            ne.get("lat"),
            ne.get("lng"),
            city.get("booked_bikes"),
            city.get("available_bikes"),
        ))
        city_id = cur.fetchone()[0]
        print("Gespeichert:", country.get("country_name"), "-", city["name"])

conn.commit()
cur.close()
conn.close()
print("FERTIG ")
