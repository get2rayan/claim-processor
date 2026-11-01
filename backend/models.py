"""The request bodies for the backend's write operations."""

from typing import Literal

from pydantic import BaseModel


class Decision(BaseModel):
    """A decision on a claim."""

    decision: Literal["approve", "decline", "refer"]
    payout: float
    reason: str
    policy_section: str


class SignOff(BaseModel):
    """A handler signing off an approval over the limit."""

    handler_id: str


class Payment(BaseModel):
    """An amount to pay on an approved claim."""

    amount: float


class NewEvent(BaseModel):
    """A step the agent took on a claim."""

    actor: str
    kind: str
    text: str
