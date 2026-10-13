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
- Health check: `GET /api/healthz` → `{"status":"ok"}`
- Conda env: `jump-oracle` (Python 3.11)
- Run tests: `conda run -n jump-oracle pytest -v` from `backend/`

### Générateur de convention d'étude (CE)
Formulaire React (`/conventions`, ouvert à tout membre connecté : aucune permission requise) → `POST /api/ce/export-docx` → .docx rempli à partir du vrai modèle JuMP.
- Modèle Word : `backend/app/templates/convention_etude.docx` (le modifier dans Word suffit ; les `{placeholders}` et la structure sont lus par `backend/app/services/ce_docx.py`)
- Données : `ce_schema.py` (validation, règles métier : JEH entre 80 et 450 € HT), `ce_budget.py` (calculs en Decimal)
- Variables globales de JuMP (président = César Colombo, prix du JEH 300 €, TVA, validité, acompte) : `backend/app/services/ce_globals.py`, exposées par `GET /api/ce/globals`. Le président n'est jamais saisi : le serveur l'applique. Changer de président = modifier ce seul fichier.
- Budget : le total HT est la somme des budgets de phase (pas de frais de structure). Chaque intervenant a un prénom et un nom.
- Tout texte reçu est nettoyé (`nettoyer` dans `ce_schema.py`) : un copier-coller depuis Word/PDF avec caractères de contrôle ferait sinon échouer la génération. Les accolades saisies par l'utilisateur restent littérales (`_shield` dans `ce_docx.py`).
- Un texte `origin: "ai"` non relu bloque l'export côté serveur ; une section obligatoire vide aussi, sauf `?brouillon=true`
- Rédaction par IA : `POST /api/ce/generate` (`ce_generate.py`, `llm.py`). Le chef de projet fournit ses notes ; un seul appel à Gemini rédige contexte, existant, résumé du CDC, CDC et description de chaque phase. La réponse donne `textes` et `reviews` indexés par chemin CEData (`phases.0.description`), déjà marqués `origin: "ai"`, non relus. Le modèle n'écrit jamais de prix ni de JEH, et un montant absent des notes est signalé dans `warnings`.
  - Clés : pas de clé du serveur. Chaque membre saisit sa clé Gemini (créée sur aistudio.google.com/apikey : l'abonnement Gemini Pro n'en fournit pas) dans Paramètres, via `GET/PUT/DELETE /api/ai-key` (`routers/ai_keys.py`). Elle est chiffrée (Fernet, secret `AI_KEYS_SECRET`) dans `user_ai_keys` (migration 022, sans aucune policy : seul le backend la lit) et n'est jamais renvoyée au navigateur. Sans clé, `/generate` répond 409 `no_ai_key`. Le modèle se règle par `GEMINI_MODEL`.
  - Confidentialité : les notes partent chez Google sous le compte du membre. D'après les conditions de Google, en UE/UK/Suisse le quota gratuit suit les règles du payant (pas d'entraînement). Par prudence `ce_anonymize.py` remplace société et contacts par des jetons (`[CLIENT]`…) et supprime emails, téléphones et SIRET avant l'envoi, puis remet les noms dans le texte reçu. Un nom non déclaré dans les notes n'est pas détecté.
- Archives : `POST /api/ce/save` (`ce_archive.py`, permission `ce.write`) enregistre la convention dans `ce_documents` et crée une mission `status = 'archived'`, `category = 'convention_etude'` (migration 023). La référence identifie la convention : réenregistrer la même met à jour la même mission (son statut n'est pas touché). Boutons « Enregistrer » et « Générer / Brouillon » (qui archive aussi après le téléchargement ; sans `ce.write` le document reste téléchargeable, sans message d'erreur). Les textes IA non relus sont enregistrables : seul l'export Word les bloque. La page `/archives` liste les missions archivées par catégorie ; `/missions` ne les affiche plus.
- Dev : lancer le backend (`uvicorn app.main:app --reload`, port 8000) ; le proxy Vite envoie `/api` vers lui
  - Sans `backend/.env` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) le backend ne démarre pas (`AI_KEYS_SECRET` n'est exigé que pour enregistrer des clés Gemini), et le proxy Vite répond alors 500 sans corps : l'interface affiche « Le backend est-il lancé ? ».
  - Dépendances : `python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt`, puis `cd backend && .venv/bin/python -m uvicorn app.main:app --reload`.
- Le dossier `ce/` à la racine (conventions clients, identifiants) est ignoré par git : ne jamais le committer

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
5. After deploy: `curl https://your-app.up.railway.app/api/healthz` → `{"status":"ok"}`
6. Update this file with the live Railway URL once deployed

### One-time scripts (run after Railway is up and DB migration is applied)
- Seed references library: `conda run -n jump-oracle python -m scripts.seed_references`
- Batch ingest existing CEs: `conda run -n jump-oracle python -m scripts.batch_ingest /path/to/docx/files`

### Database migration (manual — Supabase SQL Editor)
Run `supabase/migrations/006_ai_features.sql` in the Supabase SQL Editor.
This creates: `ce_documents`, `ce_chunks`, `references_library`, `ai_generation_log` tables + pgvector extension.
