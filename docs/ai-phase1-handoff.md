# AI Phase 1 — Handoff Document

## What Was Built

A FastAPI backend with a full RAG (Retrieval-Augmented Generation) pipeline, ready to deploy on Railway. It sits alongside the existing React + Supabase app and handles all AI/ML operations server-side.

---

## Architecture

```
Browser (React on Vercel)
    │
    │  JWT from Supabase Auth
    ▼
FastAPI backend (Railway)
    ├── Validates JWT via supabase.auth.get_user()
    ├── Reads/writes Supabase DB using service-role key
    ├── Embeds text via Voyage AI (voyage-3, 1024 dimensions)
    └── Will call Claude (Anthropic) for text generation (Phase 2)

Supabase (PostgreSQL + pgvector)
    ├── ce_documents      — CE metadata + JSON form data
    ├── ce_chunks         — Embedded text chunks (RAG index)
    ├── references_library — JuMP standard references, embedded
    └── ai_generation_log  — Audit trail for AI-generated text
```

---

## Files Created

```
jump-oracle/
  backend/
    app/
      config.py           Pydantic Settings — loads env vars from .env
      db.py               Supabase service-role client singleton
      auth.py             FastAPI dependency — validates Supabase JWT → 401 if invalid
      main.py             FastAPI app, CORS restricted to frontend_url, /healthz endpoint
      routers/
        rag.py            POST /rag/ingest-ce endpoint
      services/
        chunking.py       extract_chunks_from_docx() + extract_chunks_from_ce_data()
        embedding.py      embed_texts() + embed_query() via Voyage AI
    scripts/
      seed_references.py  One-time: seed 19 JuMP references into references_library
      batch_ingest.py     One-time: batch-ingest existing CE DOCX files
    tests/
      test_auth.py        2 tests — JWT validation
      test_chunking.py    7 tests — DOCX and JSON chunking
      test_embedding.py   4 tests — Voyage AI embedding service
      test_rag_ingest.py  4 tests — POST /rag/ingest-ce endpoint
    requirements.txt
    .env.example
    pytest.ini
    Procfile              Railway: uvicorn app.main:app --host 0.0.0.0 --port $PORT
  supabase/
    migrations/
      006_ai_features.sql pgvector + 4 AI tables (NOT yet applied — see below)
  docs/
    ai-features-audit.md  Full AI feature design doc
    superpowers/plans/
      2026-05-24-ai-phase1-fastapi-rag-foundation.md  Original implementation plan
```

---

## What Each Piece Does

### `POST /rag/ingest-ce`

Takes a CE document ID, extracts text sections from its JSON data, embeds them via Voyage AI, and stores the vectors in `ce_chunks`. This is the main ingestion endpoint for new CEs created through the app.

```
POST /rag/ingest-ce
Authorization: Bearer <supabase-jwt>
Body: { "ce_id": "<uuid>" }

Response: { "chunks_created": 5 }
Errors: 404 if CE not found, 422 if ce_data has no text content
```

Flow:
1. Validate JWT
2. Fetch `ce_documents` row by id
3. Call `extract_chunks_from_ce_data()` → list of chunks (contexte, definition, cdc, phase×N)
4. Embed all chunk texts in one Voyage AI batch call
5. Delete stale chunks for this CE
6. Insert new chunks with embeddings
7. Mark `ce_documents.indexed_at = now()` and `status = final`

### Chunking Service

Splits CE text into section-level chunks. Two modes:

- **DOCX mode** (`extract_chunks_from_docx`): parses heading styles, skips editorial notes ("Comment faire", "À RETIRER"), splits MÉTHODOLOGIE into per-phase chunks
- **JSON mode** (`extract_chunks_from_ce_data`): reads the structured JSON stored in `ce_documents.ce_data` (contexte, resume_cdc, detail_cdc, phases)

Chunk types: `contexte`, `definition`, `cdc`, `phase`, `references`

### Embedding Service

Wraps Voyage AI `voyage-3` model. Singleton client (one connection for the lifetime of the process).

- `embed_texts(texts)` — batch embed for document storage (input_type="document")
- `embed_query(text)` — embed a user search query (input_type="query")

Output: 1024-dimensional float vectors, stored as `vector(1024)` in pgvector.

### Seed References Script

Seeds the `references_library` table with 19 standard JuMP references across 5 domains:
- Traduction (3), Bases de données (1), Stratégie (4), Ingénierie (5), Informatique (6)

