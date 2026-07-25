#!/usr/bin/env python3
"""
Generate server/scripts/demo_history.sql — MySQL-only historical queue data for demo analytics.

Run from server/:
  python scripts/generate_demo_history.py

Re-seeding via seed_redis.py applies this file after CCoFSchema.sql. Redis stays light
(live queue only: entries 1–3 from the base schema).
"""

from __future__ import annotations

import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent / "demo_history.sql"

PARENT_FIRST = [
    "Ashley", "Brian", "Carlos", "Diana", "Ethan", "Fatima", "Grace", "Henry",
    "Isabel", "James", "Karen", "Luis", "Megan", "Nina", "Oscar", "Priya",
    "Quinn", "Rachel", "Samuel", "Tanya", "Uma", "Victor", "Wendy", "Xavier",
    "Yolanda", "Zach", "Alicia", "Ben", "Chloe", "David", "Elena", "Frank",
]
PARENT_LAST = [
    "Adams", "Baker", "Chen", "Davis", "Evans", "Foster", "Gomez", "Harris",
    "Ibrahim", "Johnson", "Kim", "Lopez", "Martin", "Nguyen", "Ortiz", "Patel",
    "Quinn", "Rivera", "Singh", "Torres", "Upton", "Vega", "Walker", "Young",
    "Zhang", "Brooks", "Clark", "Edwards", "Flores", "Green", "Hall", "King",
]
CHILD_FIRST = [
    "Aiden", "Bella", "Caleb", "Daisy", "Eli", "Faith", "Gavin", "Hannah",
    "Ian", "Julia", "Kyle", "Lily", "Mason", "Nora", "Owen", "Piper",
    "Quinn", "Ruby", "Sofia", "Tyler", "Uma", "Violet", "Wyatt", "Zoe",
    "Leo", "Mia", "Noah", "Ella", "Lucas", "Aria",
]
CHILD_LAST = PARENT_LAST
SYMPTOMS = [
    "Fever and sore throat",
    "Persistent cough",
    "Ear pain",
    "Rash on arms",
    "Vomiting",
    "Well-child check",
    "Stomach ache",
    "Pink eye",
    "Seasonal allergies",
    "Sprained ankle",
    "Asthma flare-up",
    "Runny nose and congestion",
    "Headache",
    "Insect bite swelling",
]
STAFF = ["Sarah", "Mike", "Jessica", "Tom"]
HOST = "192.168.1.10"

# Weighted clinic hours — morning + afternoon peaks for chart demos.
HOUR_WEIGHTS: list[tuple[int, int]] = [
    (8, 2), (9, 9), (10, 11), (11, 8), (12, 4), (13, 3), (14, 9), (15, 10), (16, 7), (17, 3),
]

FIRST_REGISTRATION_ID = 6
FIRST_ENTRY_ID = 7
DAYS_BACK = 14
RNG = random.Random(42)


def weighted_hour() -> int:
    hours, weights = zip(*HOUR_WEIGHTS)
    return RNG.choices(list(hours), weights=list(weights), k=1)[0]


