# backend/database.py
import os
import socket

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

Base = declarative_base()

DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "imane123")
DB_NAME = os.getenv("DB_NAME", "bikesharing")
DB_PORT = os.getenv("DB_PORT", "5432")

def resolve_host(hostname: str, fallback: str = "localhost") -> str:
    """Return hostname if it resolves, otherwise fall back to localhost.

    This keeps Docker deployments working with the default "db" host while
    allowing local runs to continue even when that hostname is not available.
    """

    try:
        socket.getaddrinfo(hostname, None)
        return hostname
    except socket.gaierror:
        return fallback


DB_HOST = resolve_host(os.getenv("DB_HOST", "localhost"))

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
