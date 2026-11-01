"""The backend's API operations."""

import sqlite3
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from agent import main as agent_main
from backend import db, workflow
from backend.models import Decision, NewEvent, Payment, SignOff

router = APIRouter()

INSTRUCTIONS = Path(__file__).resolve().parent / "instructions.md"


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    """Open a database connection for one request, and close it after."""
    conn = db.connect(request.app.state.db_path)
    try:
        yield conn
    finally:
        conn.close()


Conn = Annotated[sqlite3.Connection, Depends(get_db)]


@router.get("/api/health", operation_id="health")
def health() -> dict[str, str]:
    """Check that the backend is running."""
    return {"status": "ok"}


@router.get("/api/claims", operation_id="list_claims")
def list_claims(conn: Conn) -> list[dict[str, Any]]:
    """List the claims queue with each claim's state."""
    return db.claims(conn)


@router.get("/api/claims/{claim_id}", operation_id="get_claim")
def get_claim(claim_id: str, conn: Conn) -> dict[str, Any]:
    """Get one claim with its state and decision."""
    return workflow.get_claim(conn, claim_id)


@router.get("/api/claims/{claim_id}/events", operation_id="list_events")
def list_events(claim_id: str, conn: Conn) -> list[dict[str, Any]]:
    """List the steps taken on a claim, in order."""
    workflow.get_claim(conn, claim_id)
    return db.events(conn, claim_id)


@router.post("/api/claims/{claim_id}/events", operation_id="add_event")
def add_event(claim_id: str, event: NewEvent, conn: Conn) -> dict[str, str]:
    """Record a step taken on a claim."""
    workflow.get_claim(conn, claim_id)
    db.add_event(conn, claim_id, event.actor, event.kind, event.text)
    return event.model_dump()


@router.post("/api/claims/{claim_id}/start", operation_id="start_claim")
def start_claim(claim_id: str, conn: Conn) -> dict[str, Any]:
    """Move a waiting claim to in progress."""
    return workflow.start_claim(conn, claim_id)


@router.post("/api/claims/{claim_id}/decision", operation_id="decide_claim")
def decide_claim(claim_id: str, decision: Decision, conn: Conn) -> dict[str, Any]:
    """Record the decision on a claim in progress."""
    return workflow.decide_claim(conn, claim_id, decision)


@router.post("/api/claims/{claim_id}/sign-off", operation_id="sign_off_claim")
def sign_off_claim(claim_id: str, sign_off: SignOff, conn: Conn) -> dict[str, Any]:
    """Sign off an approval over the payout limit."""
    return workflow.sign_off_claim(conn, claim_id, sign_off.handler_id)


@router.post("/api/claims/{claim_id}/payment", operation_id="pay_claim")
def pay_claim(claim_id: str, payment: Payment, conn: Conn) -> dict[str, Any]:
    """Pay the payout of an approved claim."""
    return workflow.pay_claim(conn, claim_id, payment.amount)


@router.post("/api/claims/{claim_id}/run", operation_id="run_claim")
def run_claim(claim_id: str, background: BackgroundTasks, conn: Conn) -> dict[str, Any]:
    """Start the UnderCover Agent on a waiting claim."""
    claim = workflow.get_claim(conn, claim_id)
    if claim["state"] != "waiting":
        raise HTTPException(409, "Only a waiting claim can be run")
    background.add_task(agent_main.run, claim_id, f"{claim_id}-{uuid4().hex}")
    return claim


@router.post("/api/claims/run-waiting", operation_id="run_waiting_claims")
def run_waiting_claims(background: BackgroundTasks, conn: Conn) -> dict[str, list[str]]:
    """Start the UnderCover Agent on every waiting claim, one after another."""
    claim_ids = [
        claim["claim_id"] for claim in db.claims(conn) if claim["state"] == "waiting"
    ]
    background.add_task(agent_main.run_all, claim_ids)
    return {"claim_ids": claim_ids}


@router.get("/api/policies/{policy_id}", operation_id="get_policy")
def get_policy(policy_id: str, conn: Conn) -> dict[str, Any]:
    """Get a policy with its plan, add-ons, trip and travelers."""
    policy = db.record(conn, "policy", policy_id)
    if policy is None:
        raise HTTPException(404, f"No policy {policy_id}")
    return policy


@router.get("/api/customers/{customer_id}", operation_id="get_customer")
def get_customer(customer_id: str, conn: Conn) -> dict[str, Any]:
    """Get a customer with their claim history."""
    customer = db.record(conn, "customer", customer_id)
    if customer is None:
        raise HTTPException(404, f"No customer {customer_id}")
    return customer


@router.get("/api/plans/{plan}", operation_id="get_plan")
def get_plan(plan: str, conn: Conn) -> dict[str, Any]:
    """Get a plan's limits, waiting periods and deductible."""
    found = db.record(conn, "plan", plan)
    if found is None:
        raise HTTPException(404, f"No plan {plan}")
    return found


@router.get("/api/handlers", operation_id="list_handlers")
def list_handlers(conn: Conn) -> list[dict[str, Any]]:
    """List the claims handlers."""
    return db.records(conn, "handler")


@router.get("/api/company", operation_id="get_company")
def get_company(conn: Conn) -> dict[str, Any]:
    """Get the company settings, including the payout limit."""
    return db.company(conn)


@router.get("/api/policy-wording", operation_id="get_policy_wording")
def get_policy_wording() -> dict[str, str]:
    """Get the policy wording the agent decides claims by."""
    return {"text": (db.DATA_DIR / "policy_wording.md").read_text(encoding="utf-8")}


@router.get("/api/instructions", operation_id="get_instructions")
def get_instructions() -> dict[str, str]:
    """Get the UnderCover Agent's instructions, read only."""
    return {"text": INSTRUCTIONS.read_text(encoding="utf-8")}
