#!/usr/bin/env python3
"""
Push the demo seed to Cloud SQL (MySQL) and Redis in one step.

Reads connection settings from server/.env (same as the Node API):
  MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
  REDIS_URL  (local redis:// or Redis Cloud rediss://)

Typical Cloud SQL workflow:
  1. Start the Cloud SQL Auth Proxy (separate terminal):
       cloud-sql-proxy --port 3307 PROJECT:REGION:INSTANCE
  2. Set server/.env, e.g. MYSQL_HOST=127.0.0.1 MYSQL_PORT=3307
  3. Run from server/:
       pip install -r scripts/requirements.txt
       python scripts/seed_both.py

Default (destructive): reload CCoFSchema.sql into MySQL, refresh live check-in
times, clear queue:* in Redis, mirror the live queue (entries 1–3).

Safer mirror (no MySQL wipe):
       python scripts/seed_both.py --mirror-only
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import redis  # noqa: E402

import seed_redis as seed  # noqa: E402


def test_mysql(mysql_config: dict) -> None:
    import pymysql

    conn = pymysql.connect(**mysql_config)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 AS ok")
            row = cursor.fetchone()
            if not row or row.get("ok") != 1:
                raise RuntimeError("MySQL ping failed")
    finally:
        conn.close()


def test_redis(r: redis.Redis) -> None:
    if not r.ping():
        raise RuntimeError("Redis ping failed")


def verify_mirror(mysql_config: dict, r: redis.Redis, patients: list[dict]) -> None:
    live_count = r.zcard(seed.LIVE_KEY)
    if live_count != len(patients):
        raise RuntimeError(
            f"Live queue count mismatch: MySQL has {len(patients)} rows, "
            f"Redis queue:live has {live_count} members"
        )

    mismatches: list[str] = []
    for patient in patients:
        entry_id = str(patient["entryid"])
        score = r.zscore(seed.LIVE_KEY, entry_id)
        if score is None:
            mismatches.append(f"entry {entry_id} missing from Redis queue:live")
            continue
        if int(score) != int(patient["position"]):
            mismatches.append(
                f"entry {entry_id} position MySQL={patient['position']} Redis={int(score)}"
            )

        raw = r.get(f"{seed.ENTRY_PREFIX}{entry_id}")
        if not raw:
            mismatches.append(f"entry {entry_id} missing Redis JSON payload")
            continue

        stored = json.loads(raw)
        mysql_checked_in = seed.normalize_checked_in_at(patient.get("checked_in_at"))
        redis_checked_in = seed.normalize_checked_in_at(stored.get("checked_in_at"))
        if mysql_checked_in != redis_checked_in:
            mismatches.append(
                f"entry {entry_id} checked_in_at MySQL={mysql_checked_in} Redis={redis_checked_in}"
            )
        if stored.get("status") != patient.get("status"):
            mismatches.append(
                f"entry {entry_id} status MySQL={patient.get('status')} Redis={stored.get('status')}"
            )

    if mismatches:
        raise RuntimeError("MySQL/Redis sync verification failed:\n  - " + "\n  - ".join(mismatches))


def push_both(
    *,
    mirror_only: bool,
    keep_checkin_times: bool,
    no_clear: bool,
    redis_url: str,
    dotenv: dict[str, str],
) -> None:
    mysql_config = seed.resolve_mysql_config(dotenv)

    print("Testing MySQL connection…")
    try:
        test_mysql(mysql_config)
    except Exception as exc:
        print(
            f"MySQL connection failed: {exc}\n"
            "Check server/.env and that Cloud SQL Auth Proxy is running if using Cloud SQL.",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"  OK ({mysql_config['host']}:{mysql_config['port']}/{mysql_config['database']})")

    print("Testing Redis connection…")
    r = redis.from_url(redis_url, decode_responses=True)
    try:
        test_redis(r)
    except redis.RedisError as exc:
        print(f"Redis connection failed: {exc}", file=sys.stderr)
        sys.exit(1)
    print(f"  OK ({redis_url.split('@')[-1] if '@' in redis_url else redis_url})")

    if not mirror_only:
        print(f"Loading schema from {seed.SCHEMA_PATH.name} into MySQL…")
        seed.reset_mysql_schema(mysql_config)
        print("  MySQL reset complete (live queue + demo analytics history)")
    else:
        print("Skipping MySQL schema reset (--mirror-only)")

    patients = seed.load_patients_from_mysql(
        mysql_config,
        refresh_checkin_now=not keep_checkin_times,
    )
    print(f"MySQL live queue: {len(patients)} entr{'y' if len(patients) == 1 else 'ies'}")

    if not no_clear:
        removed = seed.clear_queue(r)
        print(f"Cleared Redis queue keys ({removed} deleted)")

    seed.seed(r, patients)
    print(f"Redis live queue: seeded {len(patients)} entr{'y' if len(patients) == 1 else 'ies'}")

    verify_mirror(mysql_config, r, patients)
    print("Verified MySQL and Redis are in sync.")

    print("\nLive queue:")
    for patient in patients:
        print(
            f"  #{patient['entryid']} pos {patient['position']} "
            f"{patient['fname']} {patient['lname']} ({patient['status']}) "
            f"@ {patient.get('checked_in_at', '')}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Push demo seed to Cloud SQL (MySQL) and Redis together."
    )
    parser.add_argument(
        "--mirror-only",
        action="store_true",
        help="Do not reset MySQL; only mirror the current MySQL live queue into Redis",
    )
    parser.add_argument(
        "--keep-checkin-times",
        action="store_true",
        help="Keep existing registration.checked_in_at values in MySQL (default refreshes to NOW())",
    )
    parser.add_argument(
        "--no-clear",
        action="store_true",
        help="Do not delete existing queue:live / queue:entry:* keys before seeding Redis",
    )
    parser.add_argument(
        "--redis-url",
        default=None,
        help="Redis URL override (else REDIS_URL from env or server/.env)",
    )
    args = parser.parse_args()

    dotenv = seed.load_dotenv()
    redis_url = args.redis_url or os.environ.get("REDIS_URL") or dotenv.get("REDIS_URL")
    if not redis_url:
        print("Set REDIS_URL in server/.env or pass --redis-url", file=sys.stderr)
        sys.exit(1)

    if not args.mirror_only:
        print(
            "WARNING: This will wipe and reload MySQL from CCoFSchema.sql, "
            "then replace the Redis live queue.\n"
        )

    push_both(
        mirror_only=args.mirror_only,
        keep_checkin_times=args.keep_checkin_times,
        no_clear=args.no_clear,
        redis_url=redis_url,
        dotenv=dotenv,
    )
    print("\nDone. Restart the API or wait for the next queue update to pick up changes.")


if __name__ == "__main__":
    main()
