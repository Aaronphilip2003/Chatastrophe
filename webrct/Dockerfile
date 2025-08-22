FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn[standard] python-multipart

COPY app ./app

ENV RECORDINGS_DIR=/app/recordings \
    HOST=0.0.0.0 \
    PORT=8000 \
    CORS_ORIGINS=*

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
