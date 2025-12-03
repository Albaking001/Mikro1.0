# Mikromobilität

Dieses Projekt besteht aus einem React/Vite-Frontend und einem FastAPI-Backend mit PostgreSQL-Datenbank. Die bereitgestellte Docker-Umgebung startet alle Komponenten gemeinsam, sodass keine lokale Toolchain mehr nötig ist.

## Voraussetzungen
- Docker 20+ und Docker Compose Plugin

### Docker Installations-Tutorial (Windows, macOS, Linux)
Folge den Schritten für dein Betriebssystem. Am Ende findest du die Prüf-Befehle.

#### Windows (mit WSL2)
1. **WSL2 aktivieren** (falls noch nicht geschehen):
   ```powershell
   wsl --install
   ```
   Danach den Rechner neu starten.
2. **Docker Desktop installieren**: Lade die Windows-Installer-Datei von https://www.docker.com/products/docker-desktop herunter und führe sie aus.
3. **Einstellungen prüfen**:
   - Stelle sicher, dass unter „Settings → General“ die Option "Use WSL 2 based engine" aktiviert ist.
   - Falls du einen bestimmten WSL-Distro nutzen willst, aktiviere ihn unter „Settings → Resources → WSL Integration“.
4. **Starten**: Docker Desktop öffnen und warten, bis unten links „Docker Desktop is running“ erscheint.

#### macOS (Intel oder Apple Silicon)
1. **Download**: Lade die passende DMG für deine Architektur von https://www.docker.com/products/docker-desktop herunter.
2. **Installation**: DMG öffnen, „Docker.app“ in den Programme-Ordner ziehen und starten. Beim ersten Start werden Kernel-Erweiterungen oder Virtualisierungsrechte abgefragt (erlauben).
3. **Autostart optional**: In den Einstellungen („Preferences“) kann „Start Docker Desktop when you log in“ aktiviert werden, damit Docker automatisch bereitsteht.

#### Linux (Debian/Ubuntu)
1. **Alte Pakete entfernen (falls vorhanden)**:
   ```bash
   sudo apt-get remove -y docker docker-engine docker.io containerd runc
   ```
2. **Repository vorbereiten und Schlüssel installieren**:
   ```bash
   sudo apt-get update
   sudo apt-get install -y ca-certificates curl gnupg
   sudo install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update
   ```
3. **Docker Engine + Compose Plugin installieren**:
   ```bash
   sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```
4. **Nutzer in die Docker-Gruppe aufnehmen (optional, erspart sudo)**:
   ```bash
   sudo usermod -aG docker "$USER"
   # danach ab- und wieder anmelden oder: newgrp docker
   ```
5. **Dienst starten und aktivieren**:
   ```bash
   sudo systemctl enable --now docker
   ```

#### Installation prüfen
```bash
docker --version          # sollte die Client/Engine-Version anzeigen
docker compose version    # sollte das Compose Plugin anzeigen
docker run hello-world    # lädt das Test-Image und bestätigt die Engine-Funktion
```
Falls ein Befehl fehlt, erneut PATH- bzw. Gruppenrechte prüfen (unter Linux ggf. neu anmelden).

## Projektstruktur
- `frontend` (Root): React + Vite Code
- `backend/`: FastAPI-API und Datenbankanbindung
- `docker-compose.yml`: Startet Frontend, Backend und PostgreSQL gemeinsam

## Von Installation bis zum laufenden Stack (Schnellstart)
1. **Docker installieren** – befolge das Tutorial oben für dein Betriebssystem.
2. **Quellcode holen**:
   ```bash
   git clone <dieses-repo>
   cd Mikro1.0
   ```
3. **Images bauen & Services starten** (erstellt automatisch die Docker-Images und startet alle Container):
   ```bash
   docker compose up --build
   ```
   - Möchtest du im Hintergrund starten, nutze `docker compose up -d`.
4. **Verfügbarkeit prüfen**:
   - `docker ps` sollte die Container `bikesharing_db`, `bikesharing_backend` und `mikromobilitaet_frontend` anzeigen.
   - Logs ansehen: `docker compose logs -f` (Strg+C beendet die Logausgabe, nicht die Container).
5. **Endpunkte aufrufen**:
   - Frontend: http://localhost:5173
   - Backend (FastAPI): http://localhost:8000
   - PostgreSQL: Port 5432 (lokal gebunden)
6. **Aufräumen**:
   - Container stoppen und Netzwerk entfernen: `docker compose down`
   - Optional auch das persistente Volume löschen (entfernt Datenbankinhalte): `docker compose down -v`

Docker kümmert sich um die Reihenfolge: Der Backend-Container wartet, bis die Datenbank gesund ist. Daten werden persistent im benannten Volume `db_data` abgelegt.

## Nur Backend mit Datenbank starten
Falls du ausschließlich das Backend und die Datenbank nutzen möchtest, kannst du im Ordner `backend/` den vorhandenen Compose-Stack starten:
```bash
cd backend
docker compose up --build
```

## Nützliche Befehle
- Docker-Logausgabe verfolgen: `docker compose logs -f`
- Container im Hintergrund starten: `docker compose up -d`
- Alle Services stoppen: `docker compose down`

## Entwicklung ohne Docker
- Frontend: `npm install` und `npm run dev`
- Backend: Python 3.11, `pip install -r backend/requirements.txt`, Start via `uvicorn backend.main:app --reload`
