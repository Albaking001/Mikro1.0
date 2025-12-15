import re
from pathlib import Path
import pandas as pd

from database import SessionLocal
from models import Provider, Country, City, Station

STATION_NO_RE = re.compile(r"Station\s*Number\s*:\s*(\d+)", re.IGNORECASE)

BASE_DIR = Path(__file__).resolve().parent.parent
FILE_PATH = BASE_DIR / "dataExcel" / "meinRad_Stationen.csv"


def parse_name(label):
    if not isinstance(label, str):
        return None
    return label.split(";")[0].replace("Name:", "").strip()


def parse_station_no(label):
    if not isinstance(label, str):
        return None
    m = STATION_NO_RE.search(label)
    return int(m.group(1)) if m else None


def get_or_create_provider_city(db):
    provider = db.query(Provider).filter(Provider.name == "meinRad").first()
    if not provider:
        provider = Provider(name="meinRad")
        db.add(provider)
        db.flush()

    country = db.query(Country).filter(Country.iso == "DE").first()
    if not country:
        country = Country(iso="DE", name="Germany")
        db.add(country)
        db.flush()

    city = db.query(City).filter(City.name == "Mainz").first()
    if not city:
        city = City(name="Mainz", provider_id=provider.id, country_id=country.id)
        db.add(city)
        db.flush()

    return provider.id, city.id


def run():
    df = pd.read_csv(FILE_PATH, sep=";", encoding="latin1")

    db = SessionLocal()
    provider_id, city_id = get_or_create_provider_city(db)

    inserted = 0

    for _, row in df.iterrows():
        external_id = int(row["id"])
        label = row["label"]

        name = parse_name(label)
        station_number = parse_station_no(label) or external_id

        lat = float(row["latitude"]) / 100_000_000
        lng = float(row["longitude"]) / 100_000_000

        st = db.query(Station).filter_by(external_place_id=external_id).first()
        if not st:
            st = Station(external_place_id=external_id)
            db.add(st)
            inserted += 1

        st.provider_id = provider_id
        st.city_id = city_id
        st.name = name
        st.station_number = station_number
        st.lat = lat
        st.lng = lng
        st.active = True

    db.commit()
    db.close()

    print("DONE. Inserted:", inserted)


if __name__ == "__main__":
    run()
