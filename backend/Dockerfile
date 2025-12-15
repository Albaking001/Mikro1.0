FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY . .


RUN chmod +x /app/entrypoint.sh


EXPOSE 8000

CMD ["./entrypoint.sh"]
