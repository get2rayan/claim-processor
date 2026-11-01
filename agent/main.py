"""The UnderCover Agent."""

import os
import sys
import uuid
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from agent.stub import StandInModel

load_dotenv(override=True)

BACKEND_URL = os.getenv("UNDERCOVER_BACKEND", "http://localhost:8000")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-6-luna"
ACTOR = "UnderCover Agent"

BACKEND = httpx.Client(base_url=BACKEND_URL, timeout=10)


def backend() -> httpx.Client:
    """Return the client for the UnderCover backend."""
    return BACKEND


def fetch(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    """Call the backend and return its JSON reply, raising on an error."""
    response = backend().request(method, path, json=body)
    response.raise_for_status()
    return response.json()


def reply(method: str, path: str, body: dict[str, Any] | None = None) -> str:
    """Call the backend for a tool and return its reply as text, errors included."""
    response = backend().request(method, path, json=body)
    if response.is_success:
        return response.text
    return f"Error {response.status_code}: {response.text}"


@tool
def get_claim(claim_id: str) -> str:
    """Get a claim with its story, items, documents and state."""
    return reply("GET", f"/api/claims/{claim_id}")


@tool
def get_policy(policy_id: str) -> str:
    """Get a policy with its plan, add-ons, trip and travelers."""
    return reply("GET", f"/api/policies/{policy_id}")


@tool
def get_customer(customer_id: str) -> str:
    """Get a customer with their claim history."""
    return reply("GET", f"/api/customers/{customer_id}")


@tool
def get_plan(plan: str) -> str:
    """Get a plan's limits, waiting periods and deductible."""
    return reply("GET", f"/api/plans/{plan}")


@tool
def get_policy_wording() -> str:
    """Get the policy wording the claim is decided by."""
    return reply("GET", "/api/policy-wording")


@tool
def get_company() -> str:
    """Get the company settings, including the payout limit."""
    return reply("GET", "/api/company")


@tool
def decide_claim(
    claim_id: str,
    decision: Literal["approve", "decline", "refer"],
    payout: float,
    reason: str,
    policy_section: str,
) -> str:
    """Record the decision on a claim. The payout is 0 unless approving."""
    body = {
        "decision": decision,
        "payout": payout,
        "reason": reason,
        "policy_section": policy_section,
    }
    return reply("POST", f"/api/claims/{claim_id}/decision", body)


@tool
def pay_claim(claim_id: str, amount: float) -> str:
    """Pay the payout of an approved claim."""
    return reply("POST", f"/api/claims/{claim_id}/payment", {"amount": amount})


TOOLS = [
    get_claim,
    get_policy,
    get_customer,
    get_plan,
    get_policy_wording,
    get_company,
    decide_claim,
    pay_claim,
]


def model() -> ChatOpenAI:
    """Return the model named in MODEL_NAME, or GPT-6 Luna by default."""
    name = os.getenv("MODEL_NAME")
    return ChatOpenAI(
        model=name or DEFAULT_MODEL,
        base_url=OPENROUTER_BASE_URL,
        api_key=SecretStr(os.environ["OPENROUTER_API_KEY"]),
        reasoning_effort=None if name else "low",
    )


def default_model() -> BaseChatModel:
    """Return the stand-in model for the end-to-end tests, else the real model."""
    return StandInModel() if os.getenv("UNDERCOVER_STAND_IN") else model()


def record(claim_id: str, kind: str, text: str) -> None:
    """Post one step the agent took to the claim's history."""
    fetch(
        "POST",
        f"/api/claims/{claim_id}/events",
        {"actor": ACTOR, "kind": kind, "text": text},
    )


def run(claim_id: str, thread_id: str, llm: BaseChatModel | None = None) -> str:
    """Run the agent on a waiting claim, posting each step, and return its reply."""
    instructions = fetch("GET", "/api/instructions")["text"]
    agent = create_agent(
        llm or default_model(), tools=TOOLS, system_prompt=instructions
    )
    fetch("POST", f"/api/claims/{claim_id}/start")
    final = ""
    for update in agent.stream(
        {"messages": [{"role": "user", "content": f"Claim {claim_id}"}]},
        config={"configurable": {"thread_id": thread_id}},
        stream_mode="updates",
    ):
        for step in update.values():
            for message in step["messages"]:
                if isinstance(message, ToolMessage):
                    record(claim_id, "tool_result", str(message.content))
                elif isinstance(message, AIMessage) and message.tool_calls:
                    for call in message.tool_calls:
                        record(claim_id, "tool_call", f"{call['name']} {call['args']}")
                elif isinstance(message, AIMessage):
                    final = message.text
                    record(claim_id, "reply", final)
    return final


if __name__ == "__main__":
    claim_id = sys.argv[1]
    print(run(claim_id, f"{claim_id}-{uuid.uuid4().hex}"))
