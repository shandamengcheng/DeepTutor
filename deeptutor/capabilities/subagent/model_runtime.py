"""Route model-service calls to the connected agent selected for a turn.

Capabilities are not the only consumers of :mod:`deeptutor.services.llm`.
Helpers such as notebook analysis and tool-owned follow-up generation also
call the factory directly.  A context-local binding lets those calls retain
the user's selected connected agent without changing the factory API or
falling back to a configured cloud provider.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar, Token
import json
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from deeptutor.core.context import UnifiedContext


_turn_context: ContextVar[UnifiedContext | None] = ContextVar(
    "selected_subagent_turn_context", default=None
)


@contextmanager
def selected_subagent_scope(context: UnifiedContext) -> Iterator[None]:
    """Make ``context`` available to model-service calls in this task.

    The scope is deliberately installed even when no agent is selected.  That
    makes nested scopes deterministic, while :func:`complete_with_selected_subagent`
    remains a no-op unless the context actually selects a connected agent.
    """

    token = activate_selected_subagent_scope(context)
    try:
        yield
    finally:
        reset_selected_subagent_scope(token)


def activate_selected_subagent_scope(context: UnifiedContext) -> Token[UnifiedContext | None]:
    """Install a connected-agent context across an async turn."""

    return _turn_context.set(context)


def reset_selected_subagent_scope(token: Token[UnifiedContext | None]) -> None:
    """Restore the prior connected-agent context."""

    _turn_context.reset(token)


def selected_subagent_is_active() -> bool:
    """Return whether this async turn has a usable connected Agent selected."""

    context = _turn_context.get()
    if context is None:
        return False
    from deeptutor.capabilities.subagent.binding import connection_for_turn

    return connection_for_turn(context) is not None


def _content_text(content: Any) -> str:
    """Flatten OpenAI-style message content for a CLI-agent prompt."""

    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text).strip())
            elif item:
                parts.append(str(item).strip())
        return "\n".join(part for part in parts if part)
    return str(content or "").strip()


def _tool_calls_text(tool_calls: Any) -> str:
    """Serialize only the portable identity/arguments of prior tool calls."""

    if not isinstance(tool_calls, list):
        return ""
    portable: list[dict[str, Any]] = []
    for call in tool_calls:
        if not isinstance(call, dict):
            continue
        function = call.get("function")
        if not isinstance(function, dict):
            continue
        portable.append(
            {
                "id": str(call.get("id") or ""),
                "name": str(function.get("name") or ""),
                "arguments": function.get("arguments") or "{}",
            }
        )
    if not portable:
        return ""
    return json.dumps(portable, ensure_ascii=False, separators=(",", ":"))


def _render_request(
    *,
    prompt: str,
    system_prompt: str,
    messages: list[dict[str, Any]] | None,
) -> str:
    """Preserve role instructions when adapting a completion to a CLI agent."""

    rendered: list[str] = []
    if system_prompt.strip():
        rendered.append(f"[System instructions]\n{system_prompt.strip()}")
    for message in messages or []:
        raw_role = str(message.get("role") or "user").strip().lower()
        role = raw_role.title()
        content = _content_text(message.get("content"))
        if content:
            if raw_role == "tool":
                name = str(message.get("name") or "unknown")
                call_id = str(message.get("tool_call_id") or "unknown")
                rendered.append(f"[Tool result name={name} call_id={call_id}]\n{content}")
            else:
                rendered.append(f"[{role}]\n{content}")
        tool_calls = _tool_calls_text(message.get("tool_calls"))
        if tool_calls:
            rendered.append(f"[{role} tool calls]\n{tool_calls}")
    if not messages and prompt.strip():
        rendered.append(f"[User]\n{prompt.strip()}")
    return "\n\n".join(rendered)


async def complete_with_selected_subagent(
    *,
    prompt: str,
    system_prompt: str,
    messages: list[dict[str, Any]] | None,
) -> str | None:
    """Return a connected-agent completion, or ``None`` outside such a turn.

    A selected agent is authoritative: an unavailable/failed backend raises
    instead of silently sending the same prompt to the configured LLM.
    """

    context = _turn_context.get()
    if context is None:
        return None

    from deeptutor.capabilities.subagent.direct import consult_selected_subagent

    request = _render_request(
        prompt=prompt,
        system_prompt=system_prompt,
        messages=messages,
    )
    result = await consult_selected_subagent(context, request)
    if result is None:
        return None
    if not result.success:
        raise RuntimeError(result.error or "Selected local agent did not complete the model request")
    if not result.final_text:
        raise RuntimeError("Selected local agent produced no model response")
    return result.final_text


class _SelectedSubagentStream:
    """One-frame OpenAI-compatible stream backed by a local CLI Agent."""

    def __init__(self, text: str) -> None:
        self._text = text
        self._sent = False

    def __aiter__(self) -> "_SelectedSubagentStream":
        return self

    async def __anext__(self) -> Any:
        if self._sent:
            raise StopAsyncIteration
        self._sent = True
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    delta=SimpleNamespace(
                        content=self._text,
                        reasoning_content=None,
                        tool_calls=[],
                    ),
                    finish_reason="stop",
                    provider_specific_fields=None,
                )
            ],
            usage=None,
        )

    async def close(self) -> None:
        return None


class _SelectedSubagentCompletions:
    async def create(self, **kwargs: Any) -> Any:
        text = await complete_with_selected_subagent(
            prompt="",
            system_prompt="",
            messages=kwargs.get("messages") or [],
        )
        if text is None:
            raise RuntimeError("Selected local Agent scope disappeared during model execution")
        if kwargs.get("stream"):
            return _SelectedSubagentStream(text)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(role="assistant", content=text, tool_calls=[]),
                    finish_reason="stop",
                )
            ],
            usage=None,
        )


class _SelectedSubagentOpenAIClient:
    """OpenAI-shaped client that keeps capability pipelines on the local Agent."""

    def __init__(self) -> None:
        self.chat = SimpleNamespace(completions=_SelectedSubagentCompletions())

    async def close(self) -> None:
        return None


def build_selected_subagent_openai_client() -> Any | None:
    """Build the agentic-loop transport without bypassing the Capability."""

    if not selected_subagent_is_active():
        return None
    return _SelectedSubagentOpenAIClient()


__all__ = [
    "activate_selected_subagent_scope",
    "build_selected_subagent_openai_client",
    "complete_with_selected_subagent",
    "reset_selected_subagent_scope",
    "selected_subagent_is_active",
    "selected_subagent_scope",
]
