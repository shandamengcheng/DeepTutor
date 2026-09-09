"""Tests for the subagent capability: binding, activation, tool budget/streaming.

The capability is the connected-agent twin of Obsidian — selecting a
``type: subagent`` KB runs the turn exclusively on ``consult_subagent``. These
tests stub the KB metadata resolver and the backend, so nothing spawns a real
CLI; they verify the wiring (binding, exclusivity, injected spec) and the tool's
authoritative consult-budget + session continuity + event streaming.
"""

from __future__ import annotations

import asyncio

import pytest

from deeptutor.agents._shared.tool_composition import ToolMountFlags, compose_enabled_tools
from deeptutor.agents.chat.capability import ChatCapability
from deeptutor.capabilities import any_exclusive_capability_active
from deeptutor.capabilities.subagent import (
    SUBAGENT_TOOL_NAMES,
    ConsultSubagentTool,
    SubagentCapability,
    connection_for_turn,
    default_local_agent_ref,
)
from deeptutor.capabilities.subagent import binding as subagent_binding
from deeptutor.capabilities.subagent.direct import (
    consult_selected_subagent,
    run_direct_subagent,
)
from deeptutor.capabilities.subagent.model_runtime import selected_subagent_scope
from deeptutor.core.context import TurnRuntimeContext, UnifiedContext
from deeptutor.core.stream import StreamEventType
from deeptutor.runtime.registry.tool_registry import get_tool_registry
from deeptutor.runtime.stream_bus import StreamBus
from deeptutor.services.subagent.config import BackendConfig
from deeptutor.services.subagent.types import ConsultResult, SubagentEvent


def _bind(monkeypatch, *, kind: str = "claude_code", cwd: str = "", name: str = "myagent") -> None:
    """Make ``resolve_kb_metadata`` report ``name`` as a connected subagent."""
    monkeypatch.setattr(
        "deeptutor.multi_user.knowledge_access.resolve_kb_metadata",
        lambda ref: (
            {"name": ref, "type": "subagent", "agent_kind": kind, "cwd": cwd}
            if ref == name
            else {"name": ref, "type": None}
        ),
    )


# ---- binding & activation ----------------------------------------------------


def test_inactive_without_subagent_kb(monkeypatch) -> None:
    _bind(monkeypatch)
    cap = SubagentCapability()
    ctx = UnifiedContext(user_message="hi", knowledge_bases=["plain-kb"])
    assert cap.is_active(ctx) is False
    assert cap.system_block(ctx, language="en", prompts={}) is None


def test_active_injects_spec_and_min_rounds(monkeypatch) -> None:
    _bind(monkeypatch, kind="codex", cwd="/tmp/proj")
    cap = SubagentCapability()
    ctx = UnifiedContext(user_message="hi", knowledge_bases=["myagent"])
    assert cap.is_active(ctx) is True
    assert tuple(cap.owned_tools) == SUBAGENT_TOOL_NAMES

    block = cap.system_block(ctx, language="en", prompts={})
    assert block is not None and "myagent" in block.content
    # The loop budget floor is lifted so the full consult budget + a finish
    # round always fit.
    assert ctx.runtime.min_loop_rounds >= 2

    spec = cap.augment_kwargs("consult_subagent", {"question": "q"}, ctx)["_subagent"]
    assert spec["kind"] == "codex"
    assert spec["cwd"] == "/tmp/proj"
    assert spec["budget"] >= 1
    assert isinstance(spec["config"], BackendConfig)
    assert spec["state"] == {"count": 0, "session_id": None, "name": "myagent"}
    # Never injected for a non-owned tool.
    assert "_subagent" not in cap.augment_kwargs("rag", {}, ctx)


