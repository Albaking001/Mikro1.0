from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt
from typing import Dict, List

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/v1", tags=["context"])


# Simplified context dataset (normally sourced from OSM/Geofabrik and census exports)
CONTEXT_POINTS = [
    {
        "lat": 49.9928,
        "lng": 8.2473,
        "population": 1800,
        "density": 10250,
        "transit_stops": 5,
        "poi_categories": {"cafe": 4, "school": 1, "market": 2},
    },
    {
        "lat": 49.9801,
        "lng": 8.271,
        "population": 2200,
        "density": 8800,
        "transit_stops": 7,
        "poi_categories": {"park": 2, "museum": 1, "cafe": 3},
    },
    {
        "lat": 50.0036,
        "lng": 8.2258,
        "population": 1400,
        "density": 9600,
        "transit_stops": 4,
        "poi_categories": {"university": 1, "cafe": 2, "bakery": 2},
    },
    {
        "lat": 49.996,
        "lng": 8.265,
        "population": 1750,
        "density": 11100,
        "transit_stops": 6,
        "poi_categories": {"school": 2, "food_court": 1, "playground": 2},
    },
]


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lng points."""

    R = 6371000  # Earth radius in meters
    phi1, phi2 = radians(lat1), radians(lat2)
    delta_phi = radians(lat2 - lat1)
    delta_lambda = radians(lon2 - lon1)

    a = sin(delta_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return R * c


def _bucket_id(lat: float, lng: float) -> str:
    """Small helper to mimic hex/tile bucketing without extra deps."""

    return f"hex-{round(lat, 3)}-{round(lng, 3)}"


def _aggregate_layers():
    buckets: Dict[str, Dict[str, object]] = {}

    for point in CONTEXT_POINTS:
        bucket = _bucket_id(point["lat"], point["lng"])
        entry = buckets.setdefault(
            bucket,
            {
                "hexId": bucket,
                "centroid": {"lat": point["lat"], "lng": point["lng"]},
                "population": 0,
                "density": [],
                "transitStops": 0,
                "poiCategories": {},
            },
        )

        entry["population"] += point["population"]
        entry["transitStops"] += point["transit_stops"]
        entry["density"].append(point["density"])

        categories: Dict[str, int] = entry["poiCategories"]  # type: ignore
        for cat, value in point["poi_categories"].items():
            categories[cat] = categories.get(cat, 0) + value

    # finalize density as average
    for entry in buckets.values():
        density_values: List[int] = entry["density"]  # type: ignore
        avg_density = int(sum(density_values) / len(density_values)) if density_values else 0
        entry["density"] = avg_density
        entry["poiCount"] = sum(entry["poiCategories"].values())  # type: ignore

    return list(buckets.values())


AGGREGATED_LAYERS = _aggregate_layers()


@router.get("/context/layers")
def get_context_layers():
    """Return aggregated layers grouped by synthetic hex buckets."""

    return {
        "population": AGGREGATED_LAYERS,
        "density": AGGREGATED_LAYERS,
        "transit": AGGREGATED_LAYERS,
        "pois": AGGREGATED_LAYERS,
    }


@router.get("/context/summary")
def summarize_context(
    lat: float = Query(..., description="Latitude of selected point"),
    lng: float = Query(..., description="Longitude of selected point"),
    radius: int = Query(500, ge=50, le=3000, description="Radius in meters"),
):
    """Compute a light-weight summary of nearby metrics around a point."""

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")

    total_population = 0
    density_values: List[int] = []
    transit_stops = 0
    poi_categories: Dict[str, int] = {}
    contributing_hex: Dict[str, int] = {}

    for point in CONTEXT_POINTS:
        distance = _haversine(lat, lng, point["lat"], point["lng"])
        if distance > radius:
            continue

        total_population += point["population"]
        density_values.append(point["density"])
        transit_stops += point["transit_stops"]

        for cat, value in point["poi_categories"].items():
            poi_categories[cat] = poi_categories.get(cat, 0) + value

        bucket = _bucket_id(point["lat"], point["lng"])
        contributing_hex[bucket] = contributing_hex.get(bucket, 0) + 1

    average_density = int(sum(density_values) / len(density_values)) if density_values else 0
    poi_total = sum(poi_categories.values())

    # Simple sparkline-like history derived from base numbers to visualize trend
    population_history = [max(0, int(total_population * factor)) for factor in (0.65, 0.85, 1, 1.05, 1.1)]
    transit_history = [max(0, int(transit_stops * factor)) for factor in (0.5, 0.75, 1, 1.1, 1.2)]
    poi_history = [max(0, int(poi_total * factor)) for factor in (0.4, 0.8, 1, 1.15, 1.25)]

    return {
        "center": {"lat": lat, "lng": lng},
        "radiusMeters": radius,
        "population": total_population,
        "averageDensity": average_density,
        "transitStops": transit_stops,
        "poiCount": poi_total,
        "poiCategories": poi_categories,
        "contributingHex": list(contributing_hex.keys()),
        "sparklines": {
            "population": population_history,
            "transit": transit_history,
            "pois": poi_history,
        },
    }
