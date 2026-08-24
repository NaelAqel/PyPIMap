import argparse
import os
from datetime import date, timedelta
from pathlib import Path

import duckdb
import psycopg


def main(cwd, DB_URL, recreate_tables=False, processing_dates=None):
    print("################# Starting Filling Postgres Tables #################")
    print("Connecting to Postgres ... ", end="")

    if processing_dates is None:
        processing_dates = [date.today() - timedelta(days=1)]

    with psycopg.connect(DB_URL) as pg_conn, pg_conn.cursor() as cursor:
        if recreate_tables:
            print("\n  Recreate production tables due to schema changes.")

            with open(f"{cwd}/pipeline/sql/pg_create_tables.sql", "r") as f:
                queries = f.read().split(";")

            for query in queries[:-1]:
                cursor.execute(query)
            pg_conn.commit()
            print("Done.")

            with duckdb.connect() as duck_conn:
                print("Fill production tables ... ", end="")

                with open(f"{cwd}/pipeline/sql/duckdb_to_pg_migration.sql", "r") as f:
                    queries = f.read().split(";")

                for query in queries[:-1]:
                    query = query.replace("{cwd}", cwd).replace("{DB_URL}", DB_URL)
                    duck_conn.execute(query)

                with open(f"{cwd}/pipeline/sql/pg_direct_migration.sql", "r") as f:
                    queries = f.read().split(";")

                for query in queries[:-1]:
                    query = query.replace("{cwd}", cwd).replace("{DB_URL}", DB_URL)
                    cursor.execute(query)
                print("Done")
        else:
            for processing_date in sorted(processing_dates):
                with duckdb.connect() as duck_conn:
                    print(f"Fill production tables for {processing_date}... ", end="")

                    with open(f"{cwd}/pipeline/sql/duckdb_to_pg.sql", "r") as f:
                        queries = f.read().split(";")

                    for query in queries[:-1]:
                        query = query.replace("{cwd}", cwd)
                        query = query.replace("{DB_URL}", DB_URL)
                        query = query.replace("{year}", str(processing_date.year))
                        query = query.replace("{month}", f"{processing_date.month:02d}")
                        query = query.replace("{day}", f"{processing_date.day:02d}")

                        duck_conn.execute(query)

                    with open(f"{cwd}/pipeline/sql/pg_direct.sql", "r") as f:
                        queries = f.read().split(";")

                    for query in queries[:-1]:
                        query = query.replace("{cwd}", cwd)
                        query = query.replace("{DB_URL}", DB_URL)
                        query = query.replace("{year}", str(processing_date.year))
                        query = query.replace("{month}", f"{processing_date.month:02d}")
                        query = query.replace("{day}", f"{processing_date.day:02d}")
                        cursor.execute(query)

                    print("Done.")

        pg_conn.commit()

    print("Done.")
    print("####################################################################")


if __name__ == "__main__":
    # Will get the pg info by argparse or env
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--user", default=os.environ.get("POSTGRES_USER_WRITE", "user_write")
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("POSTGRES_PASSWORD_WRITE", "user_write_password"),
    )
    parser.add_argument(
        "--host", default=os.environ.get("POSTGRES_HOST", "postgres_db")
    )
    parser.add_argument("--name", default=os.environ.get("POSTGRES_DB", "pg_db"))
    parser.add_argument("--port", default="5432")
    parser.add_argument(
        "--sslmode", default=os.environ.get("POSTGRES_SSLMODE", "prefer")
    )
    parser.add_argument(
        "--recreate-tables", action="store_true", help="Change pg tables definitions"
    )
    args = parser.parse_args()

    base_folder = Path(__file__).resolve().parent.parent.parent

    main(
        str(base_folder.resolve()),
        f"postgresql://{args.user}:{args.password}@{args.host}:{args.port}/{args.name}?sslmode={args.sslmode}",
        args.recreate_tables,
    )
