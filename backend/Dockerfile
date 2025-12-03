FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Guardrail: ensure import scripts are present in the image build context
RUN test -d /app/import_scripts

# Make entrypoint.sh executable inside the image
RUN chmod +x /app/entrypoint.sh

# Document the FastAPI port for clarity when publishing
EXPOSE 8000

CMD ["./entrypoint.sh"]
