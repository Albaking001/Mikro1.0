# backend/services/overpass.py
import time
import requests

# Mehrere Overpass Endpoints 
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]

DEFAULT_TIMEOUT = 45  
DEFAULT_RETRIES = 2  


class OverpassError(Exception):
    pass


def _post_overpass(query: str, timeout: int = DEFAULT_TIMEOUT):
    """
    Try multiple Overpass servers with retries.
    Returns parsed JSON.
    """
    last_err = None

    for base in OVERPASS_URLS:
        for attempt in range(DEFAULT_RETRIES + 1):
            try:
                r = requests.post(base, data={"data": query}, timeout=timeout)
                r.raise_for_status()
                return r.json()
            except Exception as e:
                last_err = e
                # backoff
                time.sleep(1.0 + attempt * 1.5)

    raise OverpassError(f"Overpass failed after retries. Last error: {last_err}")


def _count_elements(query: str) -> int:
    data = _post_overpass(query)
   
    return len(data.get("elements", []))


def _around_clause(lat: float, lng: float, radius_m: int) -> str:
   
    return f"(around:{radius_m},{lat},{lng})"




def count_bus_stops(lat: float, lng: float, radius_m: int) -> int:
    around = _around_clause(lat, lng, radius_m)
    query = f"""
    [out:json][timeout:25];
    (
      node["highway"="bus_stop"]{around};
      node["public_transport"~"platform|stop_position"]["bus"="yes"]{around};
      node["amenity"="bus_station"]{around};
    );
    out;
    """
    return _count_elements(query)


def count_tram_stops(lat: float, lng: float, radius_m: int) -> int:
    around = _around_clause(lat, lng, radius_m)
    query = f"""
    [out:json][timeout:25];
    (
      node["railway"="tram_stop"]{around};
      node["public_transport"~"platform|stop_position"]["tram"="yes"]{around};
    );
    out;
    """
    return _count_elements(query)


def count_rail_stations(lat: float, lng: float, radius_m: int) -> int:
    """
    "Rail" = railway=station oder railway=halt
    """
    around = _around_clause(lat, lng, radius_m)
    query = f"""
    [out:json][timeout:25];
    (
      node["railway"="station"]{around};
      node["railway"="halt"]{around};
    );
    out;
    """
    return _count_elements(query)


def count_sbahn_stations(lat: float, lng: float, radius_m: int) -> int:
    """
    S-Bahn ist in OSM nicht immer perfekt markiert.
    Heuristik: railway=station/halt + network enthält 'S-Bahn' ODER operator/name enthält 'S-Bahn'
    """
    around = _around_clause(lat, lng, radius_m)
    query = f"""
    [out:json][timeout:25];
    (
      node["railway"~"station|halt"]["network"~"S-Bahn",i]{around};
      node["railway"~"station|halt"]["operator"~"S-Bahn",i]{around};
      node["railway"~"station|halt"]["name"~"S-Bahn",i]{around};
    );
    out;
    """
    return _count_elements(query)


def count_ubahn_stations(lat: float, lng: float, radius_m: int) -> int:
    """
    U-Bahn/Subway: station=subway oder railway=subway_entrance oder subway=yes
    """
    around = _around_clause(lat, lng, radius_m)
    query = f"""
    [out:json][timeout:25];
    (
      node["station"="subway"]{around};
      node["railway"="subway_entrance"]{around};
      node["subway"="yes"]{around};
    );
    out;
    """
    return _count_elements(query)




def count_schools_universities(lat: float, lng: float, radius_m: int) -> dict:
    around = _around_clause(lat, lng, radius_m)

    q_schools = f"""
    [out:json][timeout:25];
    (
      node["amenity"="school"]{around};
      node["building"="school"]{around};
    );
    out;
    """
    q_unis = f"""
    [out:json][timeout:25];
    (
      node["amenity"="university"]{around};
      node["amenity"="college"]{around};
      node["building"="university"]{around};
    );
    out;
    """
    return {
        "schools": _count_elements(q_schools),
        "universities": _count_elements(q_unis),
    }


def count_shops(lat: float, lng: float, radius_m: int) -> int:
    around = _around_clause(lat, lng, radius_m)
    query = f"""
    [out:json][timeout:25];
    (
      node["shop"]{around};
    );
    out;
    """
    return _count_elements(query)


def count_pois(lat: float, lng: float, radius_m: int) -> dict:
    """
    POIs: frei erweiterbar.
    Wir geben breakdown + total.
    """
    around = _around_clause(lat, lng, radius_m)

    queries = {
        # Gesundheit
        "hospitals": f"""
        [out:json][timeout:25];
        (
          node["amenity"="hospital"]{around};
          node["amenity"="clinic"]{around};
          node["amenity"="doctors"]{around};
        );
        out;
        """,
        # Arbeit 
        "employers": f"""
        [out:json][timeout:25];
        (
          node["office"]{around};
          node["industrial"]{around};
          node["landuse"="industrial"]{around};
          node["landuse"="commercial"]{around};
        );
        out;
        """,
        # Freizeit
        "parks": f"""
        [out:json][timeout:25];
        (
          node["leisure"="park"]{around};
          node["leisure"="sports_centre"]{around};
          node["leisure"="stadium"]{around};
        );
        out;
        """,
        # Einkaufen/Ankerpunkte
        "malls_supermarkets": f"""
        [out:json][timeout:25];
        (
          node["shop"="supermarket"]{around};
          node["shop"="mall"]{around};
          node["amenity"="marketplace"]{around};
        );
        out;
        """,
        # Tourism/Hotspots
        "tourism": f"""
        [out:json][timeout:25];
        (
          node["tourism"]{around};
          node["historic"]{around};
          node["amenity"="theatre"]{around};
          node["amenity"="cinema"]{around};
        );
        out;
        """,
    }

    breakdown = {}
    total = 0
    for key, q in queries.items():
        c = _count_elements(q)
        breakdown[key] = c
        total += c

    return {"total": total, "breakdown": breakdown}
