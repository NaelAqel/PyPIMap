from pathlib import Path
import logging
from logging.handlers import RotatingFileHandler
import argparse
import os
from pipeline.scripts.etl_to_raw_data import main as etl_to_raw
from pipeline.scripts.fill_pg import main as fill_pg

# start the logger
logger = logging.getLogger(__name__)


def main(cwd, DB_URL, seed_only=False, recreate_tables=False):
    # config the logger
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - [%(levelname)s] - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # scilent httpx logging
    logging.getLogger("httpx").setLevel(logging.WARNING)

    try:
        # run the etl pipeline
        logger.info("\n")
        logger.info("=" * 40)
        logger.info("NEW ETL RUN STARTED.")

        processed_dates = None

        if not seed_only:
            logger.info("Extracting from Sources to `pipeline/staging/raw_data/`")
            processed_dates = etl_to_raw(cwd)

        logger.info("Filling Postgres Tables")
        fill_pg(cwd, DB_URL, recreate_tables, processed_dates)
        logger.info("ETL Finished")
    except Exception as e:
        print(f"ERROR Happened: {e}")
        logger.error("Error happened", exc_info=True)
        raise

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
    parser.add_argument(
        "--seed-only", action="store_true", help="Skip `script/etl_to_raw_data`"
    )
    # this parameter to be added in case of changing production tables definitions
    parser.add_argument(
        "--recreate-tables", action="store_true", help="Change pg tables definitions"
    )
    args = parser.parse_args()

    base_folder = Path(__file__).resolve().parent.parent

    main(
        str(base_folder.resolve()),
        f"postgresql://{args.user}:{args.password}@{args.host}:{args.port}/{args.name}?sslmode={args.sslmode}",
        args.seed_only,
        args.recreate_tables,
    )
