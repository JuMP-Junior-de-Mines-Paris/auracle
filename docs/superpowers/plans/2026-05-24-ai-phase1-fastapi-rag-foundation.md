# AI Phase 1 — FastAPI Foundation & RAG Ingestion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a FastAPI backend with Supabase JWT auth, enable pgvector, create AI database tables, build the CE chunking + embedding services, and ship a `/rag/ingest-ce` endpoint plus two one-time scripts (batch-ingest existing CEs, seed references library).

**Architecture:** FastAPI (Railway) sits alongside the existing React+Supabase app. It holds all API keys server-side and is the only entry point for AI and DOCX operations. Auth is handled by forwarding the Supabase JWT and validating it via `supabase.auth.get_user()`. The RAG pipeline splits CE text into section-level chunks, embeds them via Voyage AI, and stores vectors in pgvector.

**Tech Stack:** Python 3.12, FastAPI 0.115, Pydantic-Settings 2.6, supabase-py 2.10, voyageai, python-docx 1.1, pytest 8.3, pytest-asyncio 0.24.

---

## File Map

```
jump-oracle/
  backend/
    app/
      __init__.py            empty package marker
      config.py              Pydantic Settings — loads env vars
      db.py                  Supabase service-role client singleton
      auth.py                FastAPI dependency — validates Supabase JWT
      main.py                FastAPI app, CORS, route registration, /healthz
      routers/
        __init__.py
        rag.py               POST /rag/ingest-ce
      services/
        __init__.py
        chunking.py          extract_chunks_from_docx, extract_chunks_from_ce_data
        embedding.py         embed_texts(list[str]), embed_query(str) via Voyage AI
    scripts/
      __init__.py
      seed_references.py     one-time: seed references_library with standard bullets
      batch_ingest.py        one-time: batch-ingest existing CE DOCX files
    tests/
      __init__.py
      test_auth.py
      test_chunking.py
      test_embedding.py
      test_rag_ingest.py
    requirements.txt
    .env.example
    pytest.ini
    Procfile                 Railway process definition
  supabase/
    migrations/
      006_ai_features.sql    pgvector + ce_documents + ce_chunks + references_library + ai_generation_log
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/pytest.ini`
- Create: `backend/Procfile`
- Create: `backend/app/__init__.py`
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/scripts/__init__.py`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
pydantic==2.10.3
pydantic-settings==2.7.0
supabase==2.10.0
voyageai==0.3.2
python-docx==1.1.2
httpx==0.28.1
python-multipart==0.0.20
pytest==8.3.4
pytest-asyncio==0.24.0
```

- [ ] **Step 2: Create .env.example**

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
VOYAGE_API_KEY=your-voyage-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
FRONTEND_URL=http://localhost:5173
```

- [ ] **Step 3: Create pytest.ini**

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

- [ ] **Step 4: Create Procfile**

```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

- [ ] **Step 5: Create empty package markers**

Create these six files, each containing only an empty string (zero bytes is fine):
- `backend/app/__init__.py`
- `backend/app/routers/__init__.py`
- `backend/app/services/__init__.py`
- `backend/scripts/__init__.py`
- `backend/tests/__init__.py`

- [ ] **Step 6: Install dependencies**

From the `backend/` directory:
```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

Expected: all packages install without error.

- [ ] **Step 7: Commit scaffold**

```bash
git add backend/
git commit -m "feat(backend): scaffold FastAPI project structure"
```

---

## Task 2: Configuration

**Files:**
- Create: `backend/app/config.py`
- Test: no explicit test — loaded by all other tests via fixture

- [ ] **Step 1: Write config.py**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    voyage_api_key: str
    anthropic_api_key: str
    frontend_url: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
```

- [ ] **Step 2: Copy .env.example to .env and fill in values**

```bash
cp .env.example .env
# Now edit .env with your real keys
```

The `.env` file must never be committed. Verify it is in `.gitignore`:

```bash
grep ".env" ../.gitignore
```

