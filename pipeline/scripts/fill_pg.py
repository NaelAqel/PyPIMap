from pathlib import Path
import duckdb
import psycopg
import argparse
import os


def main(cwd, DB_URL, change_definition=False):
    print("################# Starting Filling Postgres Tables #################")
    print("Connecting to Postgres ... ", end="")

    with psycopg.connect(DB_URL) as pg_conn:
        with pg_conn.cursor() as cursor:
            if change_definition:
                print("\n  Recreate production tables due to schema changes.")
                cursor.execute("drop table if exists pypi.metadata;")
                cursor.execute("drop table if exists pypi.package_connections;")

            with open(f"{cwd}/pipeline/sql/pg_create_tables.sql", "r") as f:
                queries = f.read().split(";")

            for query in queries[:-1]:
                cursor.execute(query)
            pg_conn.commit()
            print("Done.")

            with duckdb.connect() as duck_conn:
                print("Fill staging tables ... ")

                with open(f"{cwd}/pipeline/sql/duckdb_to_pg.sql", "r") as f:
                    queries = f.read().split(";")

                for query in queries[:-1]:
                    query = query.format(cwd=f"{cwd}/pipeline", DB_URL=DB_URL)
                    duck_conn.execute(query)

            # insert into seo_cache_staging
            with open(f"{cwd}/pipeline/sql/insert_to_seo.sql", "r") as f:
                query = f.read()
                cursor.execute(query)
            pg_conn.commit()

            print("Done inserting, finalizing postgres now ... ")

            # finalizing
            with open(f"{cwd}/pipeline/sql/final_step.sql", "r") as f:
                queries = f.read().split(";")
            
            for query in queries[:3]:
                print(f"  Checking {query.strip().split()[3]}")
                if cursor.execute(query).fetchone()[0] < 700000:
                    raise RuntimeError(
                        f"Staging table {query.strip().split()[3]} was not fill properly"
                    )

            # run indexing and analyzing (stage 1)
            for query in queries[3:-5]:
                cursor.execute(query)
            pg_conn.commit()

            # run renaming (staging to production) (stage 2)
            for query in queries[-5:-1]:
                cursor.execute(query)
            pg_conn.commit()

    print("Done.")
    print("####################################################################")
    return None


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
    args = parser.parse_args()

    base_folder = Path(__file__).resolve().parent.parent

    main(
        str(base_folder.resolve()),
        f"postgresql://{args.user}:{args.password}@{args.host}:{args.port}/{args.name}?sslmode={args.sslmode}",
    )
