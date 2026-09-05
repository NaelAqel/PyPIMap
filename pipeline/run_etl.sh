```bash
#!/bin/bash
set -e

echo "Running original ETL..."
cd /app/prod
docker compose --profile cron run --rm pipeline python -u -m pipeline.etl

echo "Getting GitHub installation token..."
set -a
source /app/prod/.env
set +a
TOKEN=$(python3 /app/prod/pipeline/github_app_token.py)

echo "Updating ETL data worktree..."
cd /app/etl
git remote set-url origin "https://x-access-token:${TOKEN}@github.com/NaelAqel/PyPIMap.git"
git pull --ff-only origin daily_parquet_after_etl

echo "Copying new raw data..."
cp -a /app/prod/pipeline/staging/raw_data/. /app/etl/pipeline/staging/raw_data/

echo "Checking for changes..."
git add pipeline/staging/raw_data/

if git diff --cached --quiet; then
    echo "No new data."
    exit 0
fi

echo "Committing..."
git commit -m "data: $(date +%Y-%m-%d)"

echo "Pushing daily_parquet_after_etl..."
git push origin daily_parquet_after_etl

echo "ETL completed successfully."
```
