# app/services/embedding.py
import logging
import voyageai
from app.config import settings

logger = logging.getLogger(__name__)
_client: voyageai.Client | None = None


def _get_client() -> voyageai.Client:
    global _client
    if _client is None:
        _client = voyageai.Client(api_key=settings.voyage_api_key)
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of document strings. Returns one 1024-dim vector per text."""
    result = _get_client().embed(texts, model="voyage-3", input_type="document")
    return result.embeddings


def embed_query(text: str) -> list[float]:
    """Embed a single search query string. Returns a 1024-dim vector."""
    result = _get_client().embed([text], model="voyage-3", input_type="query")
    return result.embeddings[0]
