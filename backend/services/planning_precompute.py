import math
import json
from pathlib import Path
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models import City, Station
from services.overpass import (
    fetch_bus_stops_bbox,
    fetch_schools_bbox,
    fetch_universities_bbox,
    fetch_shops_bbox,
)

EARTH_R = 6371000.0  # meters


class PrecomputeError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def slugify_city(name: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in name).strip("_")


def latlng_to_xy(lat: float, lng: float, lat0: float, lng0: float) -> tuple[float, float]:
    dlat = math.radians(lat - lat0)
    dlng = math.radians(lng - lng0)
    x = EARTH_R * dlng * math.cos(math.radians(lat0))
    y = EARTH_R * dlat
    return x, y


def meters_to_deg_lat(m: float) -> float:
    return m / 111320.0


def meters_to_deg_lng(m: float, at_lat: float) -> float:
    return m / (111320.0 * math.cos(math.radians(at_lat)))


def build_bins(
    points_xy: list[tuple[float, float]],
    bin_size: float,
) -> dict[tuple[int, int], list[tuple[float, float]]]:
    bins: dict[tuple[int, int], list[tuple[float, float]]] = {}
    for x, y in points_xy:
        ix = int(math.floor(x / bin_size))
        iy = int(math.floor(y / bin_size))
        bins.setdefault((ix, iy), []).append((x, y))
    return bins


def count_in_radius(
    bins: dict[tuple[int, int], list[tuple[float, float]]],
    x: float,
    y: float,
    radius: float,
    bin_size: float,
) -> int:
    r2 = radius * radius
    ix = int(math.floor(x / bin_size))
    iy = int(math.floor(y / bin_size))
    c = 0
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            pts = bins.get((ix + dx, iy + dy))
            if not pts:
                continue
            for px, py in pts:
                if (px - x) ** 2 + (py - y) ** 2 <= r2:
                    c += 1
    return c


def nearest_distance(
    bins: dict[tuple[int, int], list[tuple[float, float]]],
    x: float,
    y: float,
    bin_size: float,
    max_rings: int = 8,
) -> float | None:
    best = None
    ix0 = int(math.floor(x / bin_size))
    iy0 = int(math.floor(y / bin_size))
    for ring in range(0, max_rings + 1):
        found_any = False
        for ix in range(ix0 - ring, ix0 + ring + 1):
            for iy in range(iy0 - ring, iy0 + ring + 1):
                pts = bins.get((ix, iy))
                if not pts:
                    continue
                found_any = True
                for px, py in pts:
                    d = math.hypot(px - x, py - y)
                    if best is None or d < best:
                        best = d
        if found_any and best is not None:
            return best
    return best


def score_formula(
    schools: int,
    universities: int,
    shops: int,
    bus_stops: int,
    stations_in_radius: int,
    nearest_station_dist_m: float | None,
) -> int:
    rail = 0  # Bug wie Frontend (railway_stations)
    weighted = schools * 2 + universities * 3 + shops * 0.5 + bus_stops * 0.5 + rail * 1.5
    dist = nearest_station_dist_m or 0.0
    distance_bonus = min(20, round(dist / 100))
    coverage_penalty = min(30, stations_in_radius * 3)
    raw = weighted + distance_bonus - coverage_penalty
    if not (math.isfinite(raw) and raw > 0):
        return 0
    normalized = round((raw / (raw + 60)) * 100)
    return max(0, min(100, int(normalized)))


def ensure_city_bounds(db: Session, city: City, city_name: str) -> None:
    if (
        city.bounds_sw_lat is not None
        and city.bounds_sw_lng is not None
        and city.bounds_ne_lat is not None
        and city.bounds_ne_lng is not None
    ):
        return

    stations = (
        db.query(Station)
        .join(City, City.id == Station.city_id)
        .filter(City.id == city.id)
        .filter(Station.lat.isnot(None))
        .filter(Station.lng.isnot(None))
        .all()
    )
    if not stations:
        if city.lat is None or city.lng is None:
            raise PrecomputeError(
                f"City '{city_name}' missing bounds_* and no station or city coords available.",
                status_code=400,
            )

        min_lat = float(city.lat) - 0.05
        max_lat = float(city.lat) + 0.05
        min_lng = float(city.lng) - 0.05
        max_lng = float(city.lng) + 0.05

        city.bounds_sw_lat = min_lat
        city.bounds_sw_lng = min_lng
        city.bounds_ne_lat = max_lat
        city.bounds_ne_lng = max_lng
        db.commit()
        return

    lats = [float(s.lat) for s in stations]
    lngs = [float(s.lng) for s in stations]
    min_lat, max_lat = min(lats), max(lats)
    min_lng, max_lng = min(lngs), max(lngs)
    if min_lat == max_lat:
        min_lat -= 0.01
        max_lat += 0.01
    if min_lng == max_lng:
        min_lng -= 0.01
        max_lng += 0.01

    city.bounds_sw_lat = min_lat
    city.bounds_sw_lng = min_lng
    city.bounds_ne_lat = max_lat
    city.bounds_ne_lng = max_lng
    db.commit()