If not present, add `.env` to `backend/.gitignore`:

```
.env
.venv/
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 3: Verify settings load**

```bash
python -c "from app.config import settings; print(settings.supabase_url)"
```

Expected: prints your Supabase URL without error.

- [ ] **Step 4: Commit**

```bash
git add backend/app/config.py backend/.gitignore
git commit -m "feat(backend): add Pydantic settings configuration"
```

---

## Task 3: Supabase Client

**Files:**
- Create: `backend/app/db.py`

- [ ] **Step 1: Write db.py**

```python
from supabase import create_client, Client
from app.config import settings

_client: Client | None = None


def get_supabase_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client
```

- [ ] **Step 2: Verify client connects**

```bash
python -c "
from app.db import get_supabase_client
c = get_supabase_client()
# ping any existing table
r = c.table('profiles').select('id').limit(1).execute()
print('OK', r.data)
"
```

Expected: prints `OK` with a list (possibly empty). An auth error means your service role key is wrong.

- [ ] **Step 3: Commit**

```bash
git add backend/app/db.py
git commit -m "feat(backend): add Supabase service-role client singleton"
```

---

## Task 4: Auth Middleware

**Files:**
- Create: `backend/app/auth.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_auth.py
from unittest.mock import patch, MagicMock
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


@pytest.mark.asyncio
async def test_valid_token_returns_user():
    mock_user = MagicMock()
    mock_user.id = "user-abc"

    with patch("app.auth.get_supabase_client") as mock_get:
        mock_client = MagicMock()
        mock_client.auth.get_user.return_value.user = mock_user
        mock_get.return_value = mock_client

        from app.auth import get_current_user

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")
        user = await get_current_user(creds)

        assert user.id == "user-abc"
        mock_client.auth.get_user.assert_called_once_with("valid-token")


@pytest.mark.asyncio
async def test_invalid_token_raises_401():
    with patch("app.auth.get_supabase_client") as mock_get:
        mock_client = MagicMock()
        mock_client.auth.get_user.side_effect = Exception("JWT expired")
        mock_get.return_value = mock_client

        from app.auth import get_current_user

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad-token")

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(creds)

        assert exc_info.value.status_code == 401
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_auth.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` for `app.auth`.

- [ ] **Step 3: Write auth.py**

```python
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db import get_supabase_client

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
):
    token = credentials.credentials
    supabase = get_supabase_client()
    try:
        response = supabase.auth.get_user(token)
        return response.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_auth.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth.py backend/tests/test_auth.py
git commit -m "feat(backend): add Supabase JWT auth middleware"
```

---

## Task 5: FastAPI App + Health Check

**Files:**
- Create: `backend/app/main.py`
- Test: inline via TestClient (no separate test file — health is trivial)

- [ ] **Step 1: Write main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import rag

app = FastAPI(title="JuMP Oracle API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rag.router, prefix="/rag", tags=["rag"])


@app.get("/healthz")
async def health():
    return {"status": "ok"}
```

Note: `rag.router` doesn't exist yet. Create a stub for now so the app imports cleanly:

```python
# app/routers/rag.py  (stub — will be replaced in Task 8)
from fastapi import APIRouter

router = APIRouter()
```

- [ ] **Step 2: Verify app starts**

```bash
uvicorn app.main:app --reload
```

Expected: `INFO: Application startup complete.` Visit `http://localhost:8000/healthz` → `{"status":"ok"}`.

Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py backend/app/routers/rag.py
git commit -m "feat(backend): add FastAPI app with CORS and health check"
```

---

## Task 6: Database Migration

**Files:**
- Create: `supabase/migrations/006_ai_features.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/006_ai_features.sql

-- Enable pgvector (idempotent)
create extension if not exists vector;

