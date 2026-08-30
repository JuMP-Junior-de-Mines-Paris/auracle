# app/routers/rag.py
import sys
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
# Imported to populate this module's namespace; _auth_dep resolves it via sys.modules at call time
# so tests can patch it with patch("app.routers.rag.get_current_user").
from app.auth import get_current_user, get_user_permissions
from app.db import get_supabase_client
from app.services.chunking import extract_chunks_from_ce_data
from app.services.embedding import embed_texts

router = APIRouter()

_security = HTTPBearer()


INGEST_PERMS = ("ce.write",)


async def _auth_dep(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
):
    """Authenticate, then check the caller may write conventions d'étude.

    Both lookups resolve through sys.modules so tests can patch them.
    The check matters here: every query below runs on the service-role key,
    which bypasses RLS entirely — a valid token alone is not authorisation.
    """
    mod = sys.modules[__name__]
    user = await mod.get_current_user(credentials)

    held = mod.get_user_permissions(str(user.id))
    if "admin.full" not in held and not held.intersection(INGEST_PERMS):
        raise HTTPException(
            status_code=403,
            detail=f"Permission requise : {' ou '.join(INGEST_PERMS)}",
        )
    return user


class IngestRequest(BaseModel):
    ce_id: uuid.UUID


class IngestResponse(BaseModel):
    chunks_created: int


@router.post("/ingest-ce", response_model=IngestResponse)
async def ingest_ce(
    request: IngestRequest,
    _user=Depends(_auth_dep),
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

    texts = [c.text for c in chunks]
    embeddings = embed_texts(texts)

    if len(embeddings) != len(chunks):
        raise HTTPException(status_code=502, detail="Embedding service returned unexpected result count")

    # Delete stale chunks only after embeddings succeed
    supabase.table("ce_chunks").delete().eq("ce_id", ce_id_str).execute()

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
        {"indexed_at": datetime.now(timezone.utc).isoformat(), "status": "final"}
    ).eq("id", ce_id_str).execute()

    return IngestResponse(chunks_created=len(rows))