def fmt_ts(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%S")


def sql_dt(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


def audit(previous: str, new: str, staff: str, ts: datetime) -> str:
    payload = {
        "timestamp": fmt_ts(ts),
        "previous_status": previous,
        "new_status": new,
        "staff_name": staff,
        "host": HOST,
    }
    return json.dumps(payload, separators=(",", ":"))


def pick_outcome() -> str:
    roll = RNG.random()
    if roll < 0.68:
        return "completed"
    if roll < 0.80:
        return "no_show"
    if roll < 0.88:
        return "parent_cancel"
    return "roomed"


def build_entry(
    entry_id: int,
    registration_id: int,
    child_idx: int,
    parent_last: str,
    checked_in: datetime,
    outcome: str,
    position: int,
) -> tuple[str, str]:
    fname = CHILD_FIRST[(entry_id + child_idx) % len(CHILD_FIRST)]
    lname = parent_last if RNG.random() < 0.85 else CHILD_LAST[(entry_id + child_idx) % len(CHILD_LAST)]
    symptoms = SYMPTOMS[(entry_id + child_idx) % len(SYMPTOMS)]

    arrived_json = "NULL"
    roomed_json = "NULL"
    completed_json = "NULL"
    no_show_json = "NULL"
    status = outcome

    skip_arrived = outcome == "completed" and RNG.random() < 0.18

    if outcome == "completed":
        status = "completed"
        wait_to_arrived = timedelta(minutes=RNG.randint(3, 12))
        wait_to_roomed = timedelta(minutes=RNG.randint(28, 58))
        wait_to_completed = timedelta(minutes=RNG.randint(12, 38))
        arrived_at = checked_in + wait_to_arrived
        roomed_at = checked_in + wait_to_roomed
        completed_at = roomed_at + wait_to_completed
        if not skip_arrived:
            arrived_json = f"'{audit('waiting', 'arrived', RNG.choice(STAFF), arrived_at)}'"
        roomed_json = f"'{audit('arrived' if not skip_arrived else 'waiting', 'roomed', RNG.choice(STAFF), roomed_at)}'"
        completed_json = f"'{audit('roomed', 'completed', RNG.choice(STAFF), completed_at)}'"
    elif outcome == "no_show":
        status = "no_show"
        no_show_at = checked_in + timedelta(minutes=RNG.randint(40, 95))
        no_show_json = f"'{audit('waiting', 'no_show', RNG.choice(STAFF), no_show_at)}'"
    elif outcome == "parent_cancel":
        status = "no_show"
        cancel_at = checked_in + timedelta(minutes=RNG.randint(8, 35))
        no_show_json = f"'{audit('waiting', 'no_show', 'Parent Cancel', cancel_at)}'"
    else:  # roomed — visit ended without completed flag (left early / still in room at close)
        status = "roomed"
        wait_to_arrived = timedelta(minutes=RNG.randint(4, 15))
        wait_to_roomed = timedelta(minutes=RNG.randint(30, 55))
        arrived_at = checked_in + wait_to_arrived
        roomed_at = checked_in + wait_to_roomed
        if not skip_arrived:
            arrived_json = f"'{audit('waiting', 'arrived', RNG.choice(STAFF), arrived_at)}'"
        roomed_json = f"'{audit('arrived' if not skip_arrived else 'waiting', 'roomed', RNG.choice(STAFF), roomed_at)}'"

    entry_sql = (
        f"({entry_id}, {registration_id}, '{fname}', '{lname}', "
        f"'{symptoms.replace(chr(39), chr(39)+chr(39))}', {position}, '{status}', "
        f"{arrived_json}, {roomed_json}, {completed_json}, {no_show_json})"
    )
    return entry_sql, outcome


def families_for_day(day_offset: int) -> int:
    weekday = (date.today() - timedelta(days=day_offset)).weekday()
    if weekday >= 5:
        return RNG.randint(2, 5)
    return RNG.randint(5, 11)


def main() -> None:
    registration_rows: list[str] = []
    entry_rows: list[str] = []

    registration_id = FIRST_REGISTRATION_ID
    entry_id = FIRST_ENTRY_ID

    for day_offset in range(DAYS_BACK, 0, -1):
        day = date.today() - timedelta(days=day_offset)
        family_count = families_for_day(day_offset)

        for family_idx in range(family_count):
            parent_first = PARENT_FIRST[(registration_id + family_idx) % len(PARENT_FIRST)]
            parent_last = PARENT_LAST[(registration_id + family_idx) % len(PARENT_LAST)]
            phone = f"5552{registration_id:06d}"[-10:]
            sms = "TRUE" if RNG.random() < 0.55 else "FALSE"
            notes = "NULL"
            if RNG.random() < 0.12:
                notes = "'Follow-up visit'"
            elif RNG.random() < 0.08:
                notes = "'Spanish preferred'"

            hour = weighted_hour()
            minute = RNG.randint(0, 59)
            checked_in = datetime.combine(day, datetime.min.time()) + timedelta(hours=hour, minutes=minute)

            child_count = RNG.choices([1, 2, 3], weights=[55, 35, 10], k=1)[0]
            registration_rows.append(
                f"({registration_id}, '{parent_first}', '{parent_last}', '{phone}', "
                f"{notes}, {sms}, '{sql_dt(checked_in)}')"
            )

            for child_idx in range(child_count):
                outcome = pick_outcome()
                position = entry_id
                entry_sql, _ = build_entry(
                    entry_id,
                    registration_id,
                    child_idx,
                    parent_last,
                    checked_in + timedelta(minutes=child_idx * RNG.randint(0, 3)),
                    outcome,
                    position,
                )
                entry_rows.append(entry_sql)
                entry_id += 1

            registration_id += 1

    lines = [
        "-- =============================================================================",
        "-- Demo history — MySQL only (not mirrored to Redis).",
        "-- Generated by scripts/generate_demo_history.py — safe to regenerate.",
        "-- Spreads ~14 days of visits with peak-hour weighting for analytics demos.",
        "-- =============================================================================",
        "",
        "USE `ccof_walkin`;",
        "",
        "INSERT INTO `registration` (",
        "    `registrationid`,",
        "    `parent_fname`,",
        "    `parent_lname`,",
        "    `phone`,",
        "    `additional_notes`,",
        "    `sms_opt_in`,",
        "    `checked_in_at`",
        ") VALUES",
        ",\n".join(registration_rows) + ";",
        "",
        "INSERT INTO `queue_entry` (",
        "    `entryid`,",
        "    `registrationid`,",
        "    `fname`,",
        "    `lname`,",
        "    `symptoms`,",
        "    `position`,",
        "    `status`,",
        "    `arrived`,",
        "    `roomed`,",
        "    `completed`,",
        "    `no_show`",
        ") VALUES",
        ",\n".join(entry_rows) + ";",
        "",
        f"ALTER TABLE `registration` AUTO_INCREMENT = {registration_id};",
        f"ALTER TABLE `queue_entry` AUTO_INCREMENT = {entry_id};",
        "",
    ]

    OUTPUT.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUTPUT}")
    print(f"  registrations: {len(registration_rows)} (ids {FIRST_REGISTRATION_ID}–{registration_id - 1})")
    print(f"  queue entries: {len(entry_rows)} (ids {FIRST_ENTRY_ID}–{entry_id - 1})")


if __name__ == "__main__":
    main()
