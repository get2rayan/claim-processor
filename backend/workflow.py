"""The claim workflow: the states a claim moves through and the payment rule."""

import sqlite3
from typing import Any

from fastapi import HTTPException

from backend import db
from backend.models import Decision


def get_claim(conn: sqlite3.Connection, claim_id: str) -> dict[str, Any]:
    """Return a claim, or raise 404 if there is none."""
    claim = db.claim(conn, claim_id)
    if claim is None:
        raise HTTPException(404, f"No claim {claim_id}")
    return claim


def start_claim(conn: sqlite3.Connection, claim_id: str) -> dict[str, Any]:
    """Move a waiting claim to in progress."""
    if get_claim(conn, claim_id)["state"] != "waiting":
        raise HTTPException(409, "Only a waiting claim can be started")
    db.update_claim(conn, claim_id, state="in_progress")
    return get_claim(conn, claim_id)


def decide_claim(
    conn: sqlite3.Connection, claim_id: str, decision: Decision
) -> dict[str, Any]:
    """Record the agent's decision. An approval over the limit waits for sign-off."""
    claim = get_claim(conn, claim_id)
    if claim["state"] != "in_progress":
        raise HTTPException(409, "Only a claim in progress can be decided")
    if decision.decision == "approve":
        if not 0 < decision.payout <= claim["amount_claimed"]:
            raise HTTPException(
                422, "The payout must be above $0 and at most the claim"
            )
        limit = db.company(conn)["payout_approval_limit"]
        state = "awaiting_signoff" if decision.payout > limit else "decided"
    else:
        if decision.payout != 0:
            raise HTTPException(422, "Only an approval can have a payout")
        state = "decided"
    db.update_claim(
        conn,
        claim_id,
        state=state,
        decision=decision.decision,
        payout=decision.payout,
        reason=decision.reason,
        policy_section=decision.policy_section,
    )
    return get_claim(conn, claim_id)


def sign_off_claim(
    conn: sqlite3.Connection, claim_id: str, handler_id: str
) -> dict[str, Any]:
    """Let a handler with approval rights sign off an approval over the limit."""
    claim = get_claim(conn, claim_id)
    handler = db.record(conn, "handler", handler_id)
    if handler is None:
        raise HTTPException(404, f"No handler {handler_id}")
    if not handler["can_approve_over_limit"]:
        raise HTTPException(403, f"{handler['name']} cannot approve over the limit")
    if claim["state"] != "awaiting_signoff":
        raise HTTPException(409, "Only a claim waiting for sign-off can be signed off")
    db.update_claim(conn, claim_id, state="decided", signed_off_by=handler_id)
    return get_claim(conn, claim_id)


def pay_claim(conn: sqlite3.Connection, claim_id: str, amount: float) -> dict[str, Any]:
    """Record payment of an approved payout. Over-limit payouts need sign-off first."""
    claim = get_claim(conn, claim_id)
    if claim["state"] == "awaiting_signoff":
        raise HTTPException(409, "Payment waits for a handler's sign-off")
    if claim["state"] != "decided" or claim["decision"] != "approve":
        raise HTTPException(409, "Only an approved claim can be paid")
    if claim["paid_amount"] is not None:
        raise HTTPException(409, "This claim is already paid")
    if round(amount, 2) != round(claim["payout"], 2):
        raise HTTPException(409, f"The payout is ${claim['payout']:,.2f}")
    db.update_claim(conn, claim_id, paid_amount=amount)
    return get_claim(conn, claim_id)
