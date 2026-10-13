# app/services/chunking.py
from __future__ import annotations
import re
from dataclasses import dataclass
from pathlib import Path

from docx import Document


@dataclass
class Chunk:
    section: str
    text: str
    phase_index: int | None = None


_SECTION_MAP: dict[str, str] = {
    "CONTEXTE": "contexte",
    "PROBLEMATIQUE": "contexte",
    "DÉFINITION": "definition",
    "DEFINITION": "definition",
    "CAHIER DES CHARGES": "cdc",
    "MÉTHODOLOGIE": "phase",
    "METHODOLOGIE": "phase",
    "RÉFÉRENCES": "references",
    "REFERENCES": "references",
}

_PHASE_RE = re.compile(r"^Phase\s+\d+\s*:", re.IGNORECASE)
_SKIP_RE = re.compile(r"(COMMENT FAIRE|À RETIRER|A RETIRER)", re.IGNORECASE)


def extract_chunks_from_docx(path: Path) -> list[Chunk]:
    """Parse a CE DOCX and return one Chunk per logical section/phase."""
    doc = Document(path)
    chunks: list[Chunk] = []
    current_section: str | None = None
    current_text: list[str] = []
    current_phase_index: int | None = None
    phase_counter = 0
    skip_until_next_section = False

    def _flush() -> None:
        text = "\n".join(current_text).strip()
        if current_section and text:
            chunks.append(Chunk(
                section=current_section,
                text=text,
                phase_index=current_phase_index,
            ))

    for para in doc.paragraphs:
        raw = para.text.strip()
        if not raw:
            continue

        # Detect known section headings — always process these even during skip
        if para.style.name.startswith("Heading"):
            upper = raw.upper()
            matched = next(
                (v for k, v in _SECTION_MAP.items() if k in upper), None
            )
            if matched:
                _flush()
                current_text = []
                current_phase_index = None
                current_section = matched
                phase_counter = 0
                skip_until_next_section = False
                continue

        # Start skipping on editorial marker — skip it and all following lines
        if _SKIP_RE.search(raw):
            skip_until_next_section = True
            continue

        if skip_until_next_section:
            continue

        # Detect phase markers inside methodology
        if current_section == "phase" and _PHASE_RE.match(raw):
            _flush()
            phase_counter += 1
            current_text = [raw]
            current_phase_index = phase_counter
            continue

        if current_section:
            current_text.append(raw)

    _flush()
    return chunks


def extract_chunks_from_ce_data(ce_data: dict) -> list[Chunk]:
    """Extract Chunks from a CEData JSON dict (stored in ce_documents.ce_data)."""
    chunks: list[Chunk] = []

    if contexte := ce_data.get("contexte"):
        chunks.append(Chunk(section="contexte", text=contexte))

    if resume_cdc := ce_data.get("resume_cdc"):
        chunks.append(Chunk(section="definition", text=resume_cdc))

    # CEData (formulaire) dit « cdc » et « nom » ; les imports de l'ancien script disent « detail_cdc » et « name ».
    if detail_cdc := ce_data.get("cdc") or ce_data.get("detail_cdc"):
        chunks.append(Chunk(section="cdc", text=detail_cdc))

    for i, phase in enumerate(ce_data.get("phases", []), start=1):
        desc = phase.get("description", "").strip()
        name = (phase.get("nom") or phase.get("name") or "").strip()
        if desc:
            chunks.append(Chunk(
                section="phase",
                text=f"{name}: {desc}" if name else desc,
                phase_index=i,
            ))

    return chunks