def test_consult_budget_override_from_runtime_context(monkeypatch) -> None:
    _bind(monkeypatch)
    cap = SubagentCapability()
    # Typed per-turn override from the composer wins over the default.
    ctx = UnifiedContext(
        user_message="hi",
        knowledge_bases=["myagent"],
        runtime=TurnRuntimeContext(subagent_consult_budget=3),
    )
    assert (
        cap.augment_kwargs("consult_subagent", {"question": "q"}, ctx)["_subagent"]["budget"] == 3
    )
    # Out-of-range values are clamped, not trusted.
    ctx_hi = UnifiedContext(
        user_message="hi",
        knowledge_bases=["myagent"],
        runtime=TurnRuntimeContext(subagent_consult_budget=999),
    )
    assert (
        cap.augment_kwargs("consult_subagent", {"question": "q"}, ctx_hi)["_subagent"]["budget"]
        == 12
    )


def test_binding_cached(monkeypatch) -> None:
    calls = {"n": 0}

    def fake(ref):
        calls["n"] += 1
        return {"name": ref, "type": "subagent", "agent_kind": "claude_code", "cwd": ""}

    monkeypatch.setattr("deeptutor.multi_user.knowledge_access.resolve_kb_metadata", fake)
    ctx = UnifiedContext(user_message="hi", knowledge_bases=["a"])
    subagent_binding.connection_for_turn(ctx)
    subagent_binding.connection_for_turn(ctx)
    assert calls["n"] == 1  # second call hits the per-turn cache


# ---- exclusivity -------------------------------------------------------------


def test_exclusive_compose_drops_builtins_but_keeps_coexisting_rag() -> None:
    # Issue #650: the KB built-ins coexist when has_kb is set (a co-selected
    # real KB the capability does not own is both searchable and enumerable);
    # other built-ins/toggles stay dropped.
    composed = compose_enabled_tools(
        registry=get_tool_registry(),
        requested_tools=["web_search", "rag"],
        optional_whitelist=["web_search", "rag"],
        mount_flags=ToolMountFlags(has_kb=True, has_exec=True, has_memory=True),
        capability_owned=["consult_subagent"],
        exclusive=True,
    )
    assert set(composed) == {
        "workspace_list",
        "workspace_read",
        "workspace_search",
        "workspace_present",
        "consult_subagent",
        "rag",
        "kb_files",
        "ask_user",
    }


def test_exclusive_compose_pure_subagent_mounts_no_rag() -> None:
    composed = compose_enabled_tools(
        registry=get_tool_registry(),
        requested_tools=["web_search"],
        optional_whitelist=["web_search"],
        mount_flags=ToolMountFlags(has_kb=False),
        capability_owned=["consult_subagent"],
        exclusive=True,
    )
    assert set(composed) == {
        "workspace_list",
        "workspace_read",
        "workspace_search",
        "workspace_present",
        "consult_subagent",
        "ask_user",
    }


def test_registry_flags_subagent_turn_as_exclusive(monkeypatch) -> None:
    _bind(monkeypatch)
    subagent_turn = UnifiedContext(user_message="hi", knowledge_bases=["myagent"])
    plain_turn = UnifiedContext(user_message="hi", knowledge_bases=["plain-kb"])
    assert any_exclusive_capability_active(subagent_turn) is True
    assert any_exclusive_capability_active(plain_turn) is False


def test_owned_kbs_reports_only_agent_ref(monkeypatch) -> None:
    # Issue #650: the agent ref is owned (consulted, not rag'd); a co-selected
    # LlamaIndex KB is not owned, so it keeps its rag surface.
    _bind(monkeypatch)  # only "myagent" resolves as a subagent
    cap = SubagentCapability()
    ctx = UnifiedContext(user_message="hi", knowledge_bases=["myagent", "kb-plain"])
    assert cap.owned_kbs(ctx) == {"myagent"}
    assert subagent_binding.subagent_refs(ctx) == {"myagent"}


# ---- direct chat -------------------------------------------------------------


