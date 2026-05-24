# tests/test_chunking.py
import os
import tempfile
from pathlib import Path
import pytest
from docx import Document
from app.services.chunking import (
    Chunk,
    extract_chunks_from_docx,
    extract_chunks_from_ce_data,
)


# ── helpers ──────────────────────────────────────────────────────────────────

def make_docx(paragraphs: list[tuple[str, str]]) -> Path:
    """Create a temp DOCX. paragraphs = [(style_name, text)]"""
    doc = Document()
    for style, text in paragraphs:
        p = doc.add_paragraph(text)
        try:
            p.style = doc.styles[style]
        except KeyError:
            pass  # fall back to Normal
    path = Path(tempfile.mktemp(suffix=".docx"))
    doc.save(path)
    return path


# ── extract_chunks_from_docx ─────────────────────────────────────────────────

def test_extracts_contexte_section():
    path = make_docx([
        ("Heading 1", "CONTEXTE, PROBLEMATIQUE ET OBJECTIFS DE L'ÉTUDE"),
        ("Normal", "Le client souhaite améliorer ses processus."),
        ("Normal", "C'est pourquoi il a contacté JuMP."),
    ])
    try:
        chunks = extract_chunks_from_docx(path)
        assert len(chunks) == 1
        assert chunks[0].section == "contexte"
        assert "souhaite améliorer" in chunks[0].text
    finally:
        os.unlink(path)


def test_skips_comment_faire_lines():
    path = make_docx([
        ("Heading 1", "CAHIER DES CHARGES"),
        ("Normal", "Livrable: rapport d'analyse."),
        ("Normal", "Comment faire - À RETIRER À LA FIN"),
        ("Normal", "Note interne qui ne doit pas apparaître."),
    ])
    try:
        chunks = extract_chunks_from_docx(path)
        assert len(chunks) == 1
        assert "Note interne" not in chunks[0].text
        assert "Livrable" in chunks[0].text
    finally:
        os.unlink(path)


def test_splits_methodology_into_phase_chunks():
    path = make_docx([
        ("Heading 1", "MÉTHODOLOGIE DE L'ETUDE"),
        ("Normal", "Phase 1: Audit — Description de l'audit."),
        ("Normal", "Suite de la phase 1."),
        ("Normal", "Phase 2: Développement — Description du dev."),
    ])
    try:
        chunks = extract_chunks_from_docx(path)
        phase_chunks = [c for c in chunks if c.section == "phase"]
        assert len(phase_chunks) == 2
        assert phase_chunks[0].phase_index == 1
        assert phase_chunks[1].phase_index == 2
        assert "Audit" in phase_chunks[0].text
        assert "Développement" in phase_chunks[1].text
    finally:
        os.unlink(path)


def test_empty_docx_returns_no_chunks():
    path = make_docx([])
    try:
        chunks = extract_chunks_from_docx(path)
        assert chunks == []
    finally:
        os.unlink(path)


# ── extract_chunks_from_ce_data ───────────────────────────────────────────────

def test_ce_data_extracts_all_sections():
    ce_data = {
        "contexte": "Voici le contexte.",
        "detail_cdc": "Voici le cahier des charges détaillé.",
        "resume_cdc": "Résumé du CDC.",
        "phases": [
            {"name": "Phase 1: Audit", "description": "Description de l'audit."},
            {"name": "Phase 2: Dev", "description": "Description du développement."},
        ],
    }
    chunks = extract_chunks_from_ce_data(ce_data)
    sections = [c.section for c in chunks]
    assert "contexte" in sections
    assert "cdc" in sections
    assert "definition" in sections
    assert sections.count("phase") == 2


def test_ce_data_phase_indices_are_sequential():
    ce_data = {
        "phases": [
            {"name": "P1", "description": "D1"},
            {"name": "P2", "description": "D2"},
            {"name": "P3", "description": "D3"},
        ]
    }
    chunks = extract_chunks_from_ce_data(ce_data)
    phase_chunks = [c for c in chunks if c.section == "phase"]
    assert [c.phase_index for c in phase_chunks] == [1, 2, 3]


def test_ce_data_skips_missing_optional_fields():
    ce_data = {"contexte": "Contexte only."}
    chunks = extract_chunks_from_ce_data(ce_data)
    assert len(chunks) == 1
    assert chunks[0].section == "contexte"
