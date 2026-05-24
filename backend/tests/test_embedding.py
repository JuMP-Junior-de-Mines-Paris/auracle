# tests/test_embedding.py
from unittest.mock import MagicMock, patch
from app.services.embedding import embed_texts, embed_query


def _mock_voyage(n: int) -> MagicMock:
    m = MagicMock()
    m.embeddings = [[float(i)] * 1024 for i in range(n)]
    return m


def test_embed_texts_returns_one_vector_per_text():
    texts = ["texte A", "texte B", "texte C"]
    with patch("app.services.embedding._get_client") as mock_get:
        client = MagicMock()
        client.embed.return_value = _mock_voyage(3)
        mock_get.return_value = client

        result = embed_texts(texts)

        assert len(result) == 3
        assert len(result[0]) == 1024
        client.embed.assert_called_once_with(
            texts, model="voyage-3", input_type="document"
        )


def test_embed_texts_passes_document_input_type():
    with patch("app.services.embedding._get_client") as mock_get:
        client = MagicMock()
        client.embed.return_value = _mock_voyage(1)
        mock_get.return_value = client

        embed_texts(["hello"])

        _, kwargs = client.embed.call_args
        assert kwargs.get("input_type") == "document"


def test_embed_query_returns_single_vector():
    with patch("app.services.embedding._get_client") as mock_get:
        client = MagicMock()
        client.embed.return_value = _mock_voyage(1)
        mock_get.return_value = client

        result = embed_query("ma requête de recherche")

        assert len(result) == 1024
        client.embed.assert_called_once_with(
            ["ma requête de recherche"], model="voyage-3", input_type="query"
        )


def test_embed_query_passes_query_input_type():
    with patch("app.services.embedding._get_client") as mock_get:
        client = MagicMock()
        client.embed.return_value = _mock_voyage(1)
        mock_get.return_value = client

        embed_query("test")

        _, kwargs = client.embed.call_args
        assert kwargs.get("input_type") == "query"
