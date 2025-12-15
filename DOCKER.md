# Docker Setup

Dieses Projekt enthält ein gemeinsames Docker-Setup für das Frontend (Vite/React), das FastAPI-Backend und eine PostgreSQL-Datenbank.

## Voraussetzungen
- Docker und Docker Compose

## Dienste
- **db**: PostgreSQL 15 mit PostGIS (Image `postgis/postgis:15-3.4`) und persistentem Volume `db_data`.
- **backend**: FastAPI-Anwendung aus `./backend` auf Port `8000`.
- **frontend**: Ausgelieferte Vite-Builds via Nginx auf Port `80` (leitet `/api/` an das Backend weiter).

## Starten
```bash
docker compose up --build
```

Danach:
- Frontend: http://localhost:80
- Backend: http://localhost:8000 (API unter `/api/v1`)
- Postgres: localhost:5432 (User `postgres`, Passwort `imane123`, DB `bikesharing`)

## Nützliche Befehle
- Container stoppen: `docker compose down`
- Container + Volume entfernen: `docker compose down -v`
- Falls bereits Container mit alten, fest vergebenen Namen existieren (z. B. `bikesharing_db`), diese vor dem Start entfernen: `docker rm -f bikesharing_db bikesharing_backend bikesharing_frontend`
