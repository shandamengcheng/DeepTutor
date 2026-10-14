"""Local-only tokenizer loading preserves the upstream cl100k_base format."""

import base64
import hashlib

import pytest

from deeptutor.agents.loop.context_budget import detect_counter_name
from deeptutor.services.session import token_encoding
from deeptutor.services.session.context_builder import count_tokens


@pytest.fixture
def local_vocabulary(monkeypatch, tmp_path):
    # A small valid BPE vocabulary covers every byte, avoiding network fixtures.
    ranks = {bytes([n]): n for n in range(256)}
    contents = b"".join(
        base64.b64encode(token) + b" " + str(rank).encode() + b"\n" for token, rank in ranks.items()
    )
    monkeypatch.setattr(token_encoding, "_VOCABULARY_HASH", hashlib.sha256(contents).hexdigest())
    monkeypatch.setenv("TIKTOKEN_CACHE_DIR", str(tmp_path))
    path = tmp_path / hashlib.sha1(token_encoding._VOCABULARY_URL.encode()).hexdigest()
    path.write_bytes(contents)
    token_encoding._load_encoding.cache_clear()
    yield path, ranks
    token_encoding._load_encoding.cache_clear()


def test_cached_vocabulary_matches_upstream_constructor(monkeypatch, local_vocabulary):
    import tiktoken
    from tiktoken_ext import openai_public

    _, ranks = local_vocabulary
    monkeypatch.setattr(openai_public, "load_tiktoken_bpe", lambda *a, **k: ranks)
    expected = tiktoken.Encoding(**openai_public.cl100k_base())
    actual = token_encoding.get_local_token_encoding()
    for text in ["Hello, world!", "控制器与服务", "1234567\n  x", "we're testing"]:
        assert actual.encode(text) == expected.encode(text)
        assert count_tokens(text) == len(expected.encode(text))
    assert detect_counter_name() == "cl100k_base"


def test_corrupt_or_replaced_cache_falls_back_without_network(monkeypatch, local_vocabulary):
    import requests

    path, _ = local_vocabulary
    monkeypatch.setattr(requests, "get", lambda *a, **k: pytest.fail("unexpected network"))
    assert token_encoding.get_local_token_encoding() is not None
    path.write_bytes(b"corrupted")
    assert token_encoding.get_local_token_encoding() is None
    assert detect_counter_name() == "heuristic"
    assert count_tokens("abcdefgh") == 2


def test_data_gym_cache_directory_is_supported(monkeypatch, local_vocabulary):
    path, _ = local_vocabulary
    monkeypatch.delenv("TIKTOKEN_CACHE_DIR")
    monkeypatch.setenv("DATA_GYM_CACHE_DIR", str(path.parent))
    assert token_encoding.get_local_token_encoding() is not None


def test_empty_cache_directory_disables_tokenizer(monkeypatch, local_vocabulary):
    monkeypatch.setenv("TIKTOKEN_CACHE_DIR", "")
    assert token_encoding.get_local_token_encoding() is None
