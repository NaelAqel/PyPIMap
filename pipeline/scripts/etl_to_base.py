import httpx
import pyarrow as pa
import pyarrow.parquet as pq
from google.cloud import bigquery
from pathlib import Path
import duckdb
import re


def get_last_packages(cwd):
    with httpx.Client(follow_redirects=True, timeout=None) as client:
        print("Fetching package list from PyPI ... ", end="")
        response = client.get(
            "https://pypi.org/simple/",
            headers={"Accept": "application/vnd.pypi.simple.v1+json"},
        )
        response.raise_for_status()
        data = response.json()
        print("Successfully retrieved.")

    print("Writing data to `active_packages.parquet` ... ", end="")
    pq.write_table(
        pa.table(
            {
                "name": [row["name"] for row in data["projects"]],
                "normalized_name": [
                    re.sub(r"[-_.]+", "-", row["name"]).lower()
                    for row in data["projects"]
                ],
            }
        ),
        f"{cwd}/pipeline/staging/active_packages.parquet",
        compression="ZSTD",
    )
    print("Done.\n")
    return None


def get_bigquery(cwd):
    print("Connecting to BigQuery ... ", end="")
    client = bigquery.Client(project="syncfolderstogdrive")
    print("Done.")

    with open(f"{cwd}/pipeline/sql/bigquery.sql", "r") as f:
        query = f.read()

    print("Executing query ... ", end="")
    data = client.query(query)
    print("Done.")

    print("Writing data to `pypi_raw.parquet` ... ", end="")
    pq.write_table(
        data.to_arrow(), f"{cwd}/pipeline/staging/pypi_raw.parquet", compression="ZSTD"
    )
    print("Done.\n")

    return None


def final_cleaned_merged_parquet(cwd):
    with open(f"{cwd}/pipeline/sql/cleaned_merged.sql", "r") as f:
        query = f.read()

    print("Start DuckDB ... ", end="")
    with duckdb.connect() as duck_conn:
        print("Done.")

        print("Creating the final parquet after cleaning and merging ... ", end="")
        duck_conn.execute(query.format(cwd=f"{cwd}/pipeline"))
        print("Done.")
    return None


def main(cwd):
    print("#################### Starting the ETL Execution ####################")
    get_last_packages(cwd)
    get_bigquery(cwd)
    final_cleaned_merged_parquet(cwd)
    print("####################################################################")

    return None


if __name__ == "__main__":
    base_folder = Path(__file__).resolve().parent.parent

    main(str(base_folder.resolve()))
