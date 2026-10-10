#!/bin/bash
set -euo pipefail

cd /app/prod

set -a
source /app/prod/.env
set +a

echo "Running ETL..."
docker compose --profile cron run --rm pipeline python -u -m pipeline.etl

echo "Dumping PostgreSQL..."

docker compose exec -T postgres_db \
    pg_dump \
    --username="${POSTGRES_USER:-admin}" \
    --dbname="${POSTGRES_DB:-pg_db}" \
    --format=custom \
    --no-owner \
    --no-acl \
    > /app/prod/pipeline/staging/pypimap_db.dump.tmp

mv /app/prod/pipeline/staging/pypimap_db.dump.tmp \
   /app/prod/pipeline/staging/pypimap_db.dump

echo "Getting GitHub installation token..."
TOKEN=$(python3 /app/prod/pipeline/github_app_token.py)

echo "Updating ETL data worktree..."
cd /app/etl
git remote set-url origin "https://x-access-token:${TOKEN}@github.com/NaelAqel/PyPIMap.git"
git pull --ff-only origin daily_parquet_after_etl

echo "Copying new raw data..."
rsync -a --delete /app/prod/pipeline/staging/raw_data/ /app/etl/pipeline/staging/raw_data/
cp -a /app/prod/pipeline/staging/pypimap_db.dump /app/etl/pipeline/staging/pypimap_db.dump

echo "Checking for changes..."
git add pipeline/staging/raw_data/ pipeline/staging/pypimap_db.dump

if git diff --cached --quiet; then
    echo "No new data."
    exit 0
fi

echo "Committing..."
git commit -m "ETL for $(date -d 'yesterday' +%Y-%m-%d)"

echo "Pushing daily_parquet_after_etl..."
git push origin daily_parquet_after_etl

echo "ETL completed successfully."
