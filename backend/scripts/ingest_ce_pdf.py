# scripts/ingest_ce_pdf.py
"""
Ingest a CE (Convention d'Étude) PDF into the database.

Extracts structured data from the PDF using Claude, then writes to:
  - missions           (1 row)
  - mission_team       (1 row per JuMP member listed)
  - milestones         (1 row per phase)
  - ce_documents       (1 row, with ce_data JSON for RAG)
  - ce_chunks          (RAG vectors, embedded via Voyage AI)

Usage (from backend/ directory):
    python -m scripts.ingest_ce_pdf /path/to/ce.pdf --created-by <your-profile-uuid>
    python -m scripts.ingest_ce_pdf /path/to/ce.pdf --ref-ce CE-2024-001 --created-by <your-profile-uuid>

Idempotent on ref_ce: re-running with the same PDF updates the existing records.
"""
import sys
import json
import argparse
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber
import anthropic
from supabase import create_client

from app.config import settings
from app.services.chunking import extract_chunks_from_ce_data
from app.services.embedding import embed_texts


# ── Claude extraction prompt ───────────────────────────────────────────────────

_SYSTEM = """Tu es un assistant spécialisé dans l'extraction de données structurées
depuis des conventions d'étude (CE) de JuMP, un bureau d'études junior de l'École des Mines de Paris.
Tu réponds UNIQUEMENT avec du JSON valide, sans texte avant ou après."""

_USER_TEMPLATE = """Voici le texte brut d'une convention d'étude JuMP.
Extrais les informations et retourne un objet JSON avec exactement ces champs.
Pour les champs introuvables, utilise null.

TEXTE DU CE :
{text}

CHAMPS À EXTRAIRE :
{{
  "ref_ce": "référence du CE (ex: CE-2024-001) ou null",
  "title": "titre de la mission / objet de l'étude",
  "client_name": "nom de la société cliente",
  "client_contact_name": "nom complet du contact client (signataire côté client)",
  "client_contact_email": "email du contact client ou null",
  "start_date": "date de début au format YYYY-MM-DD ou null",
  "end_date": "date de fin au format YYYY-MM-DD ou null",
  "budget": "montant numérique en euros (ex: 8000) ou null si non précisé ou décrit en lettres",
  "description": "résumé de l'objectif de la mission en 2-3 phrases",
  "contexte": "texte complet de la section Contexte / Problématique",
  "resume_cdc": "résumé du cahier des charges (livrables attendus, périmètre)",
  "detail_cdc": "texte complet du cahier des charges détaillé",
  "phases": [
    {{
      "name": "nom de la phase (ex: Phase 1 : Audit)",
      "description": "description détaillée de la phase",
      "duration_weeks": null
    }}
  ],
  "team": [
    {{
      "prenom": "prénom du membre JuMP",
      "nom": "nom du membre JuMP",
      "role": "rôle (ex: Chef de Projet, Consultant)"
    }}
  ]
}}

Retourne UNIQUEMENT le JSON, sans markdown, sans explication."""


# ── PDF extraction ─────────────────────────────────────────────────────────────

def extract_text_from_pdf(path: Path) -> str:
    """Extract all text from a PDF, joining pages with double newlines."""
    pages = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text.strip())
    return "\n\n".join(pages)


# ── Claude structured extraction ───────────────────────────────────────────────

def extract_structured_data(text: str) -> dict:
    """Send PDF text to Claude Haiku and get back a structured dict."""
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    if len(text) > 12000:
        print(f"  [warn] PDF text is {len(text)} chars — truncating to 12,000 for Claude extraction. Some fields (phases, team) may be missed.")
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=_SYSTEM,
        messages=[{"role": "user", "content": _USER_TEMPLATE.format(text=text[:40000])}],
    )
    raw = message.content[0].text.strip()
    # Strip markdown code fences if Claude wrapped the JSON
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        raw = raw.lstrip()
        if raw.startswith("json"):
            raw = raw[4:].lstrip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Claude returned non-JSON output. First 500 chars:\n{raw[:500]}"
        ) from exc


# ── DB writes ──────────────────────────────────────────────────────────────────