def precompute_planning_scores(
    db: Session,
    city_name: str,
    step_m: int,
    radius_m: int,
) -> tuple[Path, dict]:
    city = db.query(City).filter(City.name.ilike(city_name)).first()
    if not city:
        raise PrecomputeError(f"City '{city_name}' not found in DB.", status_code=404)

    ensure_city_bounds(db, city, city_name)

    sw_lat, sw_lng = float(city.bounds_sw_lat), float(city.bounds_sw_lng)
    ne_lat, ne_lng = float(city.bounds_ne_lat), float(city.bounds_ne_lng)

    lat0 = (sw_lat + ne_lat) / 2.0
    lng0 = (sw_lng + ne_lng) / 2.0

    step_lat = meters_to_deg_lat(step_m)
    step_lng = meters_to_deg_lng(step_m, lat0)

    origin_center_lat = sw_lat + step_lat / 2.0
    origin_center_lng = sw_lng + step_lng / 2.0

    ny = int(math.floor((ne_lat - origin_center_lat) / step_lat)) + 1
    nx = int(math.floor((ne_lng - origin_center_lng) / step_lng)) + 1
    if nx <= 0 or ny <= 0:
        raise PrecomputeError("Computed grid size invalid. Check city bounds or step_m.")

    pad_lat = meters_to_deg_lat(radius_m)
    pad_lng = meters_to_deg_lng(radius_m, lat0)
    osm_sw_lat, osm_sw_lng = sw_lat - pad_lat, sw_lng - pad_lng
    osm_ne_lat, osm_ne_lng = ne_lat + pad_lat, ne_lng + pad_lng

    bus_pts = fetch_bus_stops_bbox(osm_sw_lat, osm_sw_lng, osm_ne_lat, osm_ne_lng)
    school_pts = fetch_schools_bbox(osm_sw_lat, osm_sw_lng, osm_ne_lat, osm_ne_lng)
    uni_pts = fetch_universities_bbox(osm_sw_lat, osm_sw_lng, osm_ne_lat, osm_ne_lng)
    shop_pts = fetch_shops_bbox(osm_sw_lat, osm_sw_lng, osm_ne_lat, osm_ne_lng)

    bus_xy = [latlng_to_xy(p["lat"], p["lng"], lat0, lng0) for p in bus_pts]
    school_xy = [latlng_to_xy(p["lat"], p["lng"], lat0, lng0) for p in school_pts]
    uni_xy = [latlng_to_xy(p["lat"], p["lng"], lat0, lng0) for p in uni_pts]
    shop_xy = [latlng_to_xy(p["lat"], p["lng"], lat0, lng0) for p in shop_pts]

    bin_size = float(radius_m)
    bus_bins = build_bins(bus_xy, bin_size)
    school_bins = build_bins(school_xy, bin_size)
    uni_bins = build_bins(uni_xy, bin_size)
    shop_bins = build_bins(shop_xy, bin_size)

    stations = (
        db.query(Station)
        .join(City, City.id == Station.city_id)
        .filter(City.name.ilike(city_name))
        .filter(Station.lat.isnot(None))
        .filter(Station.lng.isnot(None))
        .all()
    )
    station_xy = [latlng_to_xy(float(s.lat), float(s.lng), lat0, lng0) for s in stations]
    station_bins = build_bins(station_xy, bin_size)

    points_out: list[dict] = []
    total = 0

    for iy in range(ny):
        lat = origin_center_lat + iy * step_lat
        for ix in range(nx):
            lng = origin_center_lng + ix * step_lng

            x, y = latlng_to_xy(lat, lng, lat0, lng0)

            schools = count_in_radius(school_bins, x, y, radius_m, bin_size)
            universities = count_in_radius(uni_bins, x, y, radius_m, bin_size)
            shops = count_in_radius(shop_bins, x, y, radius_m, bin_size)
            bus_stops = count_in_radius(bus_bins, x, y, radius_m, bin_size)

            stations_in_radius = count_in_radius(station_bins, x, y, radius_m, bin_size)
            nearest_m = nearest_distance(station_bins, x, y, bin_size)

            score = score_formula(
                schools, universities, shops, bus_stops, stations_in_radius, nearest_m
            )

            points_out.append(
                {
                    "ix": int(ix),
                    "iy": int(iy),
                    "lat": round(lat, 6),
                    "lng": round(lng, 6),
                    "score": int(score),
                }
            )
            total += 1

    base = Path(__file__).resolve().parents[1]
    out_dir = base / "precomputed"
    out_dir.mkdir(parents=True, exist_ok=True)

    slug = slugify_city(city_name)
    out_path = out_dir / f"planning_{slug}_step{step_m}_r{radius_m}.json"

    payload = {
        "meta": {
            "city_name": city_name,
            "bbox": {"sw_lat": sw_lat, "sw_lng": sw_lng, "ne_lat": ne_lat, "ne_lng": ne_lng},
            "step_m": step_m,
            "radius_m": radius_m,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "points_total": total,
            "origin_center": {"lat": origin_center_lat, "lng": origin_center_lng},
            "step_lat": step_lat,
            "step_lng": step_lng,
            "nx": nx,
            "ny": ny,
        },
        "points": points_out,
    }

    out_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return out_path, payload
