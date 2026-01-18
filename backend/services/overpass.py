# backend/services/overpass.py
import time
import requests
from collections import OrderedDict
from threading import Lock

# Mehrere Overpass Endpoints 
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]

DEFAULT_TIMEOUT = 15
DEFAULT_RETRIES = 2
QUERY_TIMEOUT_BBOX = 15
QUERY_TIMEOUT_AROUND = 10
CACHE_TTL_SECONDS = 120
MAX_CACHE_SIZE = 512

_cache_lock = Lock()
_overpass_cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()


class OverpassError(Exception):
    pass


def _post_overpass(query: str, timeout: int = DEFAULT_TIMEOUT):
    """
    Try multiple Overpass servers with retries.
    Returns parsed JSON.
    """
    now = time.time()
    stale_data = None
    with _cache_lock:
        cached = _overpass_cache.get(query)
        if cached:
            ts, data = cached
            if now - ts < CACHE_TTL_SECONDS:
                _overpass_cache.move_to_end(query)
                return data
            stale_data = data
            _overpass_cache.pop(query, None)

    last_err = None

    for base in OVERPASS_URLS:
        for attempt in range(DEFAULT_RETRIES + 1):
            try:
                r = requests.post(base, data={"data": query}, timeout=timeout)
                r.raise_for_status()
                data = r.json()
                with _cache_lock:
                    _overpass_cache[query] = (time.time(), data)
                    _overpass_cache.move_to_end(query)
                    while len(_overpass_cache) > MAX_CACHE_SIZE:
                        _overpass_cache.popitem(last=False)
                return data
            except Exception as e:
                last_err = e
                # backoff
                time.sleep(0.5 + attempt * 0.75)

    if stale_data is not None:
        return stale_data

    raise OverpassError(f"Overpass failed after retries. Last error: {last_err}")


def _count_elements(query: str) -> int:
    data = _post_overpass(query)
   
    return len(data.get("elements", []))


def _around_clause(lat: float, lng: float, radius_m: int) -> str:
   
    return f"(around:{radius_m},{lat},{lng})"

from typing import Any

def _bbox_clause(sw_lat: float, sw_lng: float, ne_lat: float, ne_lng: float) -> str:
    # Overpass bbox: (south,west,north,east)
    return f"({sw_lat},{sw_lng},{ne_lat},{ne_lng})"

def _fetch_nodes(query: str) -> list[dict[str, float]]:
    data = _post_overpass(query)
    pts: list[dict[str, float]] = []
    for el in data.get("elements", []):
        if el.get("type") == "node" and "lat" in el and "lon" in el:
            pts.append({"lat": float(el["lat"]), "lng": float(el["lon"])})
    return pts

def fetch_bus_stops_bbox(sw_lat: float, sw_lng: float, ne_lat: float, ne_lng: float) -> list[dict[str, float]]:
    bbox = _bbox_clause(sw_lat, sw_lng, ne_lat, ne_lng)
    query = f"""
    [out:json][timeout:{QUERY_TIMEOUT_BBOX}];
    (
      node["highway"="bus_stop"]{bbox};
      node["public_transport"~"platform|stop_position"]["bus"="yes"]{bbox};
      node["amenity"="bus_station"]{bbox};
    );
    out;
    """
    return _fetch_nodes(query)

def fetch_schools_bbox(sw_lat: float, sw_lng: float, ne_lat: float, ne_lng: float) -> list[dict[str, float]]:
    bbox = _bbox_clause(sw_lat, sw_lng, ne_lat, ne_lng)
    query = f"""
    [out:json][timeout:{QUERY_TIMEOUT_BBOX}];
    (
      node["amenity"="school"]{bbox};
      node["building"="school"]{bbox};
    );
    out;
    """
    return _fetch_nodes(query)

def fetch_universities_bbox(sw_lat: float, sw_lng: float, ne_lat: float, ne_lng: float) -> list[dict[str, float]]:
    bbox = _bbox_clause(sw_lat, sw_lng, ne_lat, ne_lng)
    query = f"""
    [out:json][timeout:{QUERY_TIMEOUT_BBOX}];
    (
      node["amenity"="university"]{bbox};
      node["amenity"="college"]{bbox};
    );
    out;
    """
    return _fetch_nodes(query)

def fetch_shops_bbox(sw_lat: float, sw_lng: float, ne_lat: float, ne_lng: float) -> list[dict[str, float]]:
    bbox = _bbox_clause(sw_lat, sw_lng, ne_lat, ne_lng)
    query = f"""
    [out:json][timeout:{QUERY_TIMEOUT_BBOX}];
    (
      node["shop"]{bbox};
    );
    out;
    """
    return _fetch_nodes(query)

def fetch_rail_stations_bbox(sw_lat: float, sw_lng: float, ne_lat: float, ne_lng: float) -> list[dict[str, float]]:
    bbox = _bbox_clause(sw_lat, sw_lng, ne_lat, ne_lng)
    query = f"""
    [out:json][timeout:{QUERY_TIMEOUT_BBOX}];
    (
      node["railway"="station"]{bbox};
      node["railway"="halt"]{bbox};
    );
    out;
    """
    return _fetch_nodes(query)



def count_bus_stops(lat: float, lng: float, radius_m: int) -> int:
    around = _around_clause(lat, lng, radius_m)
    query = f"""
    [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
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
    [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
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
    [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
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
    [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
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
    [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
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
    [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
    (
      node["amenity"="school"]{around};
      node["building"="school"]{around};
    );
    out;
    """
    q_unis = f"""
    [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
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
    [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
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
        [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
        (
          node["amenity"="hospital"]{around};
          node["amenity"="clinic"]{around};
          node["amenity"="doctors"]{around};
        );
        out;
        """,
        # Arbeit 
        "employers": f"""
        [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
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
        [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
        (
          node["leisure"="park"]{around};
          node["leisure"="sports_centre"]{around};
          node["leisure"="stadium"]{around};
        );
        out;
        """,
        # Einkaufen/Ankerpunkte
        "malls_supermarkets": f"""
        [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
        (
          node["shop"="supermarket"]{around};
          node["shop"="mall"]{around};
          node["amenity"="marketplace"]{around};
        );
        out;
        """,
        # Tourism/Hotspots
        "tourism": f"""
        [out:json][timeout:{QUERY_TIMEOUT_AROUND}];
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
