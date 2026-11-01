import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("UNDERCOVER_DB", str(tmp_path / "test.db"))
    with TestClient(create_app()) as client:
        yield client


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_queue_has_25_waiting_claims(client):
    claims = client.get("/api/claims").json()
    assert len(claims) == 25
    assert {claim["state"] for claim in claims} == {"waiting"}


def test_claim_detail(client):
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["story"].startswith("My flight home from Rome")
    assert [item["category"] for item in claim["items"]] == [
        "accommodation",
        "meals",
        "transport",
    ]
    assert claim["documents"]
    assert claim["decision"] is None


def test_unknown_claim_is_404(client):
    assert client.get("/api/claims/CLM-9999").status_code == 404


def test_linked_policy_customer_and_plan(client):
    claim = client.get("/api/claims/CLM-1001").json()
    policy = client.get(f"/api/policies/{claim['policy_id']}").json()
    customer = client.get(f"/api/customers/{claim['customer_id']}").json()
    plan = client.get(f"/api/plans/{policy['plan']}").json()
    assert policy["policy_id"] == "POL-2001"
    assert customer["name"] == "Maya Patel"
    assert customer["previous_claims"]
    assert plan["deductible"] == 50.0


def test_policy_wording_and_instructions_are_text(client):
    wording = client.get("/api/policy-wording").json()["text"]
    assert wording.startswith("# UnderCover Travel Insurance: Policy Wording")
    assert client.get("/api/instructions").json()["text"]


def test_company_and_handlers(client):
    assert client.get("/api/company").json()["payout_approval_limit"] == 1000.0
    handlers = client.get("/api/handlers").json()
    assert [handler["handler_id"] for handler in handlers] == [
        "HND-01",
        "HND-02",
        "HND-03",
    ]


def test_held_back_data_is_not_served(client):
    assert client.get("/api/claims/CLM-1901").status_code == 404
    queue_ids = {claim["claim_id"] for claim in client.get("/api/claims").json()}
    assert "CLM-1901" not in queue_ids


def test_every_operation_has_an_id_a_one_line_docstring_and_no_optional_inputs(client):
    paths = client.get("/openapi.json").json()["paths"]
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    operations = [op for methods in paths.values() for op in methods.values()]
    assert operations
    for operation in operations:
        assert operation["operationId"]
        description = operation["description"]
        assert description
        assert "\n" not in description
        for param in operation.get("parameters", []):
            assert param["required"]
        body = operation.get("requestBody")
        if body:
            name = body["content"]["application/json"]["schema"]["$ref"].split("/")[-1]
            schema = schemas[name]
            assert set(schema["properties"]) == set(schema["required"])