-- ─── CE Documents ──────────────────────────────────────────────────────────────
create table if not exists ce_documents (
  id          uuid        primary key default gen_random_uuid(),
  mission_id  uuid        references missions(id) on delete set null,
  ref_ce      text        not null unique,
  ce_data     jsonb       not null default '{}',
  status      text        not null default 'draft'
                          check (status in ('draft', 'final')),
  created_by  uuid        references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  indexed_at  timestamptz
);

alter table ce_documents enable row level security;

create policy "ce_documents: authenticated read"
  on ce_documents for select to authenticated using (true);

create policy "ce_documents: creator insert"
  on ce_documents for insert to authenticated
  with check (auth.uid() = created_by);

create policy "ce_documents: creator update"
  on ce_documents for update to authenticated
  using (auth.uid() = created_by);

-- ─── CE Chunks (RAG) ───────────────────────────────────────────────────────────
create table if not exists ce_chunks (
  id          uuid        primary key default gen_random_uuid(),
  ce_id       uuid        references ce_documents(id) on delete cascade,
  section     text        not null
                          check (section in ('contexte','definition','cdc','phase','references')),
  phase_index int,
  text        text        not null,
  embedding   vector(1024),
  created_at  timestamptz not null default now()
);

alter table ce_chunks enable row level security;

create policy "ce_chunks: authenticated read"
  on ce_chunks for select to authenticated using (true);

-- No user-level insert policy: only the service role (FastAPI) writes chunks