@pytest.mark.asyncio
async def test_selected_subagent_runs_directly_without_chat_llm(monkeypatch, tmp_path) -> None:
    """Selecting a connected agent bypasses the default chat-model loop."""
    from deeptutor.services.subagent import sessions as sess

    monkeypatch.setattr(sess, "_path", lambda: tmp_path / "subagent_sessions.json")
    _bind(monkeypatch, kind="claude_code", cwd="/tmp/project")
    backend = _FakeBackend()
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: backend)

    context = UnifiedContext(
        user_message="inspect this project",
        knowledge_bases=["myagent"],
        session_id="chat-direct",
    )
    bus = StreamBus()
    events = []

    async def consume() -> None:
        async for event in bus.subscribe():
            events.append(event)

    consumer = asyncio.create_task(consume())
    await asyncio.sleep(0)
    assert await run_direct_subagent(context, bus) is True
    await bus.close()
    await consumer

    assert backend.calls == [("inspect this project", None)]
    assert any(
        event.type == StreamEventType.PROGRESS
        and event.metadata.get("subagent_direct") is True
        and event.metadata.get("subagent_channel") == "user_question"
        for event in events
    )
    assert any(
        event.type == StreamEventType.CONTENT and event.content == "answer:inspect this project"
        for event in events
    )
    assert sess.get_session(sess.session_key("chat-direct", "myagent")) == "sess-1"


@pytest.mark.asyncio
async def test_direct_subagent_forwards_turn_scoped_sidebar_context(monkeypatch, tmp_path) -> None:
    """The Little Tutor's selected passage reaches a direct local Agent."""
    from deeptutor.services.subagent import sessions as sess

    monkeypatch.setattr(sess, "_path", lambda: tmp_path / "subagent_sessions.json")
    _bind(monkeypatch, kind="claude_code")
    backend = _FakeBackend()
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: backend)
    context = UnifiedContext(
        user_message="这是什么工具，有什么作用？",
        knowledge_bases=["myagent"],
        sidebar_context="[用户精确选中的内容]\nFlink/Spark",
    )

    assert await run_direct_subagent(context, StreamBus()) is True

    assert backend.calls == [
        (
            "[System context]\n[用户精确选中的内容]\nFlink/Spark"
            "\n\n[User]\n这是什么工具，有什么作用？",
            None,
        )
    ]


@pytest.mark.asyncio
async def test_selected_subagent_followup_reuses_same_session(monkeypatch, tmp_path) -> None:
    from deeptutor.services.subagent import sessions as sess

    monkeypatch.setattr(sess, "_path", lambda: tmp_path / "subagent_sessions.json")
    _bind(monkeypatch, kind="claude_code", cwd="/tmp/project")
    backend = _FakeBackend()
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: backend)

    context = UnifiedContext(
        user_message="inspect this project",
        knowledge_bases=["myagent"],
        session_id="chat-followup",
    )
    assert await run_direct_subagent(context, StreamBus()) is True

    result = await consult_selected_subagent(context, "Generate a concise title")

    assert result is not None and result.success is True
    assert backend.calls == [
        ("inspect this project", None),
        ("Generate a concise title", "sess-1"),
    ]


@pytest.mark.asyncio
async def test_direct_subagent_skips_plain_chat(monkeypatch) -> None:
    _bind(monkeypatch)
    assert await run_direct_subagent(UnifiedContext(user_message="hi"), StreamBus()) is False


@pytest.mark.asyncio
async def test_default_local_agent_uses_first_available_cli_connection(monkeypatch) -> None:
    class _Manager:
        def list_knowledge_bases(self):
            return ["a-unavailable", "b-local", "partner"]

        def get_metadata(self, name):
            return {
                "a-unavailable": {"type": "subagent", "agent_kind": "missing"},
                "b-local": {"type": "subagent", "agent_kind": "working"},
                "partner": {"type": "subagent", "agent_kind": "partner"},
            }[name]

    class _Backend:
        local_cli = True

        def __init__(self, available):
            self.available = available

        async def detect(self):
            from deeptutor.services.subagent.types import DetectResult

            return DetectResult("test", "Test", available=self.available)

    backends = {
        "missing": _Backend(False),
        "working": _Backend(True),
        "partner": type("Partner", (), {"local_cli": False})(),
    }
    monkeypatch.setattr(
        "deeptutor.multi_user.knowledge_access.current_kb_manager", lambda: _Manager()
    )
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", backends.get)

    assert await default_local_agent_ref() == "b-local"
    assert await default_local_agent_ref(["partner"]) is None
    backends["missing"].available = True
    assert await default_local_agent_ref() is None


