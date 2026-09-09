"""Regression coverage for local-Agent topic-outline generation."""

from __future__ import annotations

import json

import pytest

from deeptutor.api.routers.mastery_path import (
    GenerateTopicDraftRequest,
    generate_topic_route,
)
from deeptutor.services.subagent.types import ConsultResult


@pytest.mark.asyncio
async def test_topic_draft_uses_the_sole_local_agent_without_global_llm(monkeypatch) -> None:
    """The topic wizard is not a chat turn, but retains its local CLI default."""

    seen_contexts = []

    async def default_local_agent_ref(selected_refs=None):
        assert selected_refs is None
        return "local-codex"

    async def consult_selected_subagent(context, request, **_kwargs):
        seen_contexts.append(context)
        assert "[System instructions]" in request
        assert "[User]" in request
        return ConsultResult(
            final_text=json.dumps(
                {
                    "description": "A route made by the local agent.",
                    "modules": [
                        {
                            "name": "Foundations",
                            "knowledge_points": [
                                {"name": "Core idea", "type": "concept"}
                            ],
                        }
                    ],
                }
            )
        )

    monkeypatch.setattr(
        "deeptutor.capabilities.subagent.binding.default_local_agent_ref",
        default_local_agent_ref,
    )
    monkeypatch.setattr(
        "deeptutor.capabilities.subagent.direct.consult_selected_subagent",
        consult_selected_subagent,
    )
    monkeypatch.setattr(
        "deeptutor.api.routers.mastery_path.get_response_language", lambda: "en"
    )
    monkeypatch.setattr(
        "deeptutor.services.llm.config.get_llm_config",
        lambda: (_ for _ in ()).throw(AssertionError("global LLM must not resolve")),
    )

    result = await generate_topic_route(
        GenerateTopicDraftRequest(name="Linear algebra", goal="Build intuition")
    )

    assert [context.knowledge_bases for context in seen_contexts] == [["local-codex"]]
    assert result["description"] == "A route made by the local agent."
    assert result["modules"][0]["name"] == "Foundations"
