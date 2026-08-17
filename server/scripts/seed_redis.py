#!/usr/bin/env python3
"""
Reset MySQL + Redis to the predefined seed state (default) or seed from fallback JSON.

Default behavior (MySQL source) resets MySQL from CCoFSchema.sql — dropping the
tables, recreating them, and re-inserting the predefined rows plus ~14 days of
MySQL-only analytics history. Only the live queue (entries 1-3) is mirrored into Redis.

WARNING: the default run is destructive. It wipes ALL MySQL data (including live
check-ins added through the app and audit history). Use --no-reset-schema to instead
mirror the current MySQL live queue into Redis without wiping.

Usage:
  cd server
  pip install -r scripts/requirements.txt
  python scripts/seed_redis.py

  # Mirror current MySQL into Redis without resetting the schema:
  python scripts/seed_redis.py --no-reset-schema

  # Optional fallback source (does not touch MySQL):
  python scripts/seed_redis.py --source json --file public/dummy.json

  # Keep existing queue keys, only add missing (default clears queue:* first):
  python scripts/seed_redis.py --no-clear
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import redis
except ImportError:
    print("Install redis: pip install -r scripts/requirements.txt", file=sys.stderr)
    sys.exit(1)

try:
    import pymysql
    from pymysql.constants import CLIENT
    from pymysql.cursors import DictCursor
except ImportError:
    print("Install pymysql: pip install -r scripts/requirements.txt", file=sys.stderr)
    sys.exit(1)

SERVER_DIR = Path(__file__).resolve().parent.parent
DUMMY_PATH = SERVER_DIR / "public" / "dummy.json"
SCHEMA_PATH = SERVER_DIR / "CCoFSchema.sql"
ENV_PATH = SERVER_DIR / ".env"

LIVE_KEY = "queue:live"
ENTRY_PREFIX = "queue:entry:"


def normalize_checked_in_at(value) -> str:
    """Match server formatDbDatetimeForApi: naive MySQL/Redis datetimes are UTC wall clock."""
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    raw = str(value or "").strip()
    if not raw:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    if raw.endswith("Z"):
        return raw if "." in raw else raw.replace("Z", ".000Z")
    if "T" in raw:
        base = raw.split("+")[0].split(".")[0]
        return f"{base}.000Z"
    return f"{raw.replace(' ', 'T')}.000Z"


def load_dotenv() -> dict[str, str]:
    env: dict[str, str] = {}
    if not ENV_PATH.exists():
        return env
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def load_patients(path: Path) -> list[dict]:
    data = json.loads(path.read_text())
    patients = data.get("patients", data)
    if not isinstance(patients, list) or not patients:
        raise ValueError("dummy.json must contain a non-empty 'patients' array")
    return patients


def resolve_mysql_config(dotenv: dict[str, str]) -> dict:
    def pick(key: str, default: str | None = None) -> str | None:
        return os.environ.get(key) or dotenv.get(key) or default

    host = pick("MYSQL_HOST")
    user = pick("MYSQL_USER")
    password = pick("MYSQL_PASSWORD", "")
    database = pick("MYSQL_DATABASE")
    port = int(pick("MYSQL_PORT", "3306"))

    missing = [name for name, value in {
        "MYSQL_HOST": host,
        "MYSQL_USER": user,
        "MYSQL_DATABASE": database,
    }.items() if not value]
    if missing:
        raise ValueError(f"Missing MySQL config values: {', '.join(missing)}")

    return {
        "host": host,
        "user": user,
        "password": password or "",
        "database": database,
        "port": port,
        "cursorclass": DictCursor,
    }


def run_mysql_sql_file(mysql_config: dict, path: Path, *, connect_without_db: bool = False) -> None:
    if not path.exists():
        raise FileNotFoundError(f"SQL file not found: {path}")

    sql = path.read_text()
    cfg = {**mysql_config, "client_flag": CLIENT.MULTI_STATEMENTS}
    if connect_without_db:
        cfg.pop("database", None)

    conn = pymysql.connect(**cfg)
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            while cursor.nextset():
                pass
        conn.commit()
    finally:
        conn.close()


def reset_mysql_schema(mysql_config: dict) -> None:
    """Drop, recreate, and re-seed MySQL from CCoFSchema.sql (destructive)."""
    run_mysql_sql_file(mysql_config, SCHEMA_PATH, connect_without_db=True)


def load_patients_from_mysql(mysql_config: dict, refresh_checkin_now: bool = True) -> list[dict]:
    conn = pymysql.connect(**mysql_config)
    try:
        with conn.cursor() as cursor:
            if refresh_checkin_now:
                cursor.execute(
                    """
                    SELECT DISTINCT registrationid
                    FROM queue_entry
                    WHERE status IN ('waiting', 'arrived')
                    ORDER BY registrationid ASC
                    """
                )
                live_registration_rows = cursor.fetchall()
                registration_ids = [int(row["registrationid"]) for row in live_registration_rows]
                if registration_ids:
                    placeholders = ",".join(["%s"] * len(registration_ids))
                    cursor.execute(
                        f"UPDATE registration SET checked_in_at = NOW() WHERE registrationid IN ({placeholders})",
                        registration_ids,
                    )
                    conn.commit()

            cursor.execute(
                """
                SELECT
                    q.entryid,
                    q.registrationid,
                    q.fname,
                    q.lname,
                    q.symptoms,
                    q.position,
                    q.status,
                    r.checked_in_at
                FROM queue_entry q
                JOIN registration r ON r.registrationid = q.registrationid
                WHERE q.status IN ('waiting', 'arrived')
                ORDER BY q.position ASC, q.entryid ASC
                """
            )
            rows = cursor.fetchall()
    finally:
        conn.close()

    patients: list[dict] = []
    for row in rows:
        checked_in_at_str = normalize_checked_in_at(row.get("checked_in_at"))

        patients.append(
            {
                "entryid": int(row["entryid"]),
                "registrationid": int(row["registrationid"]),
                "fname": row["fname"],
                "lname": row["lname"],
                "symptoms": row["symptoms"],
                "position": int(row["position"]),
                "status": row["status"],
                "checked_in_at": checked_in_at_str,
            }
        )
    return patients


def clear_queue(r: redis.Redis) -> int:
    deleted = 0
    deleted += r.delete(LIVE_KEY)
    for key in r.scan_iter(match=f"{ENTRY_PREFIX}*"):
        deleted += r.delete(key)
    return deleted


def seed(r: redis.Redis, patients: list[dict]) -> None:
    pipe = r.pipeline(transaction=True)
    for p in patients:
        entry_id = str(p["entryid"])
        position = int(p["position"])
        checked_in_at = normalize_checked_in_at(p.get("checked_in_at"))
        redis_entry = {
            "entryid": p["entryid"],
            "registrationid": p["registrationid"],
            "fname": p["fname"],
            "lname": p["lname"],
            "symptoms": p["symptoms"],
            "checked_in_at": checked_in_at,
            "position": position,
            "status": p["status"],
        }
        pipe.zadd(LIVE_KEY, {entry_id: position})
        pipe.set(f"{ENTRY_PREFIX}{entry_id}", json.dumps(redis_entry))
    pipe.execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Redis from MySQL live queue (or JSON fallback).")
    parser.add_argument(
        "--source",
        choices=["mysql", "json"],
        default="mysql",
        help="Seed source (default: mysql)",
    )
    parser.add_argument(
        "--keep-checkin-times",
        action="store_true",
        help="When --source=mysql, keep existing registration.checked_in_at values",
    )
    parser.add_argument(
        "--no-reset-schema",
        action="store_true",
        help=(
            "When --source=mysql, do NOT reset MySQL from CCoFSchema.sql first. "
            "Default behavior wipes MySQL and re-seeds the predefined rows."
        ),
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=DUMMY_PATH,
        help="Path to dummy JSON when --source=json (default: public/dummy.json)",
    )
    parser.add_argument(
        "--no-clear",
        action="store_true",
        help="Do not delete existing queue:live / queue:entry:* keys first",
    )
    parser.add_argument(
        "--redis-url",
        default=None,
        help="Redis URL (else REDIS_URL env or server/.env)",
    )
    args = parser.parse_args()

    dotenv = load_dotenv()
    redis_url = args.redis_url or os.environ.get("REDIS_URL") or dotenv.get("REDIS_URL")

    if not redis_url:
        print("Set REDIS_URL in server/.env or pass --redis-url", file=sys.stderr)
        sys.exit(1)

    if args.source == "mysql":
        try:
            mysql_config = resolve_mysql_config(dotenv)
            if not args.no_reset_schema:
                reset_mysql_schema(mysql_config)
                print(
                    "Reset MySQL from CCoFSchema.sql "
                    "(live queue + ~14 days analytics history)"
                )
            patients = load_patients_from_mysql(mysql_config, refresh_checkin_now=not args.keep_checkin_times)
        except Exception as exc:
            print(f"MySQL load failed: {exc}", file=sys.stderr)
            sys.exit(1)
    else:
        patients = load_patients(args.file)

    r = redis.from_url(redis_url, decode_responses=True)

    try:
        pong = r.ping()
    except redis.RedisError as e:
        print(f"Redis connection failed: {e}", file=sys.stderr)
        sys.exit(1)

    if not args.no_clear:
        removed = clear_queue(r)
        print(f"Cleared queue keys ({removed} deleted)")

    seed(r, patients)
    print(f"PING: {pong}")
    print(f"Seed source: {args.source}")
    print(f"Seeded {len(patients)} patients into Redis:")
    for p in patients:
        print(
            f"  #{p['entryid']} pos {p['position']} "
            f"{p['fname']} {p['lname']} ({p['status']})"
        )
    print("\nOpen http://localhost:8080/staff.html (with npm run dev) to view the queue.")


if __name__ == "__main__":
    main()