@pytest.mark.asyncio
async def test_selected_subagent_is_available_to_completion_and_streaming_factory(
    monkeypatch, tmp_path
) -> None:
    """Nested model helpers use the selected CLI agent, never provider config."""
    from deeptutor.services.llm import complete, stream
    from deeptutor.services.subagent import sessions as sess

    monkeypatch.setattr(sess, "_path", lambda: tmp_path / "subagent_sessions.json")
    _bind(monkeypatch, kind="claude_code", cwd="/tmp/project")
    backend = _FakeBackend()
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: backend)
    context = UnifiedContext(knowledge_bases=["myagent"], session_id="nested-model")

    with selected_subagent_scope(context):
        completion = await complete(
            prompt="Return JSON", system_prompt="Answer only with JSON", max_retries=0
        )
        chunks = [chunk async for chunk in stream(prompt="Summarize", system_prompt="Be brief")]

    assert "[System instructions]" in backend.calls[0][0]
    assert "[User]\nReturn JSON" in backend.calls[0][0]
    assert completion == f"answer:{backend.calls[0][0]}"
    assert chunks == [f"answer:{backend.calls[1][0]}"]
    assert backend.calls[1][1] == "sess-1"


@pytest.mark.asyncio
async def test_selected_subagent_is_agentic_openai_transport(monkeypatch, tmp_path) -> None:
    """Agentic Capability loops use the CLI Agent without bypassing their tools."""
    from deeptutor.runtime.agentic import LLMClientConfig, build_openai_client
    from deeptutor.services.subagent import sessions as sess

    monkeypatch.setattr(sess, "_path", lambda: tmp_path / "subagent_sessions.json")
    _bind(monkeypatch, kind="claude_code", cwd="/tmp/project")
    backend = _FakeBackend()
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: backend)
    context = UnifiedContext(knowledge_bases=["myagent"], session_id="agentic-model")

    with selected_subagent_scope(context):
        client = build_openai_client(
            LLMClientConfig(
                binding="local_agent",
                model="local-agent",
                api_key="",
                base_url=None,
            )
        )
        response = await client.chat.completions.create(
            model="local-agent",
            messages=[
                {"role": "system", "content": "Use the declared tool protocol."},
                {"role": "user", "content": "Assess this answer."},
            ],
            stream=True,
        )
        chunks = [chunk async for chunk in response]

    assert len(chunks) == 1
    assert chunks[0].choices[0].delta.content.startswith("answer:")
    assert "[System]\nUse the declared tool protocol." in backend.calls[0][0]
    assert "[User]\nAssess this answer." in backend.calls[0][0]


@pytest.mark.asyncio
async def test_selected_subagent_transport_preserves_tool_round_context(
    monkeypatch, tmp_path
) -> None:
    """A CLI Agent can correlate a tool result with its prior invocation."""
    from deeptutor.runtime.agentic import LLMClientConfig, build_openai_client
    from deeptutor.services.subagent import sessions as sess

    monkeypatch.setattr(sess, "_path", lambda: tmp_path / "subagent_sessions.json")
    _bind(monkeypatch, kind="claude_code", cwd="/tmp/project")
    backend = _FakeBackend()
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: backend)
    context = UnifiedContext(knowledge_bases=["myagent"], session_id="agentic-tool-round")

    with selected_subagent_scope(context):
        client = build_openai_client(
            LLMClientConfig(
                binding="local_agent",
                model="local-agent",
                api_key="",
                base_url=None,
            )
        )
        await client.chat.completions.create(
            model="local-agent",
            messages=[
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call-1",
                            "type": "function",
                            "function": {
                                "name": "mastery_assess",
                                "arguments": '{"knowledge_point_id":"kp-1","passed":true}',
                            },
                        }
                    ],
                },
                {
                    "role": "tool",
                    "name": "mastery_assess",
                    "tool_call_id": "call-1",
                    "content": '{"mastered":true}',
                },
            ],
        )

    rendered = backend.calls[0][0]
    assert "[Assistant tool calls]" in rendered
    assert '"name":"mastery_assess"' in rendered
    assert '"id":"call-1"' in rendered
    assert "[Tool result name=mastery_assess call_id=call-1]" in rendered
    assert '{"mastered":true}' in rendered


