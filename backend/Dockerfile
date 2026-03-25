# Save Point Finanças — Backend (FastAPI)
# Multi-arch: works on ARM64 (Oracle Free) and x86_64 (VPS)
FROM python:3.12-slim

WORKDIR /app

# System deps for asyncpg, Pillow, reportlab
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libjpeg62-turbo-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
