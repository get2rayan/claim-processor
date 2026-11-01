import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("UNDERCOVER_DB", str(tmp_path / "test.db"))
    with TestClient(create_app()) as client:
        yield client


def start(client, claim_id):
    return client.post(f"/api/claims/{claim_id}/start")


def decide(client, claim_id, decision="approve", payout=420.0):
    return client.post(
        f"/api/claims/{claim_id}/decision",
        json={
            "decision": decision,
            "payout": payout,
            "reason": "The receipts match the policy.",
            "policy_section": "3. Trip Delay",
        },
    )


def test_small_approval_is_decided_and_paid(client):
    start(client, "CLM-1001")
    response = decide(client, "CLM-1001", payout=420.0)
    assert response.json()["state"] == "decided"
    paid = client.post("/api/claims/CLM-1001/payment", json={"amount": 420.0})
    assert paid.status_code == 200
    assert paid.json()["paid_amount"] == 420.0


def test_approval_over_limit_waits_for_sign_off_and_blocks_payment(client):
    start(client, "CLM-1003")
    response = decide(client, "CLM-1003", payout=3000.0)
    assert response.json()["state"] == "awaiting_signoff"
    paid = client.post("/api/claims/CLM-1003/payment", json={"amount": 3000.0})
    assert paid.status_code == 409
    assert paid.json()["detail"] == "Payment waits for a handler's sign-off"
    assert client.get("/api/claims/CLM-1003").json()["paid_amount"] is None


def test_sign_off_then_payment(client):
    start(client, "CLM-1003")
    decide(client, "CLM-1003", payout=3000.0)
    signed = client.post("/api/claims/CLM-1003/sign-off", json={"handler_id": "HND-01"})
    assert signed.json()["state"] == "decided"
    assert signed.json()["signed_off_by"] == "HND-01"
    paid = client.post("/api/claims/CLM-1003/payment", json={"amount": 3000.0})
    assert paid.json()["paid_amount"] == 3000.0


def test_handler_without_rights_cannot_sign_off(client):
    client.app.state.db.execute(
        "UPDATE records SET body = json_set(body, '$.can_approve_over_limit', "
        "json('false')) WHERE kind = 'handler' AND id = 'HND-02'"
    )
    start(client, "CLM-1003")
    decide(client, "CLM-1003", payout=3000.0)
    response = client.post(
        "/api/claims/CLM-1003/sign-off", json={"handler_id": "HND-02"}
    )
    assert response.status_code == 403


def test_payment_must_match_the_payout(client):
    start(client, "CLM-1001")
    decide(client, "CLM-1001", payout=300.0)
    response = client.post("/api/claims/CLM-1001/payment", json={"amount": 420.0})
    assert response.status_code == 409


def test_payment_is_made_once(client):
    start(client, "CLM-1001")
    decide(client, "CLM-1001", payout=420.0)
    client.post("/api/claims/CLM-1001/payment", json={"amount": 420.0})
    again = client.post("/api/claims/CLM-1001/payment", json={"amount": 420.0})
    assert again.status_code == 409


def test_decline_is_decided_with_no_payout_and_cannot_be_paid(client):
    start(client, "CLM-1001")
    response = decide(client, "CLM-1001", decision="decline", payout=0.0)
    assert response.json()["state"] == "decided"
    assert response.json()["policy_section"] == "3. Trip Delay"
    paid = client.post("/api/claims/CLM-1001/payment", json={"amount": 0.0})
    assert paid.status_code == 409


def test_refer_cannot_carry_a_payout(client):
    start(client, "CLM-1001")
    assert decide(client, "CLM-1001", decision="refer", payout=100.0).status_code == 422


def test_approval_cannot_exceed_the_amount_claimed(client):
    start(client, "CLM-1001")
    assert decide(client, "CLM-1001", payout=500.0).status_code == 422


def test_deciding_a_waiting_claim_is_a_conflict(client):
    assert decide(client, "CLM-1001").status_code == 409


def test_deciding_twice_is_a_conflict(client):
    start(client, "CLM-1001")
    decide(client, "CLM-1001")
    assert decide(client, "CLM-1001").status_code == 409


def test_starting_twice_is_a_conflict(client):
    start(client, "CLM-1001")
    assert start(client, "CLM-1001").status_code == 409


def test_events_are_kept_in_order(client):
    for text in ["Read the claim", "Checked the policy"]:
        client.post(
            "/api/claims/CLM-1001/events",
            json={"actor": "UnderCover Agent", "kind": "step", "text": text},
        )
    events = client.get("/api/claims/CLM-1001/events").json()
    assert [event["text"] for event in events] == [
        "Read the claim",
        "Checked the policy",
    ]
