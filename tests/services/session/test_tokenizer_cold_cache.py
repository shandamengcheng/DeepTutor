"""Cold token accounting must not starve a turn owner's heartbeat."""

import asyncio
import time

import pytest

from deeptutor.agents.loop.context_budget import detect_counter_name
from deeptutor.runtime.coordination.memory import MemoryCoordinator
from deeptutor.services.session.context_builder import count_tokens


@pytest.mark.asyncio
async def test_cold_token_count_keeps_learning_turn_lease_alive(monkeypatch, tmp_path):
    import requests
    import tiktoken.registry

    monkeypatch.setenv("TIKTOKEN_CACHE_DIR", str(tmp_path))
    monkeypatch.delitem(tiktoken.registry.ENCODINGS, "cl100k_base", raising=False)
    downloads = []

    def slow_download(*args, **kwargs):
        downloads.append(args)
        time.sleep(0.12)
        raise requests.ConnectionError("simulated slow tokenizer download")

    monkeypatch.setattr(requests, "get", slow_download)
    coordinator = MemoryCoordinator(lease_ttl_seconds=0.06)
    lease = await coordinator.acquire_turn("turn", "learning-session", "worker")

    async def heartbeat():
        await asyncio.sleep(0.02)
        return await coordinator.renew_turn(lease)

    renewal = asyncio.create_task(heartbeat())
    await asyncio.sleep(0)
    assert count_tokens("Explain controller and service boundaries") > 0
    renewed = await renewal
    assert renewed is not None, "Token counting blocked the turn's lease renewal"
    assert not downloads, "Context accounting must not download tokenizer data"


def test_counter_label_does_not_download_on_cold_cache(monkeypatch, tmp_path):
    import requests
    import tiktoken.registry

    monkeypatch.setenv("TIKTOKEN_CACHE_DIR", str(tmp_path))
    monkeypatch.delitem(tiktoken.registry.ENCODINGS, "cl100k_base", raising=False)
    downloads = []

    def unavailable(*args, **kwargs):
        downloads.append(args)
        raise requests.ConnectionError("offline")

    monkeypatch.setattr(requests, "get", unavailable)
    assert detect_counter_name() == "heuristic"
    assert not downloads, "The counter label must not trigger network initialization"
