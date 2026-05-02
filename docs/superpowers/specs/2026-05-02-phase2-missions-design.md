# JuMP Oracle — Phase 2 Design Spec

**Date:** 2026-05-02
**Scope:** Mission Management + Staff Dashboard
**Stack:** React + Vite + Supabase (same as Phase 1)

---

## 1. Overview

Phase 2 adds two modules:

- **Mission Management** (`/missions`, `/missions/:id`) — create and manage consulting missions with client info, team assignment, milestones, and meeting logs
- **Staff Dashboard** (`/dashboard`) — KPI summary cards, personal missions view, and org-wide missions overview

Both routes currently render a `ComingSoon` stub. Phase 2 replaces them with real implementations.

---

## 2. Database Schema

All tables live in Supabase with RLS enabled.

### `missions`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto-generated |
| title | text | mission name |
| description | text | objectives and scope |
| client_name | text | |
| client_contact_name | text | |
| client_contact_email | text | |
| chef_de_projet | uuid FK → profiles.id | assigned project manager |
| status | text | `draft`, `active`, `completed`, `archived` |
| start_date | date | |
| end_date | date | |
| budget | numeric | optional |
| created_by | uuid FK → profiles.id | |
| created_at | timestamptz | default now() |

### `mission_team`

Junction table linking consultants to missions. Composite PK on `(mission_id, profile_id)`.

| Column | Type |
|---|---|
| mission_id | uuid FK → missions.id |
| profile_id | uuid FK → profiles.id |

### `milestones`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| mission_id | uuid FK → missions.id | |
| title | text | |
| due_date | date | |
| done | boolean | default false |
| created_at | timestamptz | default now() |

### `meetings`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| mission_id | uuid FK → missions.id | |
| title | text | |
| date | date | |
| notes | text | free-text notes |
| attendees | text[] | profile ids or free-text names |
| created_at | timestamptz | default now() |

### RLS Rules

- All authenticated users: `SELECT` on all four tables
- `missions`: `INSERT` for all authenticated; `UPDATE`/`DELETE` when `created_by = auth.uid()` OR `chef_de_projet = auth.uid()` OR user has a row in `mission_team` for that mission
- `mission_team`, `milestones`, `meetings`: `INSERT`/`UPDATE`/`DELETE` when user can edit the parent mission (same condition as above)

---

## 3. Routing

| Path | Component | Auth required |
|---|---|---|
| `/missions` | MissionsPage | Yes |
| `/missions/:id` | MissionDetailPage | Yes |
| `/dashboard` | DashboardPage | Yes |

Replaces the existing `ComingSoon` stubs in `App.jsx`. No sidebar changes needed.

---

## 4. Frontend Structure

```
features/
  missions/
    hooks/
      useMissions.js          # list + CRUD for missions
      useMissionDetail.js     # single mission + team + milestones + meetings
    pages/
      MissionsPage.jsx        # /missions — table + create button
      MissionDetailPage.jsx   # /missions/:id — tabbed detail
    components/
      MissionForm.jsx         # create/edit modal
      MilestoneList.jsx       # Jalons tab content
      MeetingLog.jsx          # Réunions tab content
      TeamPanel.jsx           # Équipe tab content
  dashboard/
    hooks/
      useDashboard.js         # KPI counts + missions summary
    pages/
      DashboardPage.jsx       # /dashboard
```

---

## 5. Page Designs

### `/missions` — MissionsPage

- Table with columns: Titre, Client, Chef de Projet, Statut (badge), Date de fin
- "Nouvelle mission" button (top-right) opens `MissionForm` modal
- Status badge colors: draft (grey), active (blue), completed (green), archived (muted)
- Clicking a row navigates to `/missions/:id`

### `/missions/:id` — MissionDetailPage

Sticky header showing: mission title, client name, status badge, "Modifier" button (for authorized users).

Four tabs below the header:

**Aperçu** — all mission fields displayed in a two-column grid (same `Field` component pattern as `ContactDrawer`): description, client contact, dates, budget, Chef de Projet.

**Équipe** — list of assigned consultants with avatar + name + role. "Ajouter un membre" button opens a member picker (same search pattern as `ShareModal` in `ListsPage`).

**Jalons** — checklist of milestones. Each row: checkbox (toggles `done`), title, due date, overdue indicator (red date if past due and not done). "Ajouter un jalon" inline form at the bottom.

**Réunions** — chronological log of meetings. Each entry: date, title, notes, attendees. "Ajouter une réunion" form at the bottom with date picker, title, notes textarea, and attendee selector.

### `/dashboard` — DashboardPage

**KPI row** (3 cards):
- Missions actives (count of status = `active`)
- Jalons en retard (milestones past due_date where done = false)
- Consultants actifs (distinct profiles in mission_team for active missions)

**Two-column layout below KPIs:**

Left column — "Mes missions": cards for missions where `chef_de_projet = current user` OR user is in `mission_team`. Each card shows title, client, status, next upcoming milestone.

Right column (stacked):
- Full missions table (same as MissionsPage but compact, no create button)
- "Prochains jalons" widget — list of the 5 nearest upcoming milestones across all active missions, sorted by due_date

---

## 6. Data Flow

### `useMissions()`

```js
// Queries: missions with chef_de_projet name joined
// Exposes: { missions, loading, createMission, updateMission }
supabase.from('missions')
  .select('*, chef:profiles!chef_de_projet(prenom, nom)')
  .order('created_at', { ascending: false })
```

### `useMissionDetail(id)`

Four parallel queries on mount via `Promise.all`:
1. Mission row + chef name
2. Team members (`mission_team` + `profiles`)
3. Milestones ordered by `due_date`
4. Meetings ordered by `date` descending

Exposes: `{ mission, team, milestones, meetings, loading, addTeamMember, removeTeamMember, createMilestone, toggleMilestone, deleteMilestone, createMeeting, deleteMeeting }`

### `useDashboard()`

Four parallel queries:
1. All missions with chef name (for org overview table + active count KPI)
2. Milestones where `done = false` AND `due_date < today` (for late count KPI + upcoming widget)
3. Missions where user is `chef_de_projet` OR user has a row in `mission_team` (for "Mes missions")
4. Distinct profile count in `mission_team` for active missions (for consultants actifs KPI)

Exposes: `{ kpis, myMissions, allMissions, upcomingMilestones, loading }`

---

## 7. Permissions

All roles (Admin, Project Manager, Consultant) can create missions. The creator and the assigned Chef de Projet can edit/delete the mission. Consultants in `mission_team` can add meetings and milestones but cannot edit mission metadata.

The "Modifier" button on MissionDetailPage is shown only when `currentUser.id === mission.created_by || currentUser.id === mission.chef_de_projet`.

---

## 8. SQL Migration

A new migration file `supabase/migrations/002_missions.sql` will create the four tables and their RLS policies.

---

## 9. Out of Scope

- File attachments on meetings or milestones
- Email notifications when milestones are due
- Mission templates
- Gantt chart view
- Django backend (later phase)
