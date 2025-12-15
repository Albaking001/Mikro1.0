import pytest

from models import Station
from routers.heatmap import get_heatmap
from routers.scoring import ScoreRequest, compute_score
from routers.stations import get_stations


def test_listing_endpoints(db_session):
    stations = get_stations(db_session)
    heatmap = get_heatmap(db_session)

    assert isinstance(stations, list) and len(stations) >= 1
    assert isinstance(heatmap, list) and len(heatmap) >= 1


def test_scoring_endpoint_returns_computed_values(db_session):
    payload = ScoreRequest(
        lat=50.0,
        lng=8.27,
        population=7500,
        pois=[
            {"lat": 50.0005, "lng": 8.2705},
            {"lat": 50.002, "lng": 8.269},
        ],
    )

    data = compute_score(payload, db_session)

    assert "composite_score" in data
    assert 0 <= data["composite_score"] <= 1
    assert data["poi_within_radius"] == 2
    assert data["population_score"] > 0.6


def test_scoring_requires_stations(db_session):
    db_session.query(Station).delete(synchronize_session=False)
    db_session.commit()

    with pytest.raises(Exception):
        compute_score(ScoreRequest(lat=50.0, lng=8.27, population=1000, pois=[]), db_session)
