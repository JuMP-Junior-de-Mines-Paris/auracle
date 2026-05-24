# tests/test_rag_ingest.py
import uuid
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

CE_ID = str(uuid.uuid4())

MOCK_CE = {
    "id": CE_ID,
    "ref_ce": "CE-2025-001",
    "ce_data": {
        "contexte": "Voici le contexte de l'étude client.",
        "detail_cdc": "Le livrable attendu est un rapport.",
        "resume_cdc": "Résumé du CDC.",
        "phases": [
            {"name": "Phase 1: Audit", "description": "Audit de l'existant."},
            {"name": "Phase 2: Analyse", "description": "Analyse approfondie."},
        ],
    },
    "status": "draft",
}


def _make_app():
    """Import app fresh each test to avoid cached route registration."""
    from app.main import app
    return app


def _mock_db_for_ce(mock_supabase, ce_data):
    """Wire mock supabase to return ce_data on select."""
    mock_supabase.table.return_value.select.return_value.eq.return_value \
        .single.return_value.execute.return_value.data = ce_data
    mock_supabase.table.return_value.delete.return_value.eq.return_value \
        .execute.return_value = None
    mock_supabase.table.return_value.insert.return_value \
        .execute.return_value = None
    mock_supabase.table.return_value.update.return_value.eq.return_value \
        .execute.return_value = None


def test_ingest_ce_returns_correct_chunk_count():
    # MOCK_CE has: contexte + resume_cdc + detail_cdc + 2 phases = 5 chunks
    with (
        patch("app.routers.rag.get_current_user", return_value=MagicMock(id="u1")),
        patch("app.routers.rag.get_supabase_client") as mock_db,
        patch("app.routers.rag.embed_texts") as mock_embed,
    ):
        mock_supabase = MagicMock()
        _mock_db_for_ce(mock_supabase, MOCK_CE)
        mock_db.return_value = mock_supabase
        mock_embed.return_value = [[0.1] * 1024 for _ in range(5)]

        client = TestClient(_make_app())
        response = client.post(
            "/rag/ingest-ce",
            json={"ce_id": CE_ID},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        assert response.json()["chunks_created"] == 5


def test_ingest_ce_calls_embed_with_all_texts():
    with (
        patch("app.routers.rag.get_current_user", return_value=MagicMock(id="u1")),
        patch("app.routers.rag.get_supabase_client") as mock_db,
        patch("app.routers.rag.embed_texts") as mock_embed,
    ):
        mock_supabase = MagicMock()
        _mock_db_for_ce(mock_supabase, MOCK_CE)
        mock_db.return_value = mock_supabase
        mock_embed.return_value = [[0.0] * 1024 for _ in range(5)]

        client = TestClient(_make_app())
        client.post(
            "/rag/ingest-ce",
            json={"ce_id": CE_ID},
            headers={"Authorization": "Bearer test-token"},
        )

        texts_arg = mock_embed.call_args[0][0]
        assert len(texts_arg) == 5
        assert any("contexte" in t.lower() for t in texts_arg)


def test_ingest_ce_returns_404_for_missing_ce():
    with (
        patch("app.routers.rag.get_current_user", return_value=MagicMock(id="u1")),
        patch("app.routers.rag.get_supabase_client") as mock_db,
    ):
        mock_supabase = MagicMock()
        _mock_db_for_ce(mock_supabase, None)
        mock_db.return_value = mock_supabase

        client = TestClient(_make_app())
        response = client.post(
            "/rag/ingest-ce",
            json={"ce_id": str(uuid.uuid4())},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 404


def test_ingest_ce_returns_422_when_ce_data_empty():
    empty_ce = {**MOCK_CE, "ce_data": {}}
    with (
        patch("app.routers.rag.get_current_user", return_value=MagicMock(id="u1")),
        patch("app.routers.rag.get_supabase_client") as mock_db,
    ):
        mock_supabase = MagicMock()
        _mock_db_for_ce(mock_supabase, empty_ce)
        mock_db.return_value = mock_supabase

        client = TestClient(_make_app())
        response = client.post(
            "/rag/ingest-ce",
            json={"ce_id": CE_ID},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 422
