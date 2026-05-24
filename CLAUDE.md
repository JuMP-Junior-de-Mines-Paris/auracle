# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JuMP Oracle is a web-based ERP for "JuMP" (Junior de Mines Paris), a student-led engineering startup. It manages internal organization, prospecting, and mission management.

## Tech Stack

- **Frontend**: React + TailwindCSS + FontAwesome
- **Database & API**: Supabase (PostgreSQL + PostgREST)
- **Auth**: Supabase + JWT
- **Backend**: Django (Python) — planned for later, not active yet

## Development Phasing

This project follows a strict step-by-step approach. **Do not skip ahead — wait for approval after each step:**

1. **Step 1 — Database Schema**: SQL schema / Django ORM models for Users, Roles, Contacts, Prospecting Lists, Missions, Milestones
2. **Step 2 — Authentication Flow**: Login logic, password hashing validation, role-based middleware
3. **Step 3 — Backend API**: REST endpoints for Directory and Mission Management
4. **Step 4 — Frontend UI (Directory)**: Contact table, filtering, list creation interface
5. **Step 5 — Frontend UI (Mission & Dashboard)**: Mission registration form, milestone planner, staff dashboard

## Architecture

The application is a React SPA talking directly to Supabase. There is no custom backend — all data access goes through the Supabase client SDK (PostgREST + Auth). A Django backend will be introduced in a later phase.

### Core Modules

**RBAC** — Three roles: Admin, Project Manager, Consultant. Admins manage passwords (members cannot self-change).

**Directory (Annuaire)** — Contact model with exact fields:
`id_profil`, `prenom`, `nom`, `pays`, `ville`, `annee_obtention_diplome`, `diplomes`, `entreprise_actuelle`, `titre_poste`, `email`, `telephone`, `linkedin`

Users can select contacts and save them into named **Prospecting Lists**.

**Mission Management** — Register missions with goals, specs, client details. Assign a Chef de Projet. Track meetings, milestones, deadlines.

**Staff Dashboard** — Overview of all active missions with progress/status indicators.

## Commands

### Frontend (React)
- `npm install && npm start` — React dev server
- `npm test` — React tests

### Backend (FastAPI on Railway)
- Local dev: `cd backend && conda activate jump-oracle && uvicorn app.main:app --reload`
- Production: deploy to Railway (see deployment instructions below)
- Health check: `GET /healthz` → `{"status":"ok"}`
- Conda env: `jump-oracle` (Python 3.11)
- Run tests: `conda run -n jump-oracle pytest -v` from `backend/`

### Railway Deployment (manual steps)
1. Go to railway.app → New Project → Deploy from GitHub repo
2. Select the `jump-oracle` repository; set **Root Directory** to `backend`
3. Set these environment variables in Railway → your service → Variables:
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — your Supabase service-role key
   - `VOYAGE_API_KEY` — your Voyage AI key
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `FRONTEND_URL` — your Vercel app URL (e.g. `https://your-app.vercel.app`)
4. Railway detects Python via `requirements.txt` and uses `Procfile` as the start command
5. After deploy: `curl https://your-app.up.railway.app/healthz` → `{"status":"ok"}`
6. Update this file with the live Railway URL once deployed

### One-time scripts (run after Railway is up and DB migration is applied)
- Seed references library: `conda run -n jump-oracle python -m scripts.seed_references`
- Batch ingest existing CEs: `conda run -n jump-oracle python -m scripts.batch_ingest /path/to/docx/files`

### Database migration (manual — Supabase SQL Editor)
Run `supabase/migrations/006_ai_features.sql` in the Supabase SQL Editor.
This creates: `ce_documents`, `ce_chunks`, `references_library`, `ai_generation_log` tables + pgvector extension.