def test_selected_subagent_supplies_virtual_config_without_cloud(monkeypatch) -> None:
    """Capability construction must not require a cloud model or API key."""
    from deeptutor.services.llm import config as config_module

    _bind(monkeypatch)
    monkeypatch.setattr(
        config_module,
        "_get_llm_config_from_resolver",
        lambda: (_ for _ in ()).throw(AssertionError("cloud config must not be read")),
    )
    context = UnifiedContext(knowledge_bases=["myagent"], session_id="local-only")

    with selected_subagent_scope(context):
        config = config_module.get_llm_config()

    assert config.binding == "local_agent"
    assert config.model == "local-agent"
    assert config.api_key == ""


def test_selected_subagent_transport_preserves_mastery_tools(monkeypatch) -> None:
    """Using a local Agent as the model must not activate recursive delegation."""
    from deeptutor.agents.chat.agentic_pipeline import AgenticChatPipeline

    _bind(monkeypatch)
    context = UnifiedContext(
        knowledge_bases=["myagent"],
        session_id="local-mastery-tools",
        metadata={"mastery_mode": True, "mastery_path_id": "path-1"},
    )

    with selected_subagent_scope(context):
        pipeline = AgenticChatPipeline(language="en")
        tools = pipeline._compose_enabled_tools(context)

    assert "mastery_status" in tools
    assert "mastery_assess" in tools
    assert "ask_user" in tools
    assert "consult_subagent" not in tools
    assert pipeline._coexisting_rag_kbs(context) == []


@pytest.mark.asyncio
async def test_selected_subagent_failure_does_not_fall_back_to_model_provider(monkeypatch) -> None:
    from deeptutor.services.llm import complete

    _bind(monkeypatch)

    class FailedBackend:
        async def consult(self, *_args, **_kwargs):
            return ConsultResult(
                final_text="",
                session_id=None,
                success=False,
                error="local agent failed",
            )

    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: FailedBackend())
    context = UnifiedContext(knowledge_bases=["myagent"], session_id="failed-local-agent")

    with selected_subagent_scope(context), pytest.raises(RuntimeError, match="local agent failed"):
        await complete(prompt="Never use a cloud fallback")


@pytest.mark.asyncio
async def test_chat_capability_preserves_agentic_pipeline_for_selected_subagent(monkeypatch) -> None:
    _bind(monkeypatch)
    backend = _FakeBackend()
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: backend)
    pipeline_runs: list[UnifiedContext] = []

    class RecordingPipeline:
        def __init__(self, **_kwargs) -> None:
            pass

        async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
            pipeline_runs.append(context)
            await stream.content("pipeline output", source="chat")

    monkeypatch.setattr("deeptutor.agents.chat.capability.AgenticChatPipeline", RecordingPipeline)
    bus = StreamBus()
    events = []

    async def consume() -> None:
        async for event in bus.subscribe():
            events.append(event)

    consumer = asyncio.create_task(consume())
    await asyncio.sleep(0)
    await ChatCapability().run(
        UnifiedContext(user_message="ping", knowledge_bases=["myagent"]), bus
    )
    await bus.close()
    await consumer

    assert len(pipeline_runs) == 1
    assert backend.calls == []
    assert any(
        event.type == StreamEventType.CONTENT and event.content == "pipeline output"
        for event in events
    )


# ---- consult tool ------------------------------------------------------------


class _FakeBackend:
    kind = "claude_code"

    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None]] = []
        self.last_images: list[str] | None = None

    async def consult(
        self, question, *, on_event, cwd, session_id, config, images=None, partner_id=None
    ):
        self.calls.append((question, session_id))
        self.last_images = images
        await on_event(SubagentEvent(kind="tool", text="$ ls"))
        await on_event(SubagentEvent(kind="result", text=f"answer:{question}"))
        return ConsultResult(
            final_text=f"answer:{question}",
            session_id="sess-1",
            success=True,
            event_count=2,
        )


def _spec(state: dict, *, budget: int = 2) -> dict:
    return {
        "kind": "claude_code",
        "cwd": "",
        "name": "myagent",
        "budget": budget,
        "config": BackendConfig(),
        "state": state,
    }


