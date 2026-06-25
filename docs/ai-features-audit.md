# JuMP Oracle — AI Features Audit

**Date:** 2026-05-24  
**Status:** Pre-implementation design document  
**Stack:** React + Supabase + FastAPI (new) + Claude API + pgvector

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [CE Editor — Document Analysis](#2-ce-editor--document-analysis)
3. [AI Feature Catalog](#3-ai-feature-catalog)
4. [RAG Architecture](#4-rag-architecture)
5. [Infrastructure & Stack](#5-infrastructure--stack)
6. [FastAPI Backend Design](#6-fastapi-backend-design)
7. [Database Schema Additions](#7-database-schema-additions)
8. [Proposed Additional Features](#8-proposed-additional-features)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Risk & Tradeoffs](#10-risk--tradeoffs)

---

## 1. Executive Summary

This document audits all AI features to be added to JuMP Oracle. The core addition is a **Convention d'Étude (CE) editor** with AI-assisted paragraph generation. Surrounding it is a **RAG pipeline** that ingests past CEs and mission data to provide context-aware generation. A new **FastAPI backend** handles all AI calls (keeping API keys server-side) and DOCX export.

**Three pillars:**

| Pillar     | What it does                                                     |
| ---------- | ---------------------------------------------------------------- |
| CE Editor  | Structured form → AI paragraphs → DOCX export                    |
| Mission AI | Budget estimation, planning suggestions, similar-mission lookup  |
| RAG Engine | Embeds all past CE/mission data; powers retrieval for generation |

---

## 2. CE Editor — Document Analysis

### 2.1 Section Classification

The CE document has been analyzed and every section classified into one of four types.

#### Type A — Static Boilerplate (render as-is, no editing)

These sections are identical in every CE. They are stored as template text and injected verbatim.

| Section                                            | Notes                                               |
| -------------------------------------------------- | --------------------------------------------------- |
| PRÉSENTATION DE JUMP                               | Always the same 4 paragraphs                        |
| "Cadre pédagogique mis en place" (in MÉTHODOLOGIE) | Static paragraph                                    |
| Articles 1–16 (CONDITIONS GÉNÉRALES)               | Full legal boilerplate; only named variables change |
| Final paragraph of CONCLUSION                      | Static                                              |

#### Type B — Simple Form Inputs (structured fields, no AI)

These are variable placeholders that become form inputs in the editor.

**Client info**

- `client_titre`, `client_prénom`, `client_nom`
- `etude_client_societe_nom`, `etude_client_societe_adresse`, `etude_client_societe_code_postal`, `etude_client_societe_ville`, `etude_client_societe_pays`
- `SIRET`, `etude_client_fonction`
- `client_interlocuteur_mail`

**Study metadata**

- `ref_CE` (auto-generated from mission), `nom_societe`, `reference_etude`
- `date_redaction`

**JuMP president (from ERP profile)**

- `je_president_titre`, `je_president_prenom`, `je_president_nom`, `je_president_fonction`

**Chef de projet (from ERP members)**

- Name, email, phone — pulled from the mission's assigned chef de projet

**Budget inputs per phase**

- `nombre_JEH`, `prix_HT_par_JEH` (one row per phase)
- `frais_de_structure` (flat fee)
- `taux_tva` (currently 20%)

**Payment schedule**

- `etude_acompte_HT`, `etude_reste_HT` (intermediate milestones optional)

#### Type C — Auto-Computed (derived from Type B inputs, no AI)

These are calculated automatically once the form inputs are filled.

| Field                    | Computation                                             |
| ------------------------ | ------------------------------------------------------- |
| Total HT per phase       | `nombre_JEH × prix_HT_par_JEH`                          |
| Total HT hors frais      | Sum of all phase totals                                 |
| Total HT                 | `total_hors_frais + frais_de_structure`                 |
| TVA                      | `total_HT × taux_tva`                                   |
| Total TTC                | `total_HT + TVA`                                        |
| Acompte TTC              | `acompte_HT × (1 + taux_tva)`                           |
| PLANNING Gantt table     | Generated from phase names + `durée_semaines` per phase |
| Page count in CONCLUSION | Counted after DOCX assembly                             |

#### Type D — AI-Assisted Prose (the core AI feature)

These are the sections where a user writes keywords or bullet points, and the AI generates the full paragraph.

| Field                               | What the AI writes                                                                                | Context needed                                  | Typical length          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------- |
| `{exemples}` in RÉFÉRENCES          | Selects 2–4 bullet points from the library of past JuMP references, matched to the mission domain | Mission domain/keywords                         | 2–4 bullets             |
| `{etude_contexte_et_problématique}` | Company presentation + why they need this study                                                   | Client name, sector, brief problem statement    | 5–6 sentences           |
| `{etude_existant}` (optional)       | What the client already has / provides                                                            | What client supplies (code, data, doc)          | 3–4 sentences           |
| `{etude_resumecahierdescharges}`    | Short summary of the CDC                                                                          | Phase list + objectives                         | 3–4 sentences           |
| `{etude_cahierdescharges}`          | Detailed technical specs / deliverables                                                           | Full CDC bullet list the user writes            | 2–4 paragraphs          |
| Phase description (MÉTHODOLOGIE)    | What happens in this phase + justification                                                        | Phase name, JEH count, phase objective keywords | 3–5 sentences per phase |
| L'intervenant profile               | Student competency description                                                                    | Required skills + year of study                 | 2–3 sentences           |

### 2.2 Editor UX Flow

```
Step 1 — Study Metadata
  ├── ref_CE (auto)
  ├── Link to an existing Mission in the ERP (prefills chef, client, dates)
  └── Or manual entry (client fields)

Step 2 — Contexte & CDC
  ├── [Input] Client sector, keywords, problem statement (3–5 bullet points)
  ├── [AI] → generates {etude_contexte_et_problématique}
  ├── [Input] What the client provides (optional)
  ├── [AI] → generates {etude_existant}
  └── [Input] Deliverables list (user types bullets)
      ├── [AI] → generates {etude_resumecahierdescharges}
      └── [AI] → generates {etude_cahierdescharges}

Step 3 — Méthodologie
  ├── User adds N phases (name + objective keywords + JEH count)
  ├── [AI] → generates description for each phase
  └── User adds control points (format + linked phase)

Step 4 — Budget & Planning
  ├── JEH × price per phase (form inputs)
  ├── [Auto] computes all totals
  ├── [Auto] generates Gantt from phase durations
  └── Payment schedule (acompte %, intermediate milestones)

Step 5 — Équipe
  ├── Chef de projet → pulled from ERP mission or selected from members
  └── Intervenant profile → [AI] generates from required skills input

Step 6 — Références
  └── [AI] selects relevant bullets from past references library

Step 7 — Preview & Export
  ├── Live preview (HTML rendering of CE)
  ├── [AI] Validation check (see feature 3.5)
  └── Export → DOCX
```

### 2.3 DOCX Export Pipeline

The DOCX is assembled server-side in FastAPI using `python-docx`. This avoids browser limitations, keeps formatting consistent, and supports the JuMP branded template.

```
React editor state (JSON)
        │
        ▼ POST /ce/export-docx
FastAPI endpoint
        │
        ├── Hydrate all Type A boilerplate from templates/
        ├── Inject Type B fields
        ├── Render Type C computed values
        ├── Inject AI-generated Type D prose
        ├── Build Gantt table from phases
        └── Build Budget table from JEH data
        │
        ▼
python-docx assembles .docx
        │
        ▼ returns binary stream
React downloads file
```

The branded DOCX template (JuMP header, footer, fonts) is stored as a base template in FastAPI and filled programmatically.

---

## 3. AI Feature Catalog

### 3.1 CE Paragraph Generator

**What it does:** Takes a section identifier + user-provided keywords/bullets → returns a polished French paragraph ready to paste into the CE.

**Trigger:** User clicks "Générer avec l'IA" next to an AI-assisted field.

**Prompt strategy:** Each section has a dedicated system prompt that includes:

- The "Comment faire" instructions from the CE template (the internal writing guidelines that were previously in the doc)
- JuMP's tone: professional, concise, client-facing, French
- The RAG context: excerpts from similar past CEs (see section 4)

**Primary model: `claude-sonnet-4-6`** — best French prose quality, strong instruction following, handles the tone and structure of professional French business documents well.

**Alternative / evolution path: HuggingFace fine-tuned LLM**

Once enough CEs have been accumulated (50–100 finalized documents), a smaller model can be fine-tuned specifically on JuMP's CE corpus:

| Approach | Base model | Hosting | Cost | Tradeoff |
|----------|-----------|---------|------|----------|
| HF Inference API (serverless) | `mistralai/Mistral-7B-Instruct-v0.3` | HuggingFace | Pay-per-call, cold starts | Cheap at low volume, unreliable latency |
| HF Dedicated Endpoint | Fine-tuned Mistral-7B | HuggingFace GPU endpoint | ~$0.60/hr (pause when idle) | Good quality, predictable latency, higher fixed cost |
| Fine-tune via HF AutoTrain | Any base model | HF or self-hosted | One-time training cost | Best long-term if volume grows |

**Recommended hybrid strategy:**
- **Phase 1 (now):** Claude Sonnet for all generation. ~$4/month, zero setup.
- **Phase 2 (after 50+ CEs):** Fine-tune Mistral-7B on JuMP's CE corpus via HF AutoTrain. Deploy on HF Dedicated Endpoint paused when idle. Use for structured tasks (budget estimation, validation, phase descriptions). Keep Claude Sonnet for CONTEXTE/CDC sections where prose quality matters most.

The `ai_generation_log` table (section 7) serves double duty: it's the training dataset for the fine-tune.

**Iteration:** User can regenerate (with a different instruction) or edit the generated text manually. The editor always allows manual override.

**Example for CONTEXTE section:**

```
User inputs:
  - Client: TotalEnergies
  - Secteur: Énergie / Transition énergétique
  - Problème: Optimisation de la gestion des stocks de pièces de rechange pour éoliennes

→ AI generates:
  "TotalEnergies, acteur majeur de la transition énergétique mondiale, développe
   aujourd'hui un parc éolien offshore de grande envergure. Dans ce contexte de
   montée en puissance des énergies renouvelables, la gestion efficace des stocks
   de pièces de rechange constitue un enjeu opérationnel et financier critique.
   C'est pourquoi TotalEnergies a souhaité confier à JuMP..."
```

---

### 3.2 Smart References Selector

**What it does:** Given a mission domain and keywords, AI selects the most relevant 2–4 bullet points from JuMP's library of past references (which is a curated list stored in the DB).

**How it works:**

1. JuMP maintains a `references_library` table: each row is one past reference bullet (e.g., "Analyse stratégique de la mise en concurrence des concessions hydroélectriques").
2. Each row has a domain tag and an embedding vector.
3. At CE creation time: embed the mission description → retrieve top-k matching references → AI selects and reformats the most relevant ones.

**Why not just retrieve top-k directly?** The AI reformatting step adapts the reference wording to match the specific client/domain. It also groups and orders them naturally.

---

### 3.3 AI Budget Estimator

**What it does:** Given a mission description and phase list, suggests JEH counts per phase based on similar past missions stored in the RAG.

**Trigger:** Optional — user can click "Estimer avec l'IA" after defining phases, or skip and enter manually.

**Output:** Suggested JEH count per phase with a brief justification ("Based on 3 similar past missions averaging 8 JEH for the analysis phase").

**Model:** `claude-haiku-4-5` — this is a structured extraction task, doesn't need Sonnet.

**Confidence signal:** The estimate always shows "based on N similar missions" so the user understands the confidence level. If the RAG has no similar missions, the estimator falls back to general heuristics (1 JEH ≈ 8h of work).

---

### 3.4 Mission Planning Assistant

**What it does:** Given a mission description, suggests a logical phase breakdown (phase names, recommended ordering, duration in weeks) before the user manually configures them.

**Trigger:** After the user fills in mission context, AI proposes a default phase list as a starting point. User accepts, rejects, or edits each phase.

**Powered by:** RAG retrieval of similar past missions' phase structures.

**Example output:**

```
Suggested phases for "Optimisation des stocks éoliens":
  Phase 1: Audit de l'existant — 4 JEH — 2 semaines
  Phase 2: Modélisation et analyse — 8 JEH — 3 semaines
  Phase 3: Recommandations et livrable final — 4 JEH — 2 semaines
```

---

### 3.5 CE Validation Checker

**What it does:** Before the user exports to DOCX, an AI pass reviews the full CE for:

- Missing required fields (flagged as errors)
- Inconsistencies (e.g., phase names in MÉTHODOLOGIE don't match PLANNING/BUDGET tables)
- JEH total mismatch between MÉTHODOLOGIE and BUDGET
- Deliverable format not specified in Cahier des Charges
- Payment schedule doesn't sum to total HT
- Chef de projet passation date not updated

**Output:** A checklist of issues (blocking vs. warnings) shown before export. The user must resolve blocking issues; warnings are advisory.

**Model:** `claude-haiku-4-5` — structured validation, fast, cheap.

---

### 3.6 Similar Mission Search

**What it does:** At any point while creating a CE, the user can search "Missions similaires" — the system returns past CEs ranked by similarity to the current mission description.

**Use case:** Before writing, see how a comparable past study was scoped, budgeted, and phrased. Helps with consistency across CEs.

**Powered by:** pgvector semantic search on `ce_documents.embedding`.

**UI:** Side panel showing top 3 similar CEs with: client, domain, total JEH, total budget, date. Click to expand and read the relevant sections.

---

## 4. RAG Architecture

### 4.1 What Gets Embedded

| Source             | What is embedded                                              | Purpose                      |
| ------------------ | ------------------------------------------------------------- | ---------------------------- |
| Finalized CEs      | Full CONTEXTE + CDC + MÉTHODOLOGIE sections, split by section | CE writing assistant context |
| Phase descriptions | Each phase description individually                           | Phase planning suggestions   |
| Budget data        | Phase name + JEH count (as text)                              | Budget estimation            |
| References library | Each reference bullet                                         | Smart references selection   |
| Mission records    | Mission title + description + tags                            | Similar mission search       |

### 4.2 Chunking Strategy

The CE document is long. We split it into logical chunks rather than fixed token windows:

```
ce_chunks table:
  - ce_id          → FK to ce_documents
  - section        → enum: contexte | cdc | methodologie_phase | references
  - phase_index    → nullable int (for phase chunks)
  - text           → the raw text of this chunk
  - embedding      → vector(1024)   [pgvector]
  - created_at
```

Each section/phase is one chunk. This gives clean retrieval — when generating a MÉTHODOLOGIE phase, we retrieve similar phase chunks, not unrelated context sections.

### 4.3 Embedding Model

**Recommended: Voyage AI `voyage-3`**

- State-of-the-art retrieval quality, Anthropic-aligned
- 1024-dimension vectors
- Called from FastAPI via HTTP

**Alternative: OpenAI `text-embedding-3-small`**

- Slightly lower quality, cheaper, widely used
- Same integration pattern

**Alternative: HuggingFace sentence-transformers**

- `intfloat/multilingual-e5-large` — strong French support, free to run, 1024 dimensions
- Can run locally in FastAPI via `sentence-transformers` library (no external API call, no cost)
- Tradeoff: adds ~1GB RAM usage to FastAPI process; cold start is slower; retrieval quality slightly below Voyage AI on French text
- Best choice if API costs become a concern at scale or if the backend is self-hosted

Both external options are called server-side from FastAPI. Never from the browser.

### 4.4 Retrieval Flow (per AI generation call)

```
User fills keywords for CONTEXTE section
        │
        ▼
FastAPI: embed the user's input with Voyage AI
        │
        ▼
pgvector: SELECT ce_chunks WHERE section = 'contexte'
          ORDER BY embedding <=> query_vector LIMIT 5
        │
        ▼
FastAPI: assemble prompt:
  [system]  You are writing a Convention d'Étude for JuMP...
  [context] Here are excerpts from similar past studies:
            <chunk 1> ... </chunk 1>
            <chunk 2> ... </chunk 2>
  [user]    Generate the CONTEXTE section for:
            Client: TotalEnergies
            Secteur: Énergie
            Problème: ...
        │
        ▼
Claude API (claude-sonnet-4-6)
        │
        ▼
Generated paragraph returned to React
```

### 4.5 RAG Ingestion Pipeline

**Existing CE/mission data available at launch — no cold start problem.** Past CEs and mission records already exist and will be batch-ingested before the first user touches the new editor. This means the RAG is pre-warmed on day one.

**Batch ingestion (one-time, at launch):**

```
Python script (runs once locally or on Railway)
        │
        ├── Load all past CEs from files / existing DB records
        ├── Parse into sections (contexte, CDC, phases…)
        ├── Embed in batches via Voyage AI
        └── Insert into ce_chunks + ce_documents
```

**Ongoing ingestion (when a new CE is finalized):**

```
CE status → finalisée
        │
        ▼
FastAPI background task triggered (or Supabase webhook → FastAPI)
        │
        ├── Extract each section text
        ├── Split into chunks (by section)
        ├── Call Voyage AI embeddings API (batch)
        ├── Upsert into ce_chunks (with pgvector)
        └── Update ce_documents.indexed_at
```

This runs async — the user doesn't wait for it.

---

## 5. Infrastructure & Stack

### 5.1 Full Stack After AI Features

```
┌──────────────────────────────────────────────────────────────┐
│  Vercel (frontend)                                            │
│  React + Vite — CE editor UI                                  │
│  AI triggers → fetch to Railway FastAPI                       │
│  Supabase JS client → existing data queries                   │
└──────────┬─────────────────────────────┬──────────────────────┘
           │ PostgREST (existing)         │ REST/JSON (new AI routes)
           ▼                              ▼
┌──────────────────┐         ┌────────────────────────────────────┐
│  Supabase         │         │  Railway (FastAPI backend)          │
│  - PostgreSQL     │◄───────►│  - /ai/* generation routes          │
│  - pgvector       │         │  - /ce/export-docx                  │
│  - Auth/JWT       │         │  - /ai/validate-ce                  │
│  - PostgREST      │         │  - /rag/ingest-ce (async worker)    │
│  - Storage        │         └──────────────┬─────────────────────┘
└──────────────────┘                         │
                                             ├── Anthropic API
                                             │   claude-sonnet-4-6 (prose)
                                             │   claude-haiku-4-5  (validation)
                                             │
                                             ├── Voyage AI
                                             │   voyage-3 embeddings
                                             │
                                             └── HuggingFace (Phase 2)
                                                 Fine-tuned Mistral-7B
                                                 (structured tasks)
```

### 5.2 FastAPI Setup

**Language:** Python 3.12  
**Framework:** FastAPI + Uvicorn  
**Key libraries:**

- `anthropic` — Claude API SDK
- `python-docx` — DOCX generation
- `supabase-py` — DB access from backend
- `httpx` — async HTTP calls (Voyage AI)
- `pydantic` — request/response validation

**Auth:** FastAPI receives the Supabase JWT from the browser in `Authorization: Bearer <token>` and validates it using Supabase's JWKS. No separate auth system needed.

**Environment variables (never in frontend):**

```
ANTHROPIC_API_KEY=...
VOYAGE_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...   # full access for backend operations
```

**Deployment split — recommended:**

| Service | What runs there | Why |
|---------|----------------|-----|
| **Vercel** | React frontend | Native Vite/React support, zero-config, free hobby tier |
| **Railway** | FastAPI backend | AI calls can take 10–30s — Vercel Hobby times out at 10s; Railway has no timeout limit on the $5/mo plan |

Vercel can technically run FastAPI via Python Serverless Functions (with `mangum` adapter), but the 10s timeout on the Hobby plan is too short for Claude generation calls. The Pro plan ($20/mo) raises this to 60s but adds cost. The cleanest split is **Vercel for frontend + Railway for backend** — both deploy from GitHub, both have environment variables UI, and the CORS configuration is one line in FastAPI.

If Vercel Pro is already in use, the all-Vercel option (FastAPI via serverless functions) is viable for all routes except the async RAG ingestion background task, which would need to move to a Supabase webhook → Railway endpoint.

### 5.3 Supabase pgvector Setup

pgvector is available as a Supabase extension. Enable it once:

```sql
create extension if not exists vector;
```

Then the `ce_chunks.embedding` column uses type `vector(1024)`.

Index for fast ANN search:

```sql
create index on ce_chunks using hnsw (embedding vector_cosine_ops);
```

### 5.4 API Costs Estimate (monthly)

Assumptions: ~20 CEs/month, ~10 AI calls per CE (paragraph gen + validation), ~50 similarity searches.

| Service              | Usage                                          | Estimated cost |
| -------------------- | ---------------------------------------------- | -------------- |
| Claude Sonnet 4.6    | ~200 generation calls × ~1500 tokens avg       | ~$3            |
| Claude Haiku 4.5     | ~200 validation/estimation calls × ~800 tokens | < $0.50        |
| Voyage AI embeddings | ~500 embed calls × 512 tokens avg              | < $0.10        |
| **Total**            |                                                | **~$4/month**  |

Very low — this is an internal tool with a small team.

---

## 6. FastAPI Backend Design

### 6.1 Route Map

```
POST /ai/generate-paragraph
  body: { section: str, keywords: str, mission_context: dict, rag_enabled: bool }
  returns: { text: str, sources: list[ce_id] }

POST /ai/select-references
  body: { mission_description: str, domain: str }
  returns: { references: list[str] }

POST /ai/estimate-budget
  body: { phases: list[{ name, objective }], mission_description: str }
  returns: { phases: list[{ name, suggested_jeh, rationale }] }

POST /ai/suggest-phases
  body: { mission_description: str }
  returns: { phases: list[{ name, objective, suggested_jeh, suggested_weeks }] }

POST /ai/validate-ce
  body: { ce_data: CEData }
  returns: { errors: list[Issue], warnings: list[Issue] }

GET  /ai/similar-missions
  query: ?description=...&limit=5
  returns: { missions: list[SimilarMission] }

POST /ce/export-docx
  body: { ce_data: CEData }
  returns: binary .docx stream

POST /rag/ingest-ce
  body: { ce_id: uuid }   # triggered when CE is finalized
  returns: { chunks_created: int }
```

### 6.2 CEData Schema (shared between frontend and FastAPI)

```python
class Phase(BaseModel):
    name: str
    objective: str
    description: str          # AI-generated or manual
    jeh_count: float
    price_per_jeh: float
    duration_weeks: int
    control_point: Optional[ControlPoint]

class CEData(BaseModel):
    ref_ce: str
    mission_id: Optional[uuid.UUID]
    client: ClientInfo
    president: PresidentInfo
    chef_de_projet: ChefInfo
    contexte: str             # AI-generated or manual
    etude_existant: Optional[str]
    resume_cdc: str
    detail_cdc: str
    phases: list[Phase]
    references_bullets: list[str]
    intervenant_profile: str
    frais_structure: float
    taux_tva: float
    acompte_ht: float
    validity_months: int
    date_redaction: date
```

---

## 7. Database Schema Additions

### New tables for AI features

```sql
-- Stores finalized CE documents
create table ce_documents (
  id           uuid primary key default gen_random_uuid(),
  mission_id   uuid references missions(id),
  ref_ce       text not null unique,
  ce_data      jsonb not null,          -- full CEData as JSON
  status       text default 'draft',    -- draft | final
  created_by   uuid references profiles(id),
  created_at   timestamptz default now(),
  indexed_at   timestamptz              -- null until RAG ingestion done
);

-- RAG chunks for retrieval
create table ce_chunks (
  id           uuid primary key default gen_random_uuid(),
  ce_id        uuid references ce_documents(id) on delete cascade,
  section      text not null,           -- contexte | cdc | phase | reference
  phase_index  int,                     -- null except for phase chunks
  text         text not null,
  embedding    vector(1024),
  created_at   timestamptz default now()
);

create index on ce_chunks using hnsw (embedding vector_cosine_ops);

-- Library of past JuMP references (the bullets in the RÉFÉRENCES section)
create table references_library (
  id           uuid primary key default gen_random_uuid(),
  text         text not null,           -- the bullet point text
  domain       text,                    -- e.g. "Informatique", "Stratégie"
  embedding    vector(1024),
  active       boolean default true
);

-- Audit log of AI generations (for quality review)
create table ai_generation_log (
  id           uuid primary key default gen_random_uuid(),
  ce_id        uuid references ce_documents(id),
  section      text,
  user_input   text,
  generated    text,
  model        text,
  rag_sources  uuid[],
  created_at   timestamptz default now()
);
```

### RLS Policies

- `ce_documents`: all authenticated users can SELECT; INSERT/UPDATE restricted to creator or admin; DELETE admin only
- `ce_chunks` + `references_library`: SELECT for all authenticated; INSERT/UPDATE via service role only (FastAPI backend)
- `ai_generation_log`: SELECT for admin only; INSERT via service role

---

## 8. Proposed Additional Features

These are not in the initial request but are natural extensions worth building later.

### 8.1 Contact Outreach Drafter

**What:** Given a selected contact from the Annuaire + a mission description, AI drafts a personalized prospecting email.

**Input:** Contact profile (name, role, company, sector) + mission type  
**Output:** French email draft, ready to copy-paste or send  
**Powered by:** Claude Sonnet + contact data from Supabase

**Value:** Saves 20–30 min per outreach email, keeps tone consistent.

---

### 8.2 Mission Debrief Generator

**What:** After a mission is marked "Terminée", AI generates a structured retrospective document:

- What was delivered (from milestones)
- Timeline vs. plan (from meeting log and milestone dates)
- Budget consumed vs. budgeted
- Key learnings (from meeting notes + user input)

**Input:** Mission data from ERP (milestones, meetings, budget, team)  
**Output:** A structured debrief PDF/DOCX

**Value:** Feeds back into the RAG — debriefs become context for future similar missions.

---

### 8.3 Dashboard AI Summary

**What:** A daily/weekly AI-generated summary on the Dashboard:

- "3 missions are behind schedule"
- "Budget overrun detected on Mission X"
- "2 CEs pending validation"
- "Suggested priority this week: ..."

**Input:** All active mission data (milestones, meetings, budget)  
**Output:** 3–5 bullet natural language summary, refreshed daily

**Powered by:** Claude Haiku (cheap, fast) + structured mission data

---

### 8.4 CE Version Comparison

**What:** When a CE is amended (avenant), AI highlights what changed between versions and flags legal/financial implications.

**Value:** Reduces errors when updating CE after project scope changes.

---

## 9. Implementation Roadmap

Recommended order balancing value delivery vs. dependency:

### Phase 1 — Foundation (prerequisite for everything)

1. FastAPI project setup (auth middleware, Supabase connection, env vars, CORS for Vercel)
2. Enable pgvector in Supabase, create `ce_documents` + `ce_chunks` + `references_library` tables
3. **Batch ingest existing past CEs** — one-time Python script processes all historical CE files + mission records → embed → store in pgvector. RAG is pre-warmed at launch.
4. Seed `references_library` with existing JuMP reference bullets + embeddings
5. RAG ingestion endpoint (`POST /rag/ingest-ce`) for ongoing ingestion as new CEs are finalized

### Phase 2 — CE Editor Core

5. CE editor UI in React (all form sections, step wizard)
6. DOCX export (`POST /ce/export-docx`) with python-docx template
7. Save/load CE drafts from `ce_documents`

### Phase 3 — AI Generation

8. Paragraph generator (`POST /ai/generate-paragraph`) with RAG retrieval
9. Smart references selector (`POST /ai/select-references`)
10. CE validation checker (`POST /ai/validate-ce`)

### Phase 4 — Mission AI

11. Budget estimator (`POST /ai/estimate-budget`)
12. Phase planner (`POST /ai/suggest-phases`)
13. Similar mission search (`GET /ai/similar-missions`)

### Phase 5 — Proposed Extensions

14. Contact outreach drafter
15. Mission debrief generator
16. Dashboard AI summary

---

## 10. Risk & Tradeoffs

| Risk                                   | Mitigation                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI generates poor French prose         | System prompt tuned with CE examples; user always edits manually; regenerate button; `ai_generation_log` lets you spot patterns in bad outputs                  |
| DOCX formatting breaks JuMP branding   | Use a carefully crafted python-docx base template; test with 2–3 real CEs before launch                                                                         |
| API key leakage                        | Keys only in FastAPI env vars, never in frontend code or Supabase                                                                                               |
| FastAPI cold starts on Railway         | Railway keeps containers warm on paid plan ($5/mo); add a `/healthz` endpoint and ping it from the frontend on app load                                         |
| Vercel timeout on AI routes            | All AI calls go through Railway (FastAPI), not Vercel serverless functions — no timeout issue                                                                    |
| Budget estimation is wrong             | Always shown as a suggestion with N similar missions cited; user must confirm manually                                                                           |
| pgvector HNSW index recall degradation | At the scale of <500 CEs, exact cosine search is fast enough — skip HNSW initially, add the index only when query latency exceeds 200ms                         |
| HF fine-tuned model underperforms      | Fine-tune is optional and deferred; quality gate before switching: compare outputs side-by-side on 20 held-out CEs; only switch if parity or better with Claude |
