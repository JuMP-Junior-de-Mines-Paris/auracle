# app/routers/rag.py
import sys
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from app.auth import get_current_user
from app.db import get_supabase_client
from app.services.chunking import extract_chunks_from_ce_data
from app.services.embedding import embed_texts

router = APIRouter()

_security = HTTPBearer()


async def _auth_dep(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
):
    """Delegate to the module-level get_current_user (patchable in tests)."""
    fn = sys.modules[__name__].get_current_user
    return await fn(credentials)


class IngestRequest(BaseModel):
    ce_id: uuid.UUID


class IngestResponse(BaseModel):
    chunks_created: int


@router.post("/ingest-ce", response_model=IngestResponse)
async def ingest_ce(
    request: IngestRequest,
    user=Depends(_auth_dep),
):
    supabase = get_supabase_client()
    ce_id_str = str(request.ce_id)

    result = (
        supabase.table("ce_documents")
        .select("*")
        .eq("id", ce_id_str)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="CE document not found")

    ce_data = result.data.get("ce_data", {})
    chunks = extract_chunks_from_ce_data(ce_data)

    if not chunks:
        raise HTTPException(
            status_code=422,
            detail="CE data contains no extractable text sections",
        )

    # Delete stale chunks before re-indexing
    supabase.table("ce_chunks").delete().eq("ce_id", ce_id_str).execute()

    texts = [c.text for c in chunks]
    embeddings = embed_texts(texts)

    rows = [
        {
            "ce_id": ce_id_str,
            "section": chunk.section,
            "phase_index": chunk.phase_index,
            "text": chunk.text,
            "embedding": embedding,
        }
        for chunk, embedding in zip(chunks, embeddings)
    ]
    supabase.table("ce_chunks").insert(rows).execute()

    supabase.table("ce_documents").update(
        {"indexed_at": "now()", "status": "final"}
    ).eq("id", ce_id_str).execute()

    return IngestResponse(chunks_created=len(rows))
