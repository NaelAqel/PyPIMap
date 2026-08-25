import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import duckdb
import httpx
import pyarrow as pa
import pyarrow.parquet as pq
from google.cloud import bigquery


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


def get_missed_raw_dates(cwd):
    start_date = date(2005, 3, 21)
    end_date = datetime.now(timezone.utc).date() - timedelta(days=1)

    return [
        day
        for day in (
            start_date + timedelta(days=i)
            for i in range((end_date - start_date).days + 1)
        )
        if not Path(
            f"{cwd}/pipeline/staging/raw_data/year={day.year}/month={day.month:02d}/{day.day:02d}.parquet"
        ).exists()
    ]


def elt_bigquery_to_raw_data(cwd, missing_dates=None):
    missing_dates = missing_dates or []

    if not missing_dates:
        print(
            "All raw data were filled. No need to extract data from BigQuery.\n",
            "If you want to reload a specific date(s), delete that date from ",
            "`/pipeline/staging/raw_data/year={year}/month={month}/{day}.parquet`",
        )
        return []

    print("Connecting to BigQuery ... ", end="")
    client = bigquery.Client(project="syncfolderstogdrive")
    print("Done.")

    with open(f"{cwd}/pipeline/sql/bigquery.sql", "r") as f:
        bigquery_query = f.read()

    with open(f"{cwd}/pipeline/sql/merged_to_raw_data.sql", "r") as f:
        add_active_column_query = f.read()

    raw_schema = pa.schema(
        [
            ("package_name", pa.string()),
            ("normalized_name", pa.string()),
            ("author", pa.string()),
            ("home_page", pa.string()),
            ("requires_dist", pa.list_(pa.string())),
            ("version", pa.string()),
            ("upload_date", pa.timestamp("us", tz="UTC")),
        ]
    )

    with duckdb.connect() as duck_conn:
        for day in missing_dates:
            start_date, end_date = (
                day.strftime("%Y-%m-%d"),
                (day + timedelta(days=1)).strftime("%Y-%m-%d"),
            )
            print(f"  Executing query ... for {start_date} ", end="")
            data = client.query(
                bigquery_query.format(start_date=start_date, end_date=end_date)
            )
            print("Done.")

            output_dir = Path(
                f"{cwd}/pipeline/staging/raw_data/year={day.year}/month={day.month:02d}"
            )
            output_dir.mkdir(parents=True, exist_ok=True)

            print(
                f"  Writing data to `year={day.year}/month={day.month:02d}/{day.day:02d}.parquet` ... ",
                end="",
            )
            with pq.ParquetWriter(
                f"{cwd}/pipeline/staging/tmp.parquet", raw_schema, compression="ZSTD"
            ) as writer:
                for page in data.result(page_size=10_000).pages:
                    rows = [{key: value for key, value in row.items()} for row in page]
                    if rows:
                        writer.write_table(
                            pa.Table.from_pylist(rows, schema=raw_schema)
                        )

            duck_conn.execute(
                add_active_column_query.format(
                    cwd=cwd,
                    file_name=f"{output_dir.resolve()!s}/{day.day:02d}.parquet",
                )
            )
            print("Done.")

    print("Done.\n")

    return missing_dates


def main(cwd):
    print("#################### Starting the ELT Execution ####################")
    get_last_packages(cwd)
    processed_dates = elt_bigquery_to_raw_data(
        cwd=cwd, missing_dates=get_missed_raw_dates(cwd)
    )
    print("####################################################################")

    return processed_dates


if __name__ == "__main__":
    base_folder = Path(__file__).resolve().parent.parent.parent

    main(str(base_folder.resolve()))
