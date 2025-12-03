FROM python:3.11-slim

# Arbeitsverzeichnis im Container
WORKDIR /app

# Python Settings
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Requirements kopieren und installieren
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Restliches Projekt kopieren
COPY . .

EXPOSE 8000

# FastAPI starten
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]