-- ─── References Library ────────────────────────────────────────────────────────
create table if not exists references_library (
  id          uuid        primary key default gen_random_uuid(),
  text        text        not null,
  domain      text,
  embedding   vector(1024),
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table references_library enable row level security;

create policy "references_library: authenticated read"
  on references_library for select to authenticated using (true);

-- ─── AI Generation Log ─────────────────────────────────────────────────────────
create table if not exists ai_generation_log (
  id          uuid        primary key default gen_random_uuid(),
  ce_id       uuid        references ce_documents(id) on delete set null,
  section     text,
  user_input  text,
  generated   text,
  model       text,
  rag_sources uuid[],
  created_at  timestamptz not null default now()
);

alter table ai_generation_log enable row level security;

-- No user read: admin queries via service role only

-- ─── Indexes ───────────────────────────────────────────────────────────────────
-- Use exact cosine search for now (fast enough at <500 CEs)
-- Add HNSW index later if query latency exceeds 200ms
create index if not exists ce_chunks_ce_id_idx on ce_chunks(ce_id);
create index if not exists ce_chunks_section_idx on ce_chunks(section);
create index if not exists references_library_domain_idx on references_library(domain);
```

- [ ] **Step 2: Run the migration in Supabase**

Open the Supabase dashboard → SQL Editor → paste the full SQL above → click Run.

Expected: all statements succeed with no errors. The `vector` extension and all four tables now exist.

- [ ] **Step 3: Verify tables exist**

In the Supabase SQL Editor:
```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('ce_documents','ce_chunks','references_library','ai_generation_log');
```

Expected: 4 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_ai_features.sql
git commit -m "feat(db): add pgvector + AI tables migration (006)"
```

---

## Task 7: CE Chunking Service

**Files:**
- Create: `backend/app/services/chunking.py`
- Create: `backend/tests/test_chunking.py`

- [ ] **Step 1: Write failing tests**

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_chunking.py -v
```

Expected: `ImportError` — `app.services.chunking` does not exist.

- [ ] **Step 3: Write chunking.py**

```python
# app/services/chunking.py
from __future__ import annotations
import re
from dataclasses import dataclass, field
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
    "MÉTHODOLOGIE": "phase",   # will be split per phase internally
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

        # Skip internal editorial notes
        if _SKIP_RE.search(raw):
            continue

        # Detect known section headings
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

    if detail_cdc := ce_data.get("detail_cdc"):
        chunks.append(Chunk(section="cdc", text=detail_cdc))

    for i, phase in enumerate(ce_data.get("phases", []), start=1):
        desc = phase.get("description", "").strip()
        name = phase.get("name", "").strip()
        if desc:
            chunks.append(Chunk(
                section="phase",
                text=f"{name}: {desc}" if name else desc,
                phase_index=i,
            ))

    return chunks
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_chunking.py -v
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/chunking.py backend/tests/test_chunking.py
git commit -m "feat(backend): add CE chunking service (docx + json paths)"
```

---

## Task 8: Embedding Service

**Files:**
- Create: `backend/app/services/embedding.py`
- Create: `backend/tests/test_embedding.py`

- [ ] **Step 1: Write failing tests**

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_embedding.py -v
```

Expected: `ImportError` — `app.services.embedding` not found.

- [ ] **Step 3: Write embedding.py**

```python
# app/services/embedding.py
import voyageai
from app.config import settings

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
    """Embed a single search query. Returns a 1024-dim vector."""
    result = _get_client().embed([text], model="voyage-3", input_type="query")
    return result.embeddings[0]
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_embedding.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/embedding.py backend/tests/test_embedding.py
git commit -m "feat(backend): add Voyage AI embedding service"
```

---

## Task 9: RAG Ingestion Endpoint

**Files:**
- Modify: `backend/app/routers/rag.py` (replace stub)
- Create: `backend/tests/test_rag_ingest.py`

- [ ] **Step 1: Write failing tests**

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_rag_ingest.py -v
```

Expected: tests fail because `rag.py` is still a stub with no `ingest-ce` route.

- [ ] **Step 3: Replace rag.py stub with full implementation**

```python
# app/routers/rag.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import get_current_user
from app.db import get_supabase_client
from app.services.chunking import extract_chunks_from_ce_data
from app.services.embedding import embed_texts

router = APIRouter()


class IngestRequest(BaseModel):
    ce_id: uuid.UUID


class IngestResponse(BaseModel):
    chunks_created: int


@router.post("/ingest-ce", response_model=IngestResponse)
async def ingest_ce(
    request: IngestRequest,
    user=Depends(get_current_user),
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_rag_ingest.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
pytest -v
```

Expected: all tests pass (test_auth, test_chunking, test_embedding, test_rag_ingest).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/rag.py backend/tests/test_rag_ingest.py
git commit -m "feat(backend): add POST /rag/ingest-ce endpoint"
```

---

## Task 10: Seed References Library

**Files:**
- Create: `backend/scripts/seed_references.py`

No unit test — this is a one-time data script. Correctness verified by checking row count in Supabase after running.

- [ ] **Step 1: Write seed_references.py**

```python
# scripts/seed_references.py
"""
Seed references_library with JuMP's standard past-reference bullets.
Run once from the backend/ directory:
    python -m scripts.seed_references
"""
from supabase import create_client
from app.config import settings
from app.services.embedding import embed_texts

REFERENCES: list[tuple[str, str]] = [
    # (bullet text, domain)
    ("Traduction d'un manuel de qualité anglais-français pour un cabinet de conseil", "Traduction"),
    ("Traduction d'articles scientifiques du russe vers le français", "Traduction"),
    ("Traduction français-anglais d'un module de formation aux éléments finis", "Traduction"),
    (
        "Réalisation d'une base de données pour l'optimisation de la gestion client "
        "pour un grand groupe français dans le domaine de l'énergie",
        "Bases de données",
    ),
    ("Analyse des fondamentaux du marché des granulats ensachés pour un grand groupe du bâtiment", "Stratégie"),
    ("Business Plan de rachat d'une société dans le domaine gazier", "Stratégie"),
    (
        "Analyse stratégique de la mise en concurrence des concessions hydroélectriques "
        "pour un grand groupe dans le domaine de l'énergie",
        "Stratégie",
    ),
    ("Analyse pour la due-diligence d'une entreprise technique", "Stratégie"),
    ("Définition de nouvelles règles de gestion des stocks pour une entreprise de vente en ligne", "Ingénierie"),
    (
        "Développement d'un outil pour l'optimisation de la gestion du personnel "
        "pour une enseigne de la grande distribution",
        "Ingénierie",
    ),
    ("Développement d'un logiciel de gestion des stocks et flux de produits", "Ingénierie"),
    ("Étude thermique dynamique d'un bâtiment", "Ingénierie"),
    ("Étude énergétique et réhabilitation d'une maison de retraite en EHPAD", "Ingénierie"),
    ("Programmation en langage Java d'un logiciel de sous-titrage", "Informatique"),
    ("Réalisation d'une application permettant la modification d'images", "Informatique"),
    ("Réalisation d'une brique logicielle en langage Java", "Informatique"),
    ("Réalisation du site web d'une entreprise de développement graphique", "Informatique"),
    (
        "Analyse des solutions techniques et création d'un nouveau site "
        "pour une entreprise de l'industrie électrotechnique",
        "Informatique",
    ),
    ("Refonte du site web d'une société dans le domaine de la santé", "Informatique"),
]


def main() -> None:
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # Clear existing rows so re-running is idempotent
    supabase.table("references_library").delete().neq(
        "id", "00000000-0000-0000-0000-000000000000"
    ).execute()

    texts = [r[0] for r in REFERENCES]
    embeddings = embed_texts(texts)

    rows = [
        {"text": text, "domain": domain, "embedding": embedding}
        for (text, domain), embedding in zip(REFERENCES, embeddings)
    ]
    supabase.table("references_library").insert(rows).execute()
    print(f"Seeded {len(rows)} references into references_library.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the seed script**

```bash
python -m scripts.seed_references
```

Expected: `Seeded 19 references into references_library.`

- [ ] **Step 3: Verify in Supabase**

In the Supabase SQL Editor:
```sql
select domain, count(*) from references_library group by domain order by domain;
```

Expected:
```
Bases de données | 1
Informatique     | 6
Ingénierie       | 5
Stratégie        | 4
Traduction       | 3
```

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/seed_references.py
git commit -m "feat(backend): add references_library seed script (19 JuMP references)"
```

---

## Task 11: Batch Ingest Existing CEs

**Files:**
- Create: `backend/scripts/batch_ingest.py`

No unit test — integration script. Correctness verified by row counts in Supabase.

- [ ] **Step 1: Write batch_ingest.py**

```python
# scripts/batch_ingest.py
"""
Batch ingest existing CE DOCX files into the RAG database.

Usage (from the backend/ directory):
    python -m scripts.batch_ingest /path/to/directory/of/docx/files

The script:
  1. Reads every *.docx file in the given directory
  2. Parses it into section chunks using extract_chunks_from_docx
  3. Creates embeddings via Voyage AI
  4. Upserts ce_documents + ce_chunks rows in Supabase

Re-running is safe: existing chunks for a CE are deleted before re-indexing.
"""
import sys
from pathlib import Path
from supabase import create_client
from app.config import settings
from app.services.chunking import extract_chunks_from_docx
from app.services.embedding import embed_texts


def ingest_file(supabase, path: Path) -> int:
    """Ingest one DOCX. Returns number of chunks created."""
    ref_ce = path.stem  # use filename (without .docx) as the ref_CE

    # Upsert the CE document record (idempotent on ref_ce)
    result = (
        supabase.table("ce_documents")
        .upsert({"ref_ce": ref_ce, "ce_data": {}, "status": "final"}, on_conflict="ref_ce")
        .execute()
    )
    ce_id: str = result.data[0]["id"]

    # Clear stale chunks
    supabase.table("ce_chunks").delete().eq("ce_id", ce_id).execute()

    chunks = extract_chunks_from_docx(path)
    if not chunks:
        print(f"  [warn] {path.name}: no chunks extracted — file may be empty or unsupported structure")
        return 0

    texts = [c.text for c in chunks]
    embeddings = embed_texts(texts)

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
    supabase.table("ce_chunks").insert(rows).execute()

    supabase.table("ce_documents").update({"indexed_at": "now()"}).eq("id", ce_id).execute()
    return len(rows)


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

    for path in docx_files:
        print(f"Ingesting {path.name}...", end=" ", flush=True)
        count = ingest_file(supabase, path)
        print(f"{count} chunks")
        total_chunks += count

    print(f"\nDone — {total_chunks} total chunks across {len(docx_files)} CE files.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Gather your existing CE DOCX files into one directory**

Create a directory (e.g. `~/Desktop/ces/`) and copy all past CE DOCX files into it.

- [ ] **Step 3: Run the batch ingestion**

```bash
python -m scripts.batch_ingest "C:/path/to/your/ces"
```

Expected output (one line per file):
```
Ingesting CE-2024-001.docx... 7 chunks
Ingesting CE-2024-002.docx... 5 chunks
...
Done — 42 total chunks across 8 CE files.
```

If a file shows `0 chunks`, the DOCX uses custom heading styles. Open it, check the heading style names, and adjust `_SECTION_MAP` in `chunking.py` to match.

- [ ] **Step 4: Verify in Supabase**

```sql
select
  d.ref_ce,
  d.indexed_at,
  count(c.id) as chunks
from ce_documents d
left join ce_chunks c on c.ce_id = d.id
group by d.ref_ce, d.indexed_at
order by d.ref_ce;
```

Expected: one row per CE file with `indexed_at` set and `chunks > 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/batch_ingest.py
git commit -m "feat(backend): add batch CE ingestion script for RAG pre-warming"
```

---

## Task 12: Deploy to Railway

No code changes — deployment and smoke test.

- [ ] **Step 1: Create Railway project**

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select the `jump-oracle` repository
3. Set the **Root Directory** to `backend`
4. Railway detects Python via `requirements.txt` and uses the `Procfile` start command

- [ ] **Step 2: Set environment variables in Railway**

In Railway → your service → Variables, add:

```
SUPABASE_URL          = https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY = your-service-role-key
VOYAGE_API_KEY        = your-voyage-key
ANTHROPIC_API_KEY     = your-anthropic-key
FRONTEND_URL          = https://your-vercel-app.vercel.app
```

- [ ] **Step 3: Trigger deployment and wait for "Active" status**

Railway will build and deploy automatically. Check the deployment logs — look for:
```
INFO:     Application startup complete.
```

- [ ] **Step 4: Smoke test the health endpoint**

```bash
curl https://your-railway-app.up.railway.app/healthz
```

Expected: `{"status":"ok"}`

- [ ] **Step 5: Update CLAUDE.md with backend URL**

Add to `jump-oracle/CLAUDE.md` under Commands:
```markdown
## Backend (FastAPI on Railway)
- Local dev: `cd backend && uvicorn app.main:app --reload`
- Production: https://your-railway-app.up.railway.app
- Health check: GET /healthz
```

- [ ] **Step 6: Commit**

```bash
git add jump-oracle/CLAUDE.md
git commit -m "docs: add backend dev and production URL to CLAUDE.md"
```

---

## Self-Review

**Spec coverage check:**

| Phase 1 requirement | Task |
|---------------------|------|
| FastAPI project setup (auth, CORS, env vars) | Tasks 1–5 |
| pgvector + ce_documents + ce_chunks + references_library | Task 6 |
| Batch ingest existing past CEs | Task 11 |
| Seed references_library | Task 10 |
| POST /rag/ingest-ce for ongoing ingestion | Task 9 |
| Deploy to Railway (Vercel for frontend stays unchanged) | Task 12 |

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency check:**
- `Chunk` dataclass defined in Task 7, used in Tasks 9 and 11 — consistent
- `embed_texts(list[str]) -> list[list[float]]` defined in Task 8, called in Tasks 9 and 11 — consistent
- `extract_chunks_from_ce_data(dict) -> list[Chunk]` defined in Task 7, imported in Task 9 — consistent
- `extract_chunks_from_docx(Path) -> list[Chunk]` defined in Task 7, imported in Task 11 — consistent
