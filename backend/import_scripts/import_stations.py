# import_stations.py
import requests
import psycopg2

API_BASE = "https://api.nextbike.net/maps/nextbike-live.json"


conn = psycopg2.connect(
    dbname="bikesharing",
    user="postgres",          # DB-User
    password="imane123",      # <-- HNA 7ETTI PASSWORD DIALK
    host="db",
    port=5432,
)
cur = conn.cursor()


cur.execute("SELECT id FROM providers WHERE name = 'Nextbike'")
row = cur.fetchone()
if not row:
    raise Exception("Provider 'Nextbike' nicht gefunden!")
provider_id = row[0]
print("Provider-ID (Nextbike):", provider_id)


cur.execute("""
    SELECT c.id, c.uid, c.name
    FROM cities c
    JOIN countries co ON c.country_id = co.id
    WHERE co.iso = 'DE' AND c.provider_id = %s
    ORDER BY c.id
    LIMIT 20;
""", (provider_id,))

cities = cur.fetchall()
print(f"{len(cities)} Städte gefunden.")


insert_sql = """
    INSERT INTO stations (
        provider_id,
        city_id,
        external_place_id,
        name,
        lat,
        lng,
        capacity,
        station_number,
        active
    )
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON CONFLICT (external_place_id) DO UPDATE
      SET name = EXCLUDED.name,
          lat  = EXCLUDED.lat,
          lng  = EXCLUDED.lng,
          capacity = EXCLUDED.capacity,
          station_number = EXCLUDED.station_number,
          active = EXCLUDED.active;
"""

for city_id, city_uid, city_name in cities:
    print(f"\n==> Lade Stationen für Stadt: {city_name} (uid={city_uid})")

    # API Call: einzelne Stadt
    params = {"city": city_uid}
    res = requests.get(API_BASE, params=params)
    res.raise_for_status()
    data = res.json()

    # Struktur: countries -> cities -> places
    countries = data.get("countries", [])
    if not countries:
        print("  Keine Daten für diese Stadt gefunden.")
        continue


    nb_city = countries[0]["cities"][0]
    places = nb_city.get("places", [])

    print(f"  {len(places)} Stationen gefunden.")

    count = 0
    for place in places:
        external_place_id = place.get("uid") or place.get("place_id")
        if external_place_id is None:
            continue  

        name = place.get("name")
        lat = place.get("lat")
        lng = place.get("lng")
        capacity = place.get("bike_racks") 
        station_number = place.get("number") 
        active = not place.get("is_disabled", False)

        cur.execute(
            insert_sql,
            (
                provider_id,
                city_id,
                external_place_id,
                name,
                lat,
                lng,
                capacity,
                station_number,
                active,
            ),
        )
        count += 1

    conn.commit()
    print(f"  -> {count} Stationen gespeichert/aktualisiert.")

cur.close()
conn.close()
print("\nFERTIG: Alle Stationen importiert ")
