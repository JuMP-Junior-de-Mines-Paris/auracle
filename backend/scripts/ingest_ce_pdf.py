# scripts/ingest_ce_pdf.py
"""
Ingest CE (Convention d'Étude) documents into the JuMP Oracle database.

Accepts a single file OR a directory. Supported formats: .pdf and .md.
When a directory is given, all .pdf and .md files are processed.
If both a .pdf and a .md exist for the same filename stem, the .md is used
(markdown preserves document structure better for Claude extraction).

For each file, extracts structured data with Claude, then writes to:
  - missions           (1 row)
  - mission_team       (1 row per JuMP member listed)
  - milestones         (1 row per phase)
  - ce_documents       (1 row, with ce_data JSON for RAG)
  - ce_chunks          (RAG vectors, embedded via Voyage AI)

Usage (from backend/ directory):
    # Single file
    python -m scripts.ingest_ce_pdf /path/to/ce.pdf --created-by <profile-uuid>
    python -m scripts.ingest_ce_pdf /path/to/ce.md  --created-by <profile-uuid>

    # Directory (batch)
    python -m scripts.ingest_ce_pdf /path/to/ces/  --created-by <profile-uuid>

    # Override ref_ce for a single file
    python -m scripts.ingest_ce_pdf /path/to/ce.pdf --ref-ce CE-2024-001 --created-by <profile-uuid>

Idempotent on ref_ce: re-running updates existing records instead of duplicating.
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

_USER_TEMPLATE = """Voici le contenu d'une convention d'étude JuMP.
Extrais les informations et retourne un objet JSON avec exactement ces champs.
Pour les champs introuvables, utilise null.

CONTENU DU CE :
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


# ── Text extraction ────────────────────────────────────────────────────────────

def extract_text_from_pdf(path: Path) -> str:
    """Extract all text from a PDF, joining pages with double newlines."""
    pages = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text.strip())
    return "\n\n".join(pages)


def extract_text_from_file(path: Path) -> str:
    """Extract text from a .pdf or .md file."""
    if path.suffix.lower() == ".md":
        return path.read_text(encoding="utf-8")
    return extract_text_from_pdf(path)


# ── Claude structured extraction ───────────────────────────────────────────────

def extract_structured_data(text: str) -> dict:
    """Send document text to Claude Haiku and get back a structured dict."""
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    if len(text) > 40000:
        print(f"  [warn] Text is {len(text)} chars — truncating to 40,000 for Claude.")
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=_SYSTEM,
        messages=[{"role": "user", "content": _USER_TEMPLATE.format(text=text[:40000])}],
    )
    raw = message.content[0].text.strip()
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


# ── DB write for one CE ────────────────────────────────────────────────────────

