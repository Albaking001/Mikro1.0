# backend/database.py
import os
import socket
import time

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import OperationalError

load_dotenv()

Base = declarative_base()

DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "imane123")
DB_NAME = os.getenv("DB_NAME", "bikesharing")
DB_PORT = os.getenv("DB_PORT", "5432")

def resolve_host(hostname: str) -> str:
    """Return hostname after verifying it resolves; raises if it does not."""

    socket.getaddrinfo(hostname, None)
    return hostname


def wait_for_database(engine, retries: int = 10, delay: float = 2.0) -> None:
    """Block until the database accepts connections or retries are exhausted."""

    for attempt in range(1, retries + 1):
        try:
            resolve_host(DB_HOST)
            with engine.connect():
                return
        except (OperationalError, socket.gaierror) as exc:
            if attempt == retries:
                raise
            print(f"[DB WAIT] Attempt {attempt}/{retries} failed: {exc}. Retrying in {delay}s...")
            time.sleep(delay)


DB_HOST = os.getenv("DB_HOST", "db").strip()

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def refresh_collation_version(engine) -> None:
    """Refresh the database collation to silence mismatch warnings on startup.

    ALTER DATABASE cannot run inside a transaction block, so we open an
    autocommit connection explicitly instead of using the scoped session.
    """

    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text(f"ALTER DATABASE {DB_NAME} REFRESH COLLATION VERSION"))
    except Exception as exc:  # pragma: no cover - defensive startup helper
        print(f"[DB] Could not refresh collation version: {exc}")
