# FastAPI backend + static frontend (same origin when run as one Web Service).
# Render: Web Service, root Dockerfile, empty root directory.
FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ /app/
# api._frontend_dir() resolves parent.parent / "frontend" → /frontend in this image
COPY frontend/ /frontend/

ENV PYTHONUNBUFFERED=1
# Render and others set PORT
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
