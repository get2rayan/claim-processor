import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from agent import main as agent_main
from agent.stub import StandInModel
from backend.main import create_app


class StubModel(GenericFakeChatModel):
    """A chat model that gives scripted replies in place of a real model."""

    def bind_tools(self, tools, **kwargs):
        return self


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("UNDERCOVER_DB", str(tmp_path / "test.db"))
    with TestClient(create_app()) as client:
        monkeypatch.setattr(agent_main, "BACKEND", client)
        yield client


def test_run_leaves_the_claim_decided_with_its_steps(client, monkeypatch):
    replies = [
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "decide_claim",
                    "args": {
                        "claim_id": "CLM-1001",
                        "decision": "decline",
                        "payout": 0.0,
                        "reason": "The delay is not covered.",
                        "policy_section": "3. Trip Delay",
                    },
                    "id": "1",
                }
            ],
        ),
        AIMessage(content="Declined under section 3. Trip Delay."),
    ]
    monkeypatch.setattr(agent_main, "model", lambda: StubModel(messages=iter(replies)))
    response = client.post("/api/claims/CLM-1001/run")
    assert response.status_code == 200
    assert response.json()["state"] == "waiting"
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["state"] == "decided"
    assert claim["decision"] == "decline"
    events = client.get("/api/claims/CLM-1001/events").json()
    assert [event["kind"] for event in events] == ["tool_call", "tool_result", "reply"]


def test_run_needs_a_waiting_claim(client):
    client.post("/api/claims/CLM-1001/start")
    assert client.post("/api/claims/CLM-1001/run").status_code == 409


def test_run_of_an_unknown_claim_is_404(client):
    assert client.post("/api/claims/CLM-9999/run").status_code == 404


def test_run_waiting_claims_runs_each_waiting_claim_and_no_other(client, monkeypatch):
    monkeypatch.setattr(agent_main, "default_model", StandInModel)
    client.post("/api/claims/CLM-1001/start")
    response = client.post("/api/claims/run-waiting")
    assert response.status_code == 200
    claim_ids = response.json()["claim_ids"]
    assert len(claim_ids) == 24
    assert "CLM-1001" not in claim_ids
    states = {
        claim["claim_id"]: claim["state"] for claim in client.get("/api/claims").json()
    }
    assert {states[claim_id] for claim_id in claim_ids} == {"decided"}
    assert states["CLM-1001"] == "in_progress"
