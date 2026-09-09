"""Direct-chat bridge for a selected connected subagent.

A connected agent is selected from the same knowledge-base picker as a normal
knowledge base.  Unlike the legacy consult path, this bridge makes that agent
the turn owner: no configured DeepTutor LLM is required before the local CLI
starts.  Native CLI events remain available in the per-agent transcript while
the CLI's final answer becomes the chat reply.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
import shutil

from deeptutor.capabilities.subagent.binding import connection_for_turn
from deeptutor.capabilities.subagent.tools import _stage_images
from deeptutor.core.context import UnifiedContext
from deeptutor.runtime.stream_bus import StreamBus
from deeptutor.services.subagent.types import ConsultResult, SubagentEvent

SubagentEventHandler = Callable[[SubagentEvent], Awaitable[None]]


async def _ignore_subagent_event(_event: SubagentEvent) -> None:
    return None


def _direct_request(context: UnifiedContext) -> str:
    """Render a direct-agent request without dropping turn-scoped context.

    Local Agents own the chat turn, so they do not traverse the normal LLM
    prompt builder.  ``sidebar_context`` carries deliberately per-turn input
    such as the Little Tutor's selected passage; it must therefore travel with
    the direct request instead of being silently discarded.
    """

    user_message = context.user_message.strip()
    if not context.sidebar_context.strip():
        # Keep the existing CLI prompt shape for ordinary direct chats, whose
        # resumed sessions may depend on receiving the user's text verbatim.
        return user_message
    return "\n\n".join(
        [
            f"[System context]\n{context.sidebar_context.strip()}",
            f"[User]\n{user_message}",
        ]
    )


async def consult_selected_subagent(
    context: UnifiedContext,
    question: str,
    *,
    on_event: SubagentEventHandler | None = None,
) -> ConsultResult | None:
    """Ask the selected connected agent and resume its persisted session.

    ``None`` means the turn has no connected-agent selection.  The caller owns
    result/error presentation because direct chat and metadata-only follow-up
    calls have different user-visible behavior.
    """

    connection = connection_for_turn(context)
    if connection is None:
        return None

    from deeptutor.services.subagent import get_backend, load_subagent_settings
    from deeptutor.services.subagent.sessions import get_session, remember_session, session_key

    name = connection["name"]
    kind = connection["kind"]
    backend = get_backend(kind)
    if backend is None:
        raise RuntimeError(f"Unknown connected-agent backend: {kind!r}")

    chat_session_id = str(context.session_id or "")
    stored_session_key = session_key(chat_session_id, name) if chat_session_id else ""
    resume_id = get_session(stored_session_key) if stored_session_key else None
    config = load_subagent_settings().backend(kind)
    images = (
        [attachment for attachment in context.attachments if attachment.type == "image"]
        if config.forward_images
        else []
    )
    image_dir, image_paths = _stage_images(images)
    try:
        result = await backend.consult(
            question,
            on_event=on_event or _ignore_subagent_event,
            cwd=connection.get("cwd") or None,
            session_id=resume_id,
            config=config,
            images=image_paths or None,
            partner_id=connection.get("partner_id") or None,
        )
    finally:
        if image_dir is not None:
            shutil.rmtree(image_dir, ignore_errors=True)

    if stored_session_key and result.session_id:
        remember_session(
            stored_session_key,
            result.session_id,
            kind=kind,
            cwd=connection.get("cwd") or "",
        )
    return result


async def run_direct_subagent(context: UnifiedContext, stream: StreamBus) -> bool:
    """Run the selected local agent directly and return whether one was selected.

    Returning ``False`` lets ordinary chat continue unchanged when no connected
    agent was selected.  Failures from a selected agent deliberately raise so
    the normal turn runtime marks the turn failed instead of silently falling
    back to the default LLM.
    """

    connection = connection_for_turn(context)
    if connection is None:
        return False

    name = connection["name"]
    kind = connection["kind"]
    metadata = {
        "trace_kind": "subagent_event",
        "subagent_kind": kind,
        "subagent_name": name,
        "subagent_direct": True,
    }

    async def emit_trace(channel: str, text: str, extra: dict | None = None) -> None:
        if not text:
            return
        event_metadata = {**metadata, "subagent_channel": channel}
        merge_id = (extra or {}).get("merge_id")
        if merge_id:
            event_metadata["subagent_merge_id"] = f"direct:{merge_id}"
        await stream.progress(
            text,
            source="subagent",
            stage="direct",
            metadata=event_metadata,
        )

    async def on_event(event: SubagentEvent) -> None:
        await emit_trace(event.kind, event.text, event.meta)

    request = _direct_request(context)
    await emit_trace("user_question", context.user_message)
    result = await consult_selected_subagent(context, request, on_event=on_event)
    if result is None:
        return False

    if not result.success:
        raise RuntimeError(result.error or f"{name} did not complete the request")
    if not result.final_text:
        raise RuntimeError(f"{name} produced no final answer")

    # Native text frames are progress events (often cumulative). Emit the final
    # answer once as CONTENT so the turn store and main chat bubble don't save
    # repeated streaming prefixes.
    await stream.content(
        result.final_text,
        source="subagent",
        stage="direct",
        metadata={**metadata, "subagent_channel": "result"},
    )
    return True
