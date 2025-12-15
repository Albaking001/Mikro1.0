# backend/models.py
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry

from database import Base


# ---------- Provider ----------
class Provider(Base):
    __tablename__ = "providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    domain = Column(String)

    # relations
    cities = relationship("City", back_populates="provider", lazy="joined")
    stations = relationship("Station", back_populates="provider", lazy="joined")


# ---------- Country ----------
class Country(Base):
    __tablename__ = "countries"

    id = Column(Integer, primary_key=True, index=True)
    iso = Column(String, unique=True)
    name = Column(String)
    currency = Column(String)
    timezone = Column(String)
    calling_code = Column(String)

    cities = relationship("City", back_populates="country", lazy="joined")


# ---------- City ----------
class City(Base):
    __tablename__ = "cities"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(Integer, ForeignKey("providers.id"))
    country_id = Column(Integer, ForeignKey("countries.id"))
    uid = Column(Integer, unique=True, index=True)
    name = Column(String, nullable=False)
    lat = Column(Float)
    lng = Column(Float)
    zoom = Column(Integer)
    bounds_sw_lat = Column(Float)
    bounds_sw_lng = Column(Float)
    bounds_ne_lat = Column(Float)
    bounds_ne_lng = Column(Float)
    booked_bikes = Column(Integer)
    available_bikes = Column(Integer)

    provider = relationship("Provider", back_populates="cities")
    country = relationship("Country", back_populates="cities")
    stations = relationship("Station", back_populates="city", lazy="joined")


# ---------- Station ----------
class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(Integer, ForeignKey("providers.id"))
    city_id = Column(Integer, ForeignKey("cities.id"))
    external_place_id = Column(Integer, unique=True)
    name = Column(String, nullable=False)
    lat = Column(Float)
    lng = Column(Float)
    capacity = Column(Integer)
    station_number = Column(Integer)
    active = Column(Boolean, default=True)

    city = relationship("City", back_populates="stations")
    provider = relationship("Provider", back_populates="stations")
    live_status = relationship(
        "StationLiveStatus", back_populates="station", cascade="all, delete-orphan"
    )


# ---------- StationLiveStatus ----------
class StationLiveStatus(Base):
    __tablename__ = "station_live_status"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), index=True)
    ts = Column(DateTime, default=datetime.utcnow)
    bikes_available = Column(Integer)
    docks_available = Column(Integer)
    bike_types = Column(JSON)

    station = relationship("Station", back_populates="live_status")


# ---------- meinRad ingest ----------
class MeinradStation(Base):
    __tablename__ = "meinrad_stations"
    __table_args__ = (UniqueConstraint("external_id", name="uq_meinrad_external_id"),)

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    capacity = Column(Integer)
    city = Column(String)

    usage = relationship("MeinradUsage", back_populates="station", cascade="all, delete-orphan")


class MeinradUsage(Base):
    __tablename__ = "meinrad_usage"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("meinrad_stations.id"), index=True)
    ts = Column(DateTime, default=datetime.utcnow, index=True)
    rides_started = Column(Integer, default=0)
    rides_ended = Column(Integer, default=0)
    bikes_available = Column(Integer)

    station = relationship("MeinradStation", back_populates="usage")


# ---------- Aggregates ----------
class StationHexAggregate(Base):
    __tablename__ = "station_hex_aggregates"
    __table_args__ = (UniqueConstraint("hex_id", "resolution", name="uq_hex_res"),)

    id = Column(Integer, primary_key=True)
    hex_id = Column(String, index=True, nullable=False)
    resolution = Column(Integer, index=True, nullable=False)
    total_rides_started = Column(Integer, default=0)
    total_rides_ended = Column(Integer, default=0)
    avg_bikes_available = Column(Float)
    geom = Column(Geometry(geometry_type="POLYGON", srid=4326))

