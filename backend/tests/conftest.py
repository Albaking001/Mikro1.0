import os
import sys

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models import Base, City, Country, Provider, Station, StationLiveStatus


SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
    session = TestingSessionLocal()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    provider = Provider(name="Test", domain="example.com")
    country = Country(iso="DE", name="Germany")
    city = City(uid=1, name="Mainz", lat=50.0, lng=8.27, zoom=12, provider=provider, country=country)
    station1 = Station(id=1, name="Hauptbahnhof", lat=50.001, lng=8.26, capacity=10, station_number=101, provider=provider, city=city)
    station2 = Station(id=2, name="Universität", lat=50.005, lng=8.24, capacity=20, station_number=102, provider=provider, city=city)

    status1 = StationLiveStatus(station=station1, bikes_available=5, docks_available=5)
    status2 = StationLiveStatus(station=station2, bikes_available=10, docks_available=10)

    session.add_all([provider, country, city, station1, station2, status1, status2])
    session.commit()

    yield session
    session.close()
