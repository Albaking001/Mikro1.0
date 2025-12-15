from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, List, Tuple


Coordinate = Tuple[float, float]


def haversine_distance_meters(origin: Coordinate, target: Coordinate) -> float:
    """Calculate great-circle distance between two WGS84 coordinates in meters."""
    lat1, lon1 = origin
    lat2, lon2 = target

    # convert decimal degrees to radians
    lat1_rad, lon1_rad, lat2_rad, lon2_rad = map(math.radians, [lat1, lon1, lat2, lon2])

    d_lat = lat2_rad - lat1_rad
    d_lon = lon2_rad - lon1_rad

    a = math.sin(d_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(d_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return 6371_000 * c  # Earth radius in meters


def normalize_value(value: float, minimum: float, maximum: float) -> float:
    """Normalize a value to the range [0, 1], clamping out-of-range inputs."""
    if maximum == minimum:
        return 0.0

    clamped = max(minimum, min(maximum, value))
    return (clamped - minimum) / (maximum - minimum)


@dataclass
class CoverageResult:
    nearest_distance_m: float
    points_within_radius: int
    coverage_ratio: float


def poi_coverage(center: Coordinate, pois: Iterable[Coordinate], radius_m: float) -> CoverageResult:
    poi_list: List[Coordinate] = list(pois)
    distances = [haversine_distance_meters(center, poi) for poi in poi_list]

    within_radius = [distance for distance in distances if distance <= radius_m]
    nearest_distance = min(distances) if distances else float("inf")
    ratio = len(within_radius) / len(poi_list) if poi_list else 0.0

    return CoverageResult(nearest_distance_m=nearest_distance, points_within_radius=len(within_radius), coverage_ratio=ratio)


def score_location(
    center: Coordinate,
    station_coords: Iterable[Coordinate],
    pois: Iterable[Coordinate],
    population: int,
    *,
    max_station_distance: float = 2000,
    max_population: int = 10000,
    coverage_radius: float = 500,
) -> dict:
    stations_list: List[Coordinate] = list(station_coords)
    station_distances = [haversine_distance_meters(center, station) for station in stations_list]
    nearest_station = min(station_distances) if station_distances else float("inf")

    coverage = poi_coverage(center, pois, coverage_radius)

    station_score = 1 - normalize_value(nearest_station, 0, max_station_distance)
    population_score = normalize_value(population, 0, max_population)

    # POI coverage: reward both density within radius and proximity to closest POI
    proximity_score = 1 - normalize_value(coverage.nearest_distance_m, 0, coverage_radius * 2)
    coverage_score = coverage.coverage_ratio

    composite = (station_score * 0.4) + (population_score * 0.3) + (coverage_score * 0.2) + (proximity_score * 0.1)

    return {
        "nearest_station_distance_m": nearest_station,
        "station_access_score": round(station_score, 4),
        "population_score": round(population_score, 4),
        "poi_coverage_ratio": round(coverage.coverage_ratio, 4),
        "poi_within_radius": coverage.points_within_radius,
        "poi_proximity_score": round(proximity_score, 4),
        "composite_score": round(composite, 4),
    }
