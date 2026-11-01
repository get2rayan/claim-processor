"""A stand-in for the model, for the end-to-end tests. It declines every claim."""

import re
from collections.abc import Sequence
from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    ToolMessage,
)
from langchain_core.outputs import ChatGeneration, ChatResult


class StandInModel(BaseChatModel):
    """Gets the claim, declines it, then replies, without calling a real model."""

    @property
    def _llm_type(self) -> str:
        return "stand-in"

    def bind_tools(self, tools: Sequence[Any], **kwargs: Any) -> "StandInModel":
        return self

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self._reply(messages))])

    def _reply(self, messages: list[BaseMessage]) -> AIMessage:
        request = next(m for m in messages if isinstance(m, HumanMessage))
        claim_id = re.search(r"CLM-\d+", str(request.content))
        claim = claim_id.group(0) if claim_id else ""
        tool_results = [m for m in messages if isinstance(m, ToolMessage)]
        if not tool_results:
            return AIMessage(
                content="",
                tool_calls=[
                    {"name": "get_claim", "args": {"claim_id": claim}, "id": "1"}
                ],
            )
        if len(tool_results) == 1:
            decision = {
                "claim_id": claim,
                "decision": "decline",
                "payout": 0.0,
                "reason": "Declined by the stand-in model.",
                "policy_section": "9. General exclusions",
            }
            return AIMessage(
                content="",
                tool_calls=[{"name": "decide_claim", "args": decision, "id": "2"}],
            )
        return AIMessage(content=f"Declined {claim}.")
