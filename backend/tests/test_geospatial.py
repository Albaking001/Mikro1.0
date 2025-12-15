from services.geospatial import (
    CoverageResult,
    haversine_distance_meters,
    normalize_value,
    poi_coverage,
    score_location,
)


def test_haversine_distance_matches_fixture():
    main_station = (50.001, 8.26)
    university = (50.005, 8.24)

    distance = haversine_distance_meters(main_station, university)

    # Known distance between the points (approx. 1.6 km)
    assert 1400 < distance < 1700


def test_normalize_clamps_and_scales():
    assert normalize_value(5, 0, 10) == 0.5
    assert normalize_value(-5, 0, 10) == 0.0
    assert normalize_value(15, 0, 10) == 1.0
    assert normalize_value(10, 10, 10) == 0.0


def test_poi_coverage_counts_within_radius():
    center = (50.0, 8.27)
    pois = [(50.001, 8.26), (50.02, 8.29), (49.99, 8.25)]

    result: CoverageResult = poi_coverage(center, pois, radius_m=2000)

    assert result.points_within_radius == 2
    assert 0.0 < result.coverage_ratio <= 1.0
    assert result.nearest_distance_m < 1500


def test_score_location_combines_population_and_access():
    center = (50.0, 8.27)
    stations = [(50.001, 8.26), (50.005, 8.24)]
    pois = [(50.0005, 8.2705), (49.999, 8.269)]

    score = score_location(center, stations, pois, population=5000)

    assert 0 <= score["composite_score"] <= 1
    assert score["station_access_score"] > 0.5
    assert score["population_score"] == 0.5
    assert score["poi_coverage_ratio"] == 1.0
    assert score["poi_within_radius"] == 2
