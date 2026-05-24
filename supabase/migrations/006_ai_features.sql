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
create index if not exists ce_chunks_ce_id_idx on ce_chunks(ce_id);
create index if not exists ce_chunks_section_idx on ce_chunks(section);
create index if not exists references_library_domain_idx on references_library(domain);
