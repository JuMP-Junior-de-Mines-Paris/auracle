# scripts/batch_ingest.py
"""
Batch ingest existing CE DOCX files into the RAG database.

Usage (from the backend/ directory):
    python -m scripts.batch_ingest /path/to/directory/of/docx/files

Idempotent — safe to re-run: existing chunks for a CE are deleted before re-indexing.
"""
import sys
from datetime import datetime, timezone
from pathlib import Path
from supabase import create_client
from app.config import settings
from app.services.chunking import extract_chunks_from_docx
from app.services.embedding import embed_texts


def ingest_file(supabase, path: Path) -> int:
    """Ingest one DOCX. Returns number of chunks created."""
    ref_ce = path.stem  # use filename (without .docx) as the ref_CE

    # ce_data is left empty here; chunks are the authoritative RAG content for batch-ingested files
    result = (
        supabase.table("ce_documents")
        .upsert({"ref_ce": ref_ce, "ce_data": {}, "status": "final"}, on_conflict="ref_ce")
        .execute()
    )
    if not result.data:
        raise RuntimeError(f"Failed to upsert ce_documents for {path.name}: {result}")
    ce_id: str = result.data[0]["id"]

    # Clear stale chunks
    del_resp = supabase.table("ce_chunks").delete().eq("ce_id", ce_id).execute()
    if hasattr(del_resp, "error") and del_resp.error:
        raise RuntimeError(f"Failed to delete stale chunks for {path.name}: {del_resp.error}")

    chunks = extract_chunks_from_docx(path)
    if not chunks:
        print(f"  [warn] {path.name}: no chunks extracted — file may use unsupported heading styles")
        return 0

    texts = [c.text for c in chunks]
    embeddings = embed_texts(texts)

    if len(embeddings) != len(chunks):
        raise RuntimeError(
            f"{path.name}: embedding count mismatch ({len(embeddings)} != {len(chunks)})"
        )

    rows = [
        {
            "ce_id": ce_id,
            "section": chunk.section,
            "phase_index": chunk.phase_index,
            "text": chunk.text,
            "embedding": embedding,
        }
        for chunk, embedding in zip(chunks, embeddings)
    ]
    ins_resp = supabase.table("ce_chunks").insert(rows).execute()
    if not ins_resp.data:
        raise RuntimeError(f"{path.name}: chunk insert failed: {ins_resp}")

    upd_resp = supabase.table("ce_documents").update(
        {"indexed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", ce_id).execute()
    if hasattr(upd_resp, "error") and upd_resp.error:
        raise RuntimeError(f"Failed to update indexed_at for {path.name}: {upd_resp.error}")

    return len(ins_resp.data)


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    directory = Path(sys.argv[1])
    if not directory.is_dir():
        print(f"Error: {directory} is not a directory")
        sys.exit(1)

    docx_files = sorted(directory.glob("*.docx"))
    if not docx_files:
        print(f"No .docx files found in {directory}")
        sys.exit(1)

    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    total_chunks = 0

    errors: list[str] = []
    for path in docx_files:
        print(f"Ingesting {path.name}...", end=" ", flush=True)
        try:
            count = ingest_file(supabase, path)
            print(f"{count} chunks")
            total_chunks += count
        except Exception as exc:
            print(f"ERROR: {exc}")
            errors.append(path.name)

    print(f"\nDone — {total_chunks} total chunks across {len(docx_files)} CE files.")
    if errors:
        print(f"Failed files ({len(errors)}): {', '.join(errors)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