def ingest(pdf_path: Path, ref_ce_override: str | None = None, created_by: str = "") -> None:
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # 1. Extract PDF text
    print(f"Extracting text from {pdf_path.name}...")
    text = extract_text_from_pdf(pdf_path)
    if not text.strip():
        print("ERROR: No text extracted from PDF. The file may be scanned (image-only).")
        sys.exit(1)
    print(f"  {len(text)} characters extracted.")

    # 2. Claude structured extraction
    print("Extracting structured data with Claude...")
    data = extract_structured_data(text)
    ref_ce = ref_ce_override or data.get("ref_ce") or pdf_path.stem
    print(f"  ref_ce: {ref_ce}")
    print(f"  title: {data.get('title')}")
    print(f"  client: {data.get('client_name')}")
    print(f"  phases: {len(data.get('phases') or [])}")
    print(f"  team: {len(data.get('team') or [])}")

    missing = [
        f for f in ("title", "client_name", "contexte", "phases")
        if not data.get(f)
    ]
    if missing:
        print(f"  [warn] Could not extract: {', '.join(missing)} — these will be null/empty")

    # 3. Check if this ref_ce already exists (idempotent re-run)
    print("Writing to database...")
    existing = (
        supabase.table("ce_documents")
        .select("id, mission_id")
        .eq("ref_ce", ref_ce)
        .execute()
    )
    if existing.data:
        ce_id = existing.data[0]["id"]
        mission_id = existing.data[0]["mission_id"]
        print(f"  ref_ce '{ref_ce}' already exists — updating existing records.")
        # Update mission fields
        supabase.table("missions").update({
            "title": data.get("title") or ref_ce,
            "description": data.get("description"),
            "client_name": data.get("client_name"),
            "client_contact_name": data.get("client_contact_name"),
            "client_contact_email": data.get("client_contact_email"),
            "start_date": data.get("start_date"),
            "end_date": data.get("end_date"),
            "budget": float(data["budget"]) if data.get("budget") else None,
        }).eq("id", mission_id).execute()
        # Clear stale team and milestones before re-inserting
        supabase.table("mission_team").delete().eq("mission_id", mission_id).execute()
        supabase.table("milestones").delete().eq("mission_id", mission_id).execute()
    else:
        # Insert new mission
        mission_row = {
            "title": data.get("title") or ref_ce,
            "description": data.get("description"),
            "client_name": data.get("client_name"),
            "client_contact_name": data.get("client_contact_name"),
            "client_contact_email": data.get("client_contact_email"),
            "start_date": data.get("start_date"),
            "end_date": data.get("end_date"),
            "budget": float(data["budget"]) if data.get("budget") else None,
            "status": "active",
            "created_by": created_by,
        }
        mission_resp = supabase.table("missions").insert(mission_row).execute()
        if not mission_resp.data:
            raise RuntimeError(f"Failed to insert mission: {mission_resp}")
        mission_id = mission_resp.data[0]["id"]
        print(f"  mission created: {mission_id}")

    # 4. Insert mission_team rows
    team = data.get("team") or []
    if team:
        team_rows = [
            {
                "mission_id": mission_id,
                "prenom": member.get("prenom", ""),
                "nom": member.get("nom", ""),
            }
            for member in team
            if member.get("prenom") or member.get("nom")
        ]
        if team_rows:
            team_resp = supabase.table("mission_team").insert(team_rows).execute()
            if not team_resp.data:
                print(f"  [warn] mission_team insert may have failed: {team_resp}")
            print(f"  {len(team_rows)} team members inserted")

    # 5. Insert milestones (one per phase)
    phases = data.get("phases") or []
    if phases:
        milestone_rows = [
            {
                "mission_id": mission_id,
                "title": phase.get("name", f"Phase {i + 1}"),
                "due_date": None,
            }
            for i, phase in enumerate(phases)
        ]
        ms_resp = supabase.table("milestones").insert(milestone_rows).execute()
        if not ms_resp.data:
            print(f"  [warn] milestones insert may have failed: {ms_resp}")
        print(f"  {len(milestone_rows)} milestones inserted")

    # 6. Upsert ce_documents
    ce_data = {
        "contexte": data.get("contexte"),
        "resume_cdc": data.get("resume_cdc"),
        "detail_cdc": data.get("detail_cdc"),
        "phases": [
            {"name": p.get("name", ""), "description": p.get("description", "")}
            for p in phases
        ],
    }
    ce_resp = (
        supabase.table("ce_documents")
        .upsert(
            {
                "mission_id": mission_id,
                "ref_ce": ref_ce,
                "ce_data": ce_data,
                "status": "final",
            },
            on_conflict="ref_ce",
        )
        .execute()
    )
    if not ce_resp.data:
        raise RuntimeError(f"Failed to upsert ce_documents: {ce_resp}")
    ce_id = ce_resp.data[0]["id"]
    print(f"  ce_document created: {ce_id}")

    # 7. Embed chunks → ce_chunks
    chunks = extract_chunks_from_ce_data(ce_data)
    if chunks:
        texts = [c.text for c in chunks]
        embeddings = embed_texts(texts)
        if len(embeddings) != len(chunks):
            raise RuntimeError(f"Embedding count mismatch: {len(embeddings)} != {len(chunks)}")

        supabase.table("ce_chunks").delete().eq("ce_id", ce_id).execute()

        chunk_rows = [
            {
                "ce_id": ce_id,
                "section": chunk.section,
                "phase_index": chunk.phase_index,
                "text": chunk.text,
                "embedding": embedding,
            }
            for chunk, embedding in zip(chunks, embeddings)
        ]
        ins = supabase.table("ce_chunks").insert(chunk_rows).execute()
        if not ins.data:
            raise RuntimeError(f"Failed to insert ce_chunks: {ins}")

        supabase.table("ce_documents").update(
            {"indexed_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", ce_id).execute()

        print(f"  {len(chunk_rows)} RAG chunks embedded and stored")
    else:
        print("  [warn] No text chunks extracted for RAG — ce_data may be empty")

    print(f"\nDone. Mission '{data.get('title') or ref_ce}' ingested successfully.")
    print(f"  mission_id : {mission_id}")
    print(f"  ce_id      : {ce_id}")
    print(f"  ref_ce     : {ref_ce}")


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest a CE PDF into the JuMP Oracle database.")
    parser.add_argument("pdf", type=Path, help="Path to the CE PDF file")
    parser.add_argument("--ref-ce", dest="ref_ce", default=None, help="Override the CE reference (default: extracted by Claude or filename stem)")
    parser.add_argument(
        "--created-by",
        dest="created_by",
        required=True,
        help="UUID of the JuMP member creating this mission (your profile UUID from Supabase)",
    )
    args = parser.parse_args()

    if not args.pdf.exists():
        print(f"ERROR: File not found: {args.pdf}")
        sys.exit(1)
    if args.pdf.suffix.lower() != ".pdf":
        print(f"ERROR: Expected a .pdf file, got: {args.pdf.suffix}")
        sys.exit(1)

    ingest(args.pdf, ref_ce_override=args.ref_ce, created_by=args.created_by)


if __name__ == "__main__":
    main()