@pytest.mark.asyncio
async def test_consult_streams_events_and_threads_session(monkeypatch) -> None:
    backend = _FakeBackend()
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: backend)
    tool = ConsultSubagentTool()
    state: dict = {"count": 0, "session_id": None, "name": "myagent"}
    streamed: list[tuple[str, str, str]] = []

    async def sink(event_type, message, metadata=None):
        streamed.append((event_type, message, (metadata or {}).get("subagent_channel", "")))

    res1 = await tool.execute(question="Q1", _subagent=_spec(state), event_sink=sink)
    assert res1.success is True
    assert "answer:Q1" in res1.content
    assert state["count"] == 1
    assert state["session_id"] == "sess-1"  # captured for continuity
    # Every native event streamed out under the single subagent trace_kind.
    assert all(etype == "subagent_event" for etype, _, _ in streamed)
    channels = {chan for _, _, chan in streamed}
    assert "tool" in channels and "result" in channels

    # Second consult resumes the same backend session.
    await tool.execute(question="Q2", _subagent=_spec(state), event_sink=sink)
    assert backend.calls[1] == ("Q2", "sess-1")


@pytest.mark.asyncio
async def test_consult_budget_is_authoritative(monkeypatch) -> None:
    backend = _FakeBackend()
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: backend)
    tool = ConsultSubagentTool()
    state: dict = {"count": 0, "session_id": None, "name": "myagent"}

    async def sink(*_a, **_k):
        return None

    await tool.execute(question="Q1", _subagent=_spec(state, budget=1), event_sink=sink)
    # Budget of 1 is spent → the second consult is refused without driving the backend.
    refused = await tool.execute(question="Q2", _subagent=_spec(state, budget=1), event_sink=sink)
    assert refused.success is False
    assert "budget" in refused.content.lower()
    assert len(backend.calls) == 1  # backend never invoked the second time


@pytest.mark.asyncio
async def test_consult_without_spec_is_graceful() -> None:
    res = await ConsultSubagentTool().execute(question="hi")
    assert res.success is False and "no subagent" in res.content.lower()


@pytest.mark.asyncio
async def test_session_id_persists_across_turns(monkeypatch, tmp_path) -> None:
    # A backend session id captured in one turn is remembered (keyed by chat
    # session + connection) and resumed by the next turn's augment_kwargs — so
    # the local agent keeps context across DeepTutor's separate messages.
    from deeptutor.services.subagent import sessions as sess

    monkeypatch.setattr(sess, "_path", lambda: tmp_path / "subagent_sessions.json")
    _bind(monkeypatch)  # "myagent" → claude_code
    backend = _FakeBackend()
    monkeypatch.setattr("deeptutor.services.subagent.get_backend", lambda kind: backend)

    cap = SubagentCapability()
    tool = ConsultSubagentTool()

    async def sink(*_a, **_k):
        return None

    # Turn 1: nothing remembered yet → consult creates "sess-1", which persists.
    ctx1 = UnifiedContext(user_message="hi", knowledge_bases=["myagent"], session_id="chatA")
    spec1 = cap.augment_kwargs("consult_subagent", {"question": "Q1"}, ctx1)["_subagent"]
    assert spec1["state"]["session_id"] is None
    await tool.execute(question="Q1", _subagent=spec1, event_sink=sink)
    assert sess.get_session(sess.session_key("chatA", "myagent")) == "sess-1"

    # Turn 2 (fresh context): augment_kwargs seeds the remembered session.
    ctx2 = UnifiedContext(user_message="more", knowledge_bases=["myagent"], session_id="chatA")
    spec2 = cap.augment_kwargs("consult_subagent", {"question": "Q2"}, ctx2)["_subagent"]
    assert spec2["state"]["session_id"] == "sess-1"

    # A different chat session does not inherit the agent session.
    ctx3 = UnifiedContext(user_message="hi", knowledge_bases=["myagent"], session_id="chatB")
    spec3 = cap.augment_kwargs("consult_subagent", {"question": "Q"}, ctx3)["_subagent"]
    assert spec3["state"]["session_id"] is None