Idempotent — safe to re-run (clears and re-inserts).

### Batch Ingest Script

Ingests existing CE DOCX files into the RAG index. For each file:
1. Upserts a `ce_documents` row (filename stem = ref_ce)
2. Extracts chunks via DOCX parser
3. Embeds and inserts into `ce_chunks`
4. Per-file errors are caught and reported at the end (one bad file doesn't kill the batch)

---

## Test Suite

17 tests, all passing. Run with:

```bash
conda run -n jump-oracle pytest -v
```

---

## What You Need to Do

### Step 1 — Run the Database Migration (Supabase SQL Editor)

Open your Supabase project → SQL Editor → paste the contents of:

```
supabase/migrations/006_ai_features.sql
```

Click **Run**. This creates:
- `vector` extension (pgvector)
- `ce_documents` table
- `ce_chunks` table (with `embedding vector(1024)` column)
- `references_library` table (with `embedding vector(1024)` column)
- `ai_generation_log` table
- Row-level security policies on all four tables

Verify with:
```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('ce_documents','ce_chunks','references_library','ai_generation_log');
```
Expected: 4 rows.

### Step 2 — Fill in `backend/.env`

Copy `.env.example` to `.env` and fill in real values:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
VOYAGE_API_KEY=your-voyage-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
FRONTEND_URL=http://localhost:5173
```

The service-role key is in Supabase → Project Settings → API → `service_role` (secret). Never commit this file.

### Step 3 — Seed the References Library

With `.env` filled in:

```bash
cd backend
conda activate jump-oracle
python -m scripts.seed_references
```

Expected output:
```
Seeded 19 references into references_library.
```

### Step 4 — Batch Ingest Your Existing CEs

Put all your past CE DOCX files in one directory (e.g. `C:\Users\yopla\Desktop\ces\`), then:

```bash
conda run -n jump-oracle python -m scripts.batch_ingest "C:\Users\yopla\Desktop\ces"
```

Expected output:
```
Ingesting CE-2024-001.docx... 7 chunks
Ingesting CE-2024-002.docx... 5 chunks
...
Done — 42 total chunks across 8 CE files.
```

If a file shows `0 chunks`, the DOCX uses heading style names not in the map. Open it, check the heading style names, and add them to `_SECTION_MAP` in `backend/app/services/chunking.py`.

### Step 5 — Deploy to Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select the `jump-oracle` repository
3. Set **Root Directory** to `backend`
4. Go to Variables and add:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your service-role key |
| `VOYAGE_API_KEY` | your Voyage AI key |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `FRONTEND_URL` | your Vercel app URL (e.g. `https://your-app.vercel.app`) |

5. Railway will deploy automatically using the `Procfile`
6. Watch the deploy logs for: `INFO: Application startup complete.`
7. Smoke test:

```bash
curl https://your-app.up.railway.app/healthz
# Expected: {"status":"ok"}
```

8. Update `CLAUDE.md` with the live Railway URL

---

## What Comes Next (Phase 2)

Phase 1 set up the foundation. Phase 2 will add:

- **CE Editor UI** — structured form in React with AI-assisted paragraph generation per section
- **`POST /rag/generate`** — calls Claude Sonnet with relevant RAG context to generate CE paragraphs
- **`POST /rag/search`** — semantic search over past CEs and references
- **Budget & phase estimation** — Claude-assisted estimation from mission specs
- **`ai_generation_log` reporting** — admin view of all AI-generated content

The RAG index will automatically improve as more CEs are ingested through the app.

---

## Key Implementation Decisions

| Decision | Reason |
|----------|--------|
| FastAPI on Railway (not Supabase Edge Functions) | AI calls take 10–30s; Vercel/Edge Functions timeout at 10s |
| Voyage AI `voyage-3` (1024-dim) | Best French-language embedding quality; multilingual by design |
| Claude Sonnet 4.6 (planned for generation) | Best prose quality for professional French documents |
| Section-level chunking (not sentence-level) | CE sections are short; section boundaries carry semantic meaning |
| Embed-before-delete ordering in ingest | Prevents data loss if embedding API fails mid-ingest |
| Service-role key in backend only | Never exposed to the browser; bypasses RLS for AI operations |
| `asyncio_mode = auto` in pytest | Avoids boilerplate `@pytest.mark.asyncio` on every test |
