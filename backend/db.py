"""SQLite storage for the claims pilot, seeded from the data folder."""

import json
import sqlite3
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

SCHEMA = """
CREATE TABLE IF NOT EXISTS records (
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS claims (
    claim_id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    state TEXT NOT NULL,
    decision TEXT,
    payout REAL,
    reason TEXT,
    policy_section TEXT,
    paid_amount REAL,
    signed_off_by TEXT
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL
);
"""

WORKFLOW_COLUMNS = (
    "state",
    "decision",
    "payout",
    "reason",
    "policy_section",
    "paid_amount",
    "signed_off_by",
)


def connect(path: str) -> sqlite3.Connection:
    """Open the database, seeding it from the data folder if it has no claims yet."""
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    if conn.execute("SELECT 1 FROM claims LIMIT 1").fetchone() is None:
        seed(conn)
    return conn


def read_data(name: str) -> Any:
    """Read a JSON file from the data folder."""
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def seed(conn: sqlite3.Connection) -> None:
    """Load the reference records and the claims queue, all claims waiting."""
    records = [
        ("company", "company", read_data("company.json")),
        *(("policy", p["policy_id"], p) for p in read_data("policies.json")),
        *(("customer", c["customer_id"], c) for c in read_data("customers.json")),
        *(("plan", p["plan"], p) for p in read_data("plans.json")["plans"]),
        *(("handler", h["handler_id"], h) for h in read_data("handlers.json")),
    ]
    conn.executemany(
        "INSERT INTO records (kind, id, body) VALUES (?, ?, ?)",
        [(kind, id_, json.dumps(body)) for kind, id_, body in records],
    )
    for claim in read_data("claims.json"):
        body = {key: value for key, value in claim.items() if key != "status"}
        conn.execute(
            "INSERT INTO claims (claim_id, body, state) VALUES (?, ?, 'waiting')",
            (claim["claim_id"], json.dumps(body)),
        )
    conn.commit()


def record(conn: sqlite3.Connection, kind: str, id_: str) -> dict[str, Any] | None:
    """Return one reference record, or None if there is none."""
    row = conn.execute(
        "SELECT body FROM records WHERE kind = ? AND id = ?", (kind, id_)
    ).fetchone()
    return json.loads(row["body"]) if row else None


def records(conn: sqlite3.Connection, kind: str) -> list[dict[str, Any]]:
    """Return every reference record of one kind."""
    rows = conn.execute(
        "SELECT body FROM records WHERE kind = ? ORDER BY id", (kind,)
    ).fetchall()
    return [json.loads(row["body"]) for row in rows]


CLAIM_SELECT = """
SELECT claim_id, body, state, decision, payout, reason, policy_section,
    paid_amount, signed_off_by,
    (SELECT kind FROM events WHERE events.claim_id = claims.claim_id
        ORDER BY id DESC LIMIT 1) AS last_step
FROM claims
"""


def _claim_from_row(row: sqlite3.Row) -> dict[str, Any]:
    """Join a claim's filed body with its workflow state and latest step."""
    columns = (*WORKFLOW_COLUMNS, "last_step")
    return json.loads(row["body"]) | {key: row[key] for key in columns}


def claim(conn: sqlite3.Connection, claim_id: str) -> dict[str, Any] | None:
    """Return a claim as filed, with its workflow state, or None if there is none."""
    row = conn.execute(CLAIM_SELECT + " WHERE claim_id = ?", (claim_id,)).fetchone()
    return _claim_from_row(row) if row else None


def claims(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Return every claim in queue order."""
    rows = conn.execute(CLAIM_SELECT + " ORDER BY claim_id").fetchall()
    return [_claim_from_row(row) for row in rows]


def update_claim(conn: sqlite3.Connection, claim_id: str, **values: Any) -> None:
    """Set workflow columns on a claim. The column names are fixed in the code."""
    assignments = ", ".join(f"{key} = ?" for key in values)
    conn.execute(
        f"UPDATE claims SET {assignments} WHERE claim_id = ?",  # noqa: S608
        (*values.values(), claim_id),
    )
    conn.commit()


def company(conn: sqlite3.Connection) -> dict[str, Any]:
    """Return the company settings."""
    row = conn.execute("SELECT body FROM records WHERE kind = 'company'").fetchone()
    return json.loads(row["body"])


def add_event(
    conn: sqlite3.Connection, claim_id: str, actor: str, kind: str, text: str
) -> None:
    """Append a step to a claim's history."""
    conn.execute(
        "INSERT INTO events (claim_id, actor, kind, text) VALUES (?, ?, ?, ?)",
        (claim_id, actor, kind, text),
    )
    conn.commit()


def events(conn: sqlite3.Connection, claim_id: str) -> list[dict[str, Any]]:
    """Return a claim's steps in the order they happened."""
    rows = conn.execute(
        "SELECT actor, kind, text FROM events WHERE claim_id = ? ORDER BY id",
        (claim_id,),
    ).fetchall()
    return [dict(row) for row in rows]
