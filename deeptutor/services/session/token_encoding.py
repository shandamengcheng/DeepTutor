"""Load the history tokenizer from local data without implicit HTTP downloads.

Tiktoken's standard factory downloads a missing vocabulary synchronously and
without a request timeout. Calling it from a turn blocks the event loop and
its owner heartbeat. History accounting instead falls back immediately when
the local vocabulary is missing or corrupt.
"""

from __future__ import annotations

import base64
from functools import lru_cache
import hashlib
import os
from pathlib import Path
import tempfile
from typing import Any

# cl100k_base's public vocabulary and checksum, as defined by tiktoken.
_VOCABULARY_URL = "https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken"
_VOCABULARY_HASH = "223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7"
_PATTERN = (
    r"'(?i:[sdmt]|ll|ve|re)|[^\r\n\p{L}\p{N}]?+\p{L}++|\p{N}{1,3}+|"
    r" ?[^\s\p{L}\p{N}]++[\r\n]*+|\s++$|\s*[\r\n]|\s+(?!\S)|\s"
)
_SPECIAL_TOKENS = {
    "<|endoftext|>": 100257,
    "<|fim_prefix|>": 100258,
    "<|fim_middle|>": 100259,
    "<|fim_suffix|>": 100260,
    "<|endofprompt|>": 100276,
}


@lru_cache(maxsize=4)
def _load_encoding(path: str, modified_ns: int, size: int) -> Any:
    # Metadata keys invalidate the cached result when a vocabulary is replaced.
    del modified_ns, size
    import tiktoken

    contents = Path(path).read_bytes()
    if hashlib.sha256(contents).hexdigest() != _VOCABULARY_HASH:
        return None
    ranks = {}
    for line in contents.splitlines():
        token, rank = line.split()
        ranks[base64.b64decode(token, validate=True)] = int(rank)
    # Construct from the verified bytes directly. Even deleting the cache
    # during this call cannot make a factory fall through to a network fetch.
    return tiktoken.Encoding(
        name="cl100k_base",
        pat_str=_PATTERN,
        mergeable_ranks=ranks,
        special_tokens=_SPECIAL_TOKENS,
    )


def get_local_token_encoding() -> Any:
    """Return the local cl100k_base encoding, or None for heuristic accounting."""
    cache_dir = os.environ.get(
        "TIKTOKEN_CACHE_DIR",
        os.environ.get("DATA_GYM_CACHE_DIR", str(Path(tempfile.gettempdir()) / "data-gym-cache")),
    )
    if not cache_dir:
        return None
    path = Path(cache_dir) / hashlib.sha1(_VOCABULARY_URL.encode()).hexdigest()
    try:
        stat = path.stat()
        return _load_encoding(str(path), stat.st_mtime_ns, stat.st_size)
    except Exception:
        # Optional tokenizer/dependency/cache failures must not fail the turn.
        return None
