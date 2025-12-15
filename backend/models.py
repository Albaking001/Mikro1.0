# backend/models.py
from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

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
    # ⬇️ هادي لي كانت ناقصة
    live_status = relationship(
        "StationLiveStatus",
        back_populates="station",
        cascade="all, delete-orphan",
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