def ingest(file_path: Path, ref_ce_override: str | None = None, created_by: str = "") -> None:
    """Ingest a single .pdf or .md CE file into the database."""
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # 1. Extract text
    fmt = "markdown" if file_path.suffix.lower() == ".md" else "PDF"
    print(f"  Reading {fmt}: {file_path.name}")
    text = extract_text_from_file(file_path)
    if not text.strip():
        raise RuntimeError(f"No text extracted from {file_path.name}. File may be empty or image-only.")
    print(f"  {len(text):,} characters extracted.")

    # 2. Claude structured extraction
    print("  Extracting structured data with Claude...")
    data = extract_structured_data(text)
    ref_ce = ref_ce_override or data.get("ref_ce") or file_path.stem
    print(f"  ref_ce : {ref_ce}")
    print(f"  title  : {data.get('title')}")
    print(f"  client : {data.get('client_name')}")
    print(f"  phases : {len(data.get('phases') or [])}")
    print(f"  team   : {len(data.get('team') or [])}")

    missing = [f for f in ("title", "client_name", "contexte", "phases") if not data.get(f)]
    if missing:
        print(f"  [warn] Could not extract: {', '.join(missing)} — will be null")

    # 3. Idempotency check: look up existing ce_document by ref_ce
    print("  Writing to database...")
    existing = (
        supabase.table("ce_documents")
        .select("id, mission_id")
        .eq("ref_ce", ref_ce)
        .execute()
    )

    phases = data.get("phases") or []
    budget = float(data["budget"]) if data.get("budget") else None

    if existing.data:
        ce_id = existing.data[0]["id"]
        mission_id = existing.data[0]["mission_id"]
        print(f"  Already exists — updating mission {mission_id}")
        supabase.table("missions").update({
            "title": data.get("title") or ref_ce,
            "description": data.get("description"),
            "client_name": data.get("client_name"),
            "client_contact_name": data.get("client_contact_name"),
            "client_contact_email": data.get("client_contact_email"),
            "start_date": data.get("start_date"),
            "end_date": data.get("end_date"),
            "budget": budget,
        }).eq("id", mission_id).execute()
        supabase.table("mission_team").delete().eq("mission_id", mission_id).execute()
        supabase.table("milestones").delete().eq("mission_id", mission_id).execute()
    else:
        mission_resp = supabase.table("missions").insert({
            "title": data.get("title") or ref_ce,
            "description": data.get("description"),
            "client_name": data.get("client_name"),
            "client_contact_name": data.get("client_contact_name"),
            "client_contact_email": data.get("client_contact_email"),
            "start_date": data.get("start_date"),
            "end_date": data.get("end_date"),
            "budget": budget,
            "status": "active",
            "created_by": created_by,
        }).execute()
        if not mission_resp.data:
            raise RuntimeError(f"Failed to insert mission: {mission_resp}")
        mission_id = mission_resp.data[0]["id"]
        print(f"  Mission created: {mission_id}")

    # 4. Team members
    team = data.get("team") or []
    team_rows = [
        {"mission_id": mission_id, "prenom": m.get("prenom", ""), "nom": m.get("nom", "")}
        for m in team if m.get("prenom") or m.get("nom")
    ]
    if team_rows:
        team_resp = supabase.table("mission_team").insert(team_rows).execute()
        if not team_resp.data:
            print(f"  [warn] mission_team insert may have failed")
        else:
            print(f"  {len(team_rows)} team members saved")

    # 5. Milestones (one per phase)
    if phases:
        milestone_rows = [
            {"mission_id": mission_id, "title": p.get("name", f"Phase {i+1}"), "due_date": None}
            for i, p in enumerate(phases)
        ]
        ms_resp = supabase.table("milestones").insert(milestone_rows).execute()
        if not ms_resp.data:
            print(f"  [warn] milestones insert may have failed")
        else:
            print(f"  {len(milestone_rows)} milestones saved")

    # 6. CE document (upsert)
    ce_data = {
        "contexte": data.get("contexte"),
        "resume_cdc": data.get("resume_cdc"),
        "detail_cdc": data.get("detail_cdc"),
        "phases": [{"name": p.get("name", ""), "description": p.get("description", "")} for p in phases],
    }
    ce_resp = supabase.table("ce_documents").upsert(
        {"mission_id": mission_id, "ref_ce": ref_ce, "ce_data": ce_data, "status": "final"},
        on_conflict="ref_ce",
    ).execute()
    if not ce_resp.data:
        raise RuntimeError(f"Failed to upsert ce_documents: {ce_resp}")
    ce_id = ce_resp.data[0]["id"]

    # 7. RAG chunks
    chunks = extract_chunks_from_ce_data(ce_data)
    if chunks:
        embeddings = embed_texts([c.text for c in chunks])
        if len(embeddings) != len(chunks):
            raise RuntimeError(f"Embedding count mismatch: {len(embeddings)} != {len(chunks)}")
        supabase.table("ce_chunks").delete().eq("ce_id", ce_id).execute()
        ins = supabase.table("ce_chunks").insert([
            {"ce_id": ce_id, "section": c.section, "phase_index": c.phase_index,
             "text": c.text, "embedding": emb}
            for c, emb in zip(chunks, embeddings)
        ]).execute()
        if not ins.data:
            raise RuntimeError(f"Failed to insert ce_chunks: {ins}")
        supabase.table("ce_documents").update(
            {"indexed_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", ce_id).execute()
        print(f"  {len(chunks)} RAG chunks embedded")
    else:
        print(f"  [warn] No chunks for RAG — ce_data may be empty")

    print(f"  → Done: '{data.get('title') or ref_ce}' (mission {mission_id})")


# ── File discovery ─────────────────────────────────────────────────────────────

def collect_files(path: Path) -> list[Path]:
    """
    Return files to process from a path (file or directory).
    In a directory: finds all .pdf and .md files.
    If a .md and .pdf share the same stem, uses only the .md (better structure).
    """
    if path.is_file():
        return [path]

    md_files = {f.stem: f for f in sorted(path.glob("*.md"))}
    pdf_files = {f.stem: f for f in sorted(path.glob("*.pdf"))}

    files: list[Path] = []
    for stem, pdf in pdf_files.items():
        if stem in md_files:
            print(f"[info] {stem}: using .md instead of .pdf (better structure)")
            files.append(md_files[stem])
        else:
            files.append(pdf)

    # Add any .md files that have no corresponding .pdf
    for stem, md in md_files.items():
        if stem not in pdf_files:
            files.append(md)

    return sorted(files, key=lambda f: f.stem)


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest CE documents (PDF or Markdown) into the JuMP Oracle database."
    )
    parser.add_argument(
        "path",
        type=Path,
        help="Path to a single .pdf/.md file, or a directory containing CE files",
    )
    parser.add_argument(
        "--created-by",
        dest="created_by",
        required=True,
        help="Your profile UUID from Supabase (required for new mission rows)",
    )
    parser.add_argument(
        "--ref-ce",
        dest="ref_ce",
        default=None,
        help="Override ref_ce (only valid when processing a single file)",
    )
    args = parser.parse_args()

    if not args.path.exists():
        print(f"ERROR: Path not found: {args.path}")
        sys.exit(1)

    if args.ref_ce and args.path.is_dir():
        print("ERROR: --ref-ce can only be used with a single file, not a directory.")
        sys.exit(1)

    files = collect_files(args.path)
    if not files:
        print(f"No .pdf or .md files found in {args.path}")
        sys.exit(1)

    print(f"Found {len(files)} file(s) to process.\n")

    errors: list[str] = []
    for i, file_path in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {file_path.name}")
        try:
            ref_ce = args.ref_ce if len(files) == 1 else None
            ingest(file_path, ref_ce_override=ref_ce, created_by=args.created_by)
        except Exception as exc:
            print(f"  ERROR: {exc}")
            errors.append(file_path.name)
        print()

    print(f"{'─' * 50}")
    print(f"Done — {len(files) - len(errors)}/{len(files)} files ingested successfully.")
    if errors:
        print(f"Failed ({len(errors)}): {', '.join(errors)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
