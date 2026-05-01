# JuMP Oracle — Phase 1 Design Spec

**Date:** 2026-05-01  
**Scope:** Authentication + Directory & Prospecting Lists  
**Stack:** React + Vite + TailwindCSS + Supabase

---

## 1. Project Structure

```
jump-oracle/
  frontend/
    src/
      features/
        auth/
          components/    LoginForm
          hooks/         useAuth
          pages/         LoginPage
        directory/
          components/    ContactCard, ContactModal, ContactForm, ContextMenu
          hooks/         useContacts, useProspectingLists
          pages/         DirectoryPage, ListsPage
      shared/
        components/      Sidebar, Layout, ProtectedRoute
        lib/             supabase.js
      App.jsx
      main.jsx
    package.json
    vite.config.js
    tailwind.config.js
    index.html
  backend/               # empty — Django added in a later phase
  CLAUDE.md
```

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Bundler | Vite |
| UI | React 18 |
| Routing | React Router v6 |
| Styling | TailwindCSS |
| Icons | FontAwesome |
| Backend / Auth / DB | Supabase JS client |

---

## 3. Design Tokens

- **Primary color:** `#005a9f` (JuMP brand blue)
- **Theme:** Light — white/`#f8fafc` backgrounds, `#1e293b` text
- **Border color:** `#e2e8f0`
- **Muted text:** `#64748b`

---

## 4. Database Schema

All tables live in Supabase. RLS is enabled on every table.

### `profiles`
Extends `auth.users`. Created automatically on user sign-up via a Supabase trigger.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, FK → auth.users.id |
| role | enum | `admin`, `project_manager`, `consultant` |
| prenom | text | |
| nom | text | |

### `contacts`

| Column | Type |
|---|---|
| id | uuid PK |
| id_profil | text |
| prenom | text |
| nom | text |
| pays | text |
| ville | text |
| annee_obtention_diplome | integer |
| diplomes | text |
| entreprise_actuelle | text |
| titre_poste | text |
| email | text |
| telephone | text |
| linkedin | text |
| created_by | uuid FK → profiles.id |
| created_at | timestamptz |

### `prospecting_lists`

| Column | Type |
|---|---|
| id | uuid PK |
| name | text |
| created_by | uuid FK → profiles.id |
| created_at | timestamptz |

### `prospecting_list_contacts`
Junction table — composite PK on `(list_id, contact_id)`.

| Column | Type |
|---|---|
| list_id | uuid FK → prospecting_lists.id |
| contact_id | uuid FK → contacts.id |

### RLS Rules
- All authenticated users: SELECT on `contacts`, `prospecting_lists`, `prospecting_list_contacts`
- All authenticated users: INSERT/UPDATE on `contacts`, `prospecting_lists`, `prospecting_list_contacts`
- Only `admin` role: DELETE on `contacts`

---

## 5. Authentication

- **Provider:** Supabase Auth (email + password)
- **Session:** JWT stored in localStorage, managed by Supabase client
- **On login:** redirect to `/annuaire`
- **On unauthenticated access:** redirect to `/login`
- **Password management:** Admin-only via Supabase dashboard. No self-service password change in the app.
- **Role access:** `useAuth` fetches the `profiles` row after session load and exposes `{ user, role, login, logout }` via React context

---

## 6. Routing

| Path | Component | Auth required |
|---|---|---|
| `/login` | LoginPage | No |
| `/` | — | Redirect → `/annuaire` |
| `/annuaire` | DirectoryPage | Yes |
| `/annuaire/listes` | ListsPage | Yes |
| `/missions` | Stub (coming soon) | Yes |
| `/dashboard` | Stub (coming soon) | Yes |

---

## 7. App Shell

### Sidebar
- **Collapsed (48px):** icons only
- **Expanded (220px):** icons + labels
- Toggle: chevron button, click to expand/collapse
- Nav items: Annuaire, Missions *(greyed, "Bientôt" badge)*, Dashboard *(greyed, "Bientôt" badge)*, Settings
- Bottom: user initials avatar + logout button
- **Mobile (< 768px):** sidebar becomes a bottom navigation bar

### Layout
`Layout` wraps all protected pages. Renders `Sidebar` + a scrollable main content area.

---

## 8. Directory Page (`/annuaire`)

### Contact Cards
- Responsive grid: 4 columns (≥1280px), 3 columns (≥1024px), 2 columns (≥640px), 1 column (mobile)
- Each card displays:
  - Initials avatar (coloured with primary blue)
  - Full name (bold)
  - `entreprise_actuelle`, `titre_poste`
  - `email` and `telephone` inline
  - LinkedIn button (links to `linkedin` field, opens in new tab)
- **Left-click** → opens ContactModal (full profile, all fields)
- **Right-click** → ContextMenu with:
  - "Voir le profil" (same as click)
  - "Ajouter à une liste…" → sub-menu: existing lists + "Créer une nouvelle liste"
  - "Copier l'email" (copies to clipboard)

### Search
- Single search bar filters contacts client-side by name, company, or job title
- Debounced (300ms)

### Add Contact
- Floating action button ("+" icon, bottom-right)
- Opens ContactForm modal with all `contacts` fields
- On submit: INSERT via Supabase, grid refreshes

### ContactModal
- Overlay with dimmed background
- Full profile: all fields displayed, LinkedIn button, close button
- Responsive: full-screen on mobile

---

## 9. Lists Page (`/annuaire/listes`)

- Grid of list cards: list name, contact count, creation date
- Click a list → expands/navigates to show its contacts (same card style as Directory)
- Within a list view, right-click a contact card → "Retirer de la liste" option
- "Nouvelle liste" button → name input, creates empty list
- Lists are per-user (filtered by `created_by`) but all roles can create lists

---

## 10. Responsiveness

| Breakpoint | Behaviour |
|---|---|
| Mobile < 640px | 1-column card grid, sidebar → bottom nav, modals → full-screen sheets |
| Tablet 640–1023px | 2-column grid, sidebar collapsed by default |
| Desktop ≥ 1024px | 3–4 column grid, sidebar expanded by default |

---

## 11. Out of Scope (Phase 1)

- Missions module
- Staff Dashboard
- Django backend
- CSV / bulk import UI (imports done directly in Supabase)
- Email sending / notifications
