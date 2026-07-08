FROM docker.io/library/python:3.11-slim

WORKDIR /app

# Install compilation tools needed for heavy libraries like DuckDB/Pandas
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY pipeline/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Container logs will stream immediately to stdout without buffering
ENV PYTHONUNBUFFERED=1

CMD ["python", "-u", "pipeline/etl.py"]