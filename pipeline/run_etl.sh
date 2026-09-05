#!/bin/bash

set -e

cd /app/etl
source .env

echo "Getting GitHub installation token..."

TOKEN=$(python3 pipeline/github_app_token.py)

echo "Configuring Git authentication..."

git remote set-url origin "https://x-access-token:${TOKEN}@github.com/NaelAqel/PyPIMap.git"

echo "Pulling latest daily_parquet_after_etl..."

git pull --ff-only origin daily_parquet_after_etl

echo "Running ETL..."

docker compose --profile cron run --rm \
    pipeline python -u -m pipeline.etl

echo "Checking for changes..."

git add pipeline/staging/

if git diff --cached --quiet; then
    echo "No new data."
    exit 0
fi

echo "Committing..."

git commit -m "data: $(date +%Y-%m-%d)"

echo "Pushing daily_parquet_after_etl..."

git push origin daily_parquet_after_etl

echo "ETL completed successfully."