from __future__ import annotations

import pytest

from deeptutor.core.context import UnifiedContext
from deeptutor.services.session.turn_runtime import (
    TurnRuntimeManager,
    _sanitize_session_title,
    _TurnExecution,
)
from deeptutor.services.subagent.types import ConsultResult


def test_sanitize_session_title_removes_reasoning_block() -> None:
    raw = "<think>\nNeed a concise title.\n</think>\n标题：AgenticRAG 定义"

    assert _sanitize_session_title(raw) == "AgenticRAG 定义"


def test_sanitize_session_title_falls_back_when_only_reasoning_remains() -> None:
    raw = "<think>\nStill deciding on the title."

    assert _sanitize_session_title(raw) == ""


def test_provider_errors_do_not_become_session_titles() -> None:
    """Provider failures must fall back to the user's opening message."""
    from deeptutor.services.session.turn_runtime import _looks_like_error_payload

    assert _looks_like_error_payload(
        "Error: {'message': 'Authentication Fails, Your api key: *** is invalid'}"
    )
    assert _looks_like_error_payload('{"error": {"code": 401}}')
    assert _looks_like_error_payload("错误：调用失败")
    assert _looks_like_error_payload("Traceback (most recent call last):")


def test_real_titles_survive_the_error_guard() -> None:
    from deeptutor.services.session.turn_runtime import _looks_like_error_payload

    for title in (
        "操作系统概述",
        "Deadlock detection basics",
        "Error handling in Rust",
        "错误处理的三种模式",
        "",
    ):
        assert not _looks_like_error_payload(title), title


def test_sanitize_session_title_rejects_provider_error() -> None:
    raw = "Error: {'message': 'Incorrect API key provided: no-key'}"

    from deeptutor.services.session.turn_runtime import _looks_like_error_payload

    assert _looks_like_error_payload(raw)


@pytest.mark.asyncio
async def test_session_title_uses_selected_subagent(monkeypatch) -> None:
    calls: list[tuple[str, list[str]]] = []

    async def consult_selected_subagent(context, question):
        calls.append((question, list(context.knowledge_bases)))
        return ConsultResult(final_text="Agent Loop", session_id="local-1")

    monkeypatch.setattr(
        "deeptutor.capabilities.subagent.direct.consult_selected_subagent",
        consult_selected_subagent,
    )

    class Store:
        updated_title = ""

        async def get_session(self, session_id):
            return {"id": session_id, "title": "New conversation"}

        async def get_messages(self, session_id):
            return [
                {"role": "user", "content": "讲一下 Agent Loop"},
                {"role": "assistant", "content": "思考、行动、观察、继续行动。"},
            ]

        async def update_session_title(self, session_id, title):
            self.updated_title = title

    store = Store()
    manager = TurnRuntimeManager(store=store)
    execution = _TurnExecution(
        turn_id="turn-1",
        session_id="session-1",
        capability="chat",
        payload={"knowledge_bases": ["local-agent"]},
    )
    context = UnifiedContext(
        session_id="session-1",
        user_message="讲一下 Agent Loop",
        knowledge_bases=["local-agent"],
        language="zh",
    )

    await manager._maybe_generate_session_title(
        execution=execution,
        session_id="session-1",
        ui_language="zh",
        context=context,
    )

    assert calls and calls[0][1] == ["local-agent"]
    assert calls[0][0].startswith("请基于以下对话生成标题")
    assert store.updated_title == "Agent Loop"
