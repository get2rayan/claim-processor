import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from agent import main
from agent.stub import StandInModel
from backend.main import create_app


class StubModel(GenericFakeChatModel):
    """A chat model that gives scripted replies in place of a real model."""

    def bind_tools(self, tools, **kwargs):
        return self


def call(name, args, id_):
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": id_}])


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("UNDERCOVER_DB", str(tmp_path / "test.db"))
    with TestClient(create_app()) as client:
        monkeypatch.setattr(main, "BACKEND", client)
        yield client


def test_tools_are_the_backend_operations_the_agent_needs():
    assert {tool.name for tool in main.TOOLS} == {
        "get_claim",
        "get_policy",
        "get_customer",
        "get_plan",
        "get_policy_wording",
        "get_company",
        "decide_claim",
        "pay_claim",
    }


def test_agent_decides_and_pays_a_small_claim(client):
    replies = [
        call("get_claim", {"claim_id": "CLM-1001"}, "1"),
        call(
            "decide_claim",
            {
                "claim_id": "CLM-1001",
                "decision": "approve",
                "payout": 420.0,
                "reason": "The hotel, meals and taxis are covered.",
                "policy_section": "3. Trip Delay",
            },
            "2",
        ),
        call("pay_claim", {"claim_id": "CLM-1001", "amount": 420.0}, "3"),
        AIMessage(content="Approved for $420.00 under section 3. Trip Delay."),
    ]
    reply = main.run("CLM-1001", "thread-1", StubModel(messages=iter(replies)))
    assert reply == "Approved for $420.00 under section 3. Trip Delay."
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["state"] == "decided"
    assert claim["paid_amount"] == 420.0
    kinds = [
        event["kind"] for event in client.get("/api/claims/CLM-1001/events").json()
    ]
    assert kinds == [
        "tool_call",
        "tool_result",
        "tool_call",
        "tool_result",
        "tool_call",
        "tool_result",
        "reply",
    ]


def test_agent_cannot_pay_an_approval_over_the_limit(client):
    replies = [
        call("get_claim", {"claim_id": "CLM-1003"}, "1"),
        call(
            "decide_claim",
            {
                "claim_id": "CLM-1003",
                "decision": "approve",
                "payout": 3000.0,
                "reason": "The treatment is covered.",
                "policy_section": "7. Emergency Medical",
            },
            "2",
        ),
        call("pay_claim", {"claim_id": "CLM-1003", "amount": 3000.0}, "3"),
        AIMessage(content="Approved. Payment waits for a handler's sign-off."),
    ]
    main.run("CLM-1003", "thread-2", StubModel(messages=iter(replies)))
    claim = client.get("/api/claims/CLM-1003").json()
    assert claim["state"] == "awaiting_signoff"
    assert claim["paid_amount"] is None
    events = client.get("/api/claims/CLM-1003/events").json()
    refusal = [event["text"] for event in events if event["kind"] == "tool_result"][-1]
    assert refusal.startswith("Error 409")


def test_model_name(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("MODEL_NAME", raising=False)
    assert main.model().model_name == "openai/gpt-6-luna"
    monkeypatch.setenv("MODEL_NAME", "openrouter/free")
    assert main.model().model_name == "openrouter/free"


def test_no_backend_route_reaches_the_evals(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert not [path for path in paths if "eval" in path]


def test_stand_in_declines_the_claim_it_is_given(client):
    main.run("CLM-1001", "thread-3", StandInModel())
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["state"] == "decided"
    assert claim["decision"] == "decline"


def test_stand_in_is_used_when_asked_for(monkeypatch):
    monkeypatch.setenv("UNDERCOVER_STAND_IN", "1")
    assert isinstance(main.default_model(), StandInModel)
