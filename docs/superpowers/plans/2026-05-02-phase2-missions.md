# Phase 2 — Missions & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Mission Management (`/missions`, `/missions/:id`) and Staff Dashboard (`/dashboard`), replacing the current `ComingSoon` stubs.

**Architecture:** Four new Supabase tables (`missions`, `mission_team`, `milestones`, `meetings`) with RLS. Three React hooks (`useMissions`, `useMissionDetail`, `useDashboard`) following the established `useProspectingLists` pattern. Pages use the existing inline-style + CSS-class system (`card`, `btn-ghost`, `btn-ember`, `field`, `avatar`).

**Tech Stack:** React 18, React Router v6, Supabase JS client, Vitest + React Testing Library, existing shared `Icon`/`useAuth`/`useMembers`/`Layout` infrastructure.

---

### Task 1: SQL migration — create missions tables

**Files:**
- Create: `supabase/migrations/002_missions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/002_missions.sql

CREATE TABLE missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  client_name text,
  client_contact_name text,
  client_contact_email text,
  chef_de_projet uuid REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  start_date date,
  end_date date,
  budget numeric,
  created_by uuid NOT NULL REFERENCES profiles(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "missions_select" ON missions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "missions_insert" ON missions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "missions_update" ON missions
  FOR UPDATE TO authenticated USING (
    auth.uid() = created_by
    OR auth.uid() = chef_de_projet
    OR EXISTS (SELECT 1 FROM mission_team WHERE mission_id = id AND profile_id = auth.uid())
  );

CREATE POLICY "missions_delete" ON missions
  FOR DELETE TO authenticated USING (
    auth.uid() = created_by OR auth.uid() = chef_de_projet
  );

-- ─────────────────────────────────────────────

CREATE TABLE mission_team (
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (mission_id, profile_id)
);

ALTER TABLE mission_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mission_team_select" ON mission_team
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "mission_team_modify" ON mission_team
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM missions m WHERE m.id = mission_id
      AND (m.created_by = auth.uid() OR m.chef_de_projet = auth.uid())
    )
  );

-- ─────────────────────────────────────────────

CREATE TABLE milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestones_select" ON milestones
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "milestones_modify" ON milestones
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM missions m WHERE m.id = mission_id AND (
        m.created_by = auth.uid()
        OR m.chef_de_projet = auth.uid()
        OR EXISTS (SELECT 1 FROM mission_team mt WHERE mt.mission_id = m.id AND mt.profile_id = auth.uid())
      )
    )
  );

-- ─────────────────────────────────────────────

CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  title text NOT NULL,
  date date NOT NULL,
  notes text,
  attendees text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_select" ON meetings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "meetings_modify" ON meetings
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM missions m WHERE m.id = mission_id AND (
        m.created_by = auth.uid()
        OR m.chef_de_projet = auth.uid()
        OR EXISTS (SELECT 1 FROM mission_team mt WHERE mt.mission_id = m.id AND mt.profile_id = auth.uid())
      )
    )
  );
```

- [ ] **Step 2: Run migration in Supabase SQL Editor**

Paste and execute `supabase/migrations/002_missions.sql` in the Supabase dashboard SQL Editor. Verify all four tables appear in the Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_missions.sql
git commit -m "feat: add missions, mission_team, milestones, meetings tables with RLS"
```

---

### Task 2: `useMissions` hook + tests

**Files:**
- Create: `frontend/src/features/missions/hooks/useMissions.js`
- Create: `frontend/src/__tests__/missions/useMissions.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/__tests__/missions/useMissions.test.js
import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useMissions } from '../../features/missions/hooks/useMissions'

function makeChain(resolvedValue) {
  const chain = {}
  ;['select', 'order', 'insert', 'update', 'delete', 'match', 'eq', 'single', 'in', 'lt', 'gte', 'limit'].forEach(m => {
    chain[m] = vi.fn(() => chain)
  })
  chain.then = resolve => Promise.resolve(resolvedValue).then(resolve)
  return chain
}

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}))

import { supabase } from '../../shared/lib/supabase'

const mockMissions = [
  { id: 'm1', title: 'Mission test', client_name: 'TOTAL', status: 'active', chef_de_projet: 'user-2', created_by: 'user-1', chef: { prenom: 'Jean', nom: 'Dupont' } },
]

describe('useMissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation(() => makeChain({ data: mockMissions, error: null }))
  })

  it('fetches missions on mount', async () => {
    const { result } = renderHook(() => useMissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.missions).toEqual(mockMissions)
  })

  it('createMission inserts and prepends to list', async () => {
    const newMission = { id: 'm2', title: 'Nouveau', client_name: 'EDF', status: 'draft', created_by: 'user-1', chef: null }
    const { result } = renderHook(() => useMissions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const insertChain = makeChain(null)
    insertChain.insert = vi.fn(() => insertChain)
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn().mockResolvedValue({ data: newMission, error: null })
    supabase.from.mockReturnValue(insertChain)

    await act(async () => {
      await result.current.createMission({ title: 'Nouveau', client_name: 'EDF', status: 'draft' })
    })
    expect(result.current.missions[0].title).toBe('Nouveau')
  })

  it('updateMission updates the mission in the list', async () => {
    const updated = { ...mockMissions[0], title: 'Renommée' }
    const { result } = renderHook(() => useMissions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const updateChain = makeChain(null)
    updateChain.update = vi.fn(() => updateChain)
    updateChain.eq = vi.fn(() => updateChain)
    updateChain.select = vi.fn(() => updateChain)
    updateChain.single = vi.fn().mockResolvedValue({ data: updated, error: null })
    supabase.from.mockReturnValue(updateChain)

    await act(async () => {
      await result.current.updateMission('m1', { title: 'Renommée' })
    })
    expect(result.current.missions[0].title).toBe('Renommée')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --run src/__tests__/missions/useMissions.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useMissions`**

```js
// frontend/src/features/missions/hooks/useMissions.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useMissions() {
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchMissions = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('missions')
      .select('*, chef:profiles!chef_de_projet(prenom, nom)')
      .order('created_at', { ascending: false })
    if (!error) setMissions(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchMissions() }, [fetchMissions])

  async function createMission(fields) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('missions')
      .insert({ ...fields, created_by: user.id })
      .select('*, chef:profiles!chef_de_projet(prenom, nom)')
      .single()
    if (error) throw error
    setMissions(prev => [data, ...prev])
    return data
  }

  async function updateMission(id, fields) {
    const { data, error } = await supabase
      .from('missions')
      .update(fields)
      .eq('id', id)
      .select('*, chef:profiles!chef_de_projet(prenom, nom)')
      .single()
    if (error) throw error
    setMissions(prev => prev.map(m => m.id === id ? data : m))
    return data
  }

  return { missions, loading, createMission, updateMission, refetch: fetchMissions }
}
```

- [ ] **Step 4: Run tests — expect all 3 to pass**

```bash
cd frontend && npm test -- --run src/__tests__/missions/useMissions.test.js
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/missions/hooks/useMissions.js frontend/src/__tests__/missions/useMissions.test.js
git commit -m "feat: add useMissions hook with create/update and tests"
```

---

### Task 3: MissionsPage + MissionForm + wire `/missions` route

**Files:**
- Create: `frontend/src/features/missions/components/MissionForm.jsx`
- Create: `frontend/src/features/missions/pages/MissionsPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create `MissionForm`**

```jsx
// frontend/src/features/missions/components/MissionForm.jsx
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../shared/lib/icons'
import { useMembers } from '../../members/hooks/useMembers'

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'active', label: 'En cours' },
  { value: 'completed', label: 'Terminée' },
  { value: 'archived', label: 'Archivée' },
]

export default function MissionForm({ mission, onClose, onSave }) {
  const { members } = useMembers()
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState({
    title: mission?.title ?? '',
    description: mission?.description ?? '',
    client_name: mission?.client_name ?? '',
    client_contact_name: mission?.client_contact_name ?? '',
    client_contact_email: mission?.client_contact_email ?? '',
    chef_de_projet: mission?.chef_de_projet ?? '',
    status: mission?.status ?? 'draft',
    start_date: mission?.start_date ?? '',
    end_date: mission?.end_date ?? '',
    budget: mission?.budget ?? '',
  })

  function set(key, val) { setFields(prev => ({ ...prev, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fields.title.trim()) return
    setSaving(true)
    try {
      const payload = {
        ...fields,
        chef_de_projet: fields.chef_de_projet || null,
        budget: fields.budget ? Number(fields.budget) : null,
        start_date: fields.start_date || null,
        end_date: fields.end_date || null,
      }
      await onSave(payload)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(26,22,20,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        className="card fade-up"
        style={{ width: 520, maxHeight: '90vh', overflow: 'auto', padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{mission ? 'Modifier la mission' : 'Nouvelle mission'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Titre *</label>
            <input className="field" style={{ marginTop: 4 }} value={fields.title} onChange={e => set('title', e.target.value)} required placeholder="Nom de la mission" />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Description</label>
            <textarea className="field" style={{ marginTop: 4, resize: 'vertical', minHeight: 72 }} value={fields.description} onChange={e => set('description', e.target.value)} placeholder="Objectifs et périmètre…" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Client</label>
              <input className="field" style={{ marginTop: 4 }} value={fields.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Nom de l'entreprise" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Statut</label>
              <select className="field" style={{ marginTop: 4 }} value={fields.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Contact client</label>
              <input className="field" style={{ marginTop: 4 }} value={fields.client_contact_name} onChange={e => set('client_contact_name', e.target.value)} placeholder="Prénom Nom" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Email client</label>
              <input className="field" type="email" style={{ marginTop: 4 }} value={fields.client_contact_email} onChange={e => set('client_contact_email', e.target.value)} placeholder="contact@client.fr" />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Chef de Projet</label>
            <select className="field" style={{ marginTop: 4 }} value={fields.chef_de_projet} onChange={e => set('chef_de_projet', e.target.value)}>
              <option value="">— Non assigné —</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Début</label>
              <input className="field" type="date" style={{ marginTop: 4 }} value={fields.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Fin</label>
              <input className="field" type="date" style={{ marginTop: 4 }} value={fields.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Budget (€)</label>
              <input className="field" type="number" style={{ marginTop: 4 }} value={fields.budget} onChange={e => set('budget', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-ember" disabled={saving || !fields.title.trim()} style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? '…' : mission ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
```

- [ ] **Step 2: Create `MissionsPage`**

```jsx
// frontend/src/features/missions/pages/MissionsPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useMissions } from '../hooks/useMissions'
import MissionForm from '../components/MissionForm'

const STATUS_LABELS = { draft: 'Brouillon', active: 'En cours', completed: 'Terminée', archived: 'Archivée' }
const STATUS_COLORS = {
  draft:     { background: 'var(--paper-2)', color: 'var(--ink-3)' },
  active:    { background: '#dbeafe', color: '#1d4ed8' },
  completed: { background: '#dcfce7', color: '#15803d' },
  archived:  { background: 'var(--paper-2)', color: 'var(--ink-4)' },
}

function StatusBadge({ status }) {
  const style = STATUS_COLORS[status] ?? STATUS_COLORS.draft
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: '.04em', ...style }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export { StatusBadge }

export default function MissionsPage() {
  const { missions, loading, createMission } = useMissions()
  const [showForm, setShowForm] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="px-8 py-6 fade-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 className="page-title">Missions</h1>
        <button className="btn-ember flex items-center gap-1.5" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={14} /> Nouvelle mission
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : missions.length === 0 ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--ink-3)' }}>
          Aucune mission pour le moment.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Titre', 'Client', 'Chef de Projet', 'Statut', 'Fin'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missions.map(m => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/missions/${m.id}`)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500 }}>{m.title}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)' }}>{m.client_name || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)' }}>{m.chef ? `${m.chef.prenom} ${m.chef.nom}` : '—'}</td>
                  <td style={{ padding: '12px 16px' }}><StatusBadge status={m.status} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)' }}>{m.end_date ? new Date(m.end_date).toLocaleDateString('fr-FR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <MissionForm
          onClose={() => setShowForm(false)}
          onSave={createMission}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire the `/missions` route in `App.jsx`**

Add import at the top with the other imports:
```jsx
import MissionsPage from './features/missions/pages/MissionsPage'
```

Replace:
```jsx
<Route path="/missions" element={<Protected><ComingSoon title="Missions" /></Protected>} />
```
With:
```jsx
<Route path="/missions" element={<Protected><MissionsPage /></Protected>} />
```

- [ ] **Step 4: Start dev server and verify manually**

```bash
cd frontend && npm start
```

Navigate to `/missions`. Expect: empty-state card. Click "Nouvelle mission" → form opens with all fields. Fill in title + client, submit → mission appears in table. Click the row → 404 (detail page not yet built — expected).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/missions/ frontend/src/App.jsx
git commit -m "feat: MissionsPage with create form and status badges"
```

---

### Task 4: `useMissionDetail` hook + tests

**Files:**
- Create: `frontend/src/features/missions/hooks/useMissionDetail.js`
- Create: `frontend/src/__tests__/missions/useMissionDetail.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/__tests__/missions/useMissionDetail.test.js
import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useMissionDetail } from '../../features/missions/hooks/useMissionDetail'

function makeChain(resolvedValue) {
  const chain = {}
  ;['select', 'order', 'insert', 'update', 'delete', 'match', 'eq', 'single', 'in', 'lt', 'gte', 'limit'].forEach(m => {
    chain[m] = vi.fn(() => chain)
  })
  chain.then = resolve => Promise.resolve(resolvedValue).then(resolve)
  return chain
}

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}))

import { supabase } from '../../shared/lib/supabase'

const mockMission = { id: 'm1', title: 'Mission test', client_name: 'TOTAL', status: 'active', chef_de_projet: 'user-2', created_by: 'user-1' }

describe('useMissionDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation(table => {
      if (table === 'missions') return makeChain({ data: mockMission, error: null })
      if (table === 'mission_team') return makeChain({ data: [], error: null })
      if (table === 'milestones') return makeChain({ data: [], error: null })
      if (table === 'meetings') return makeChain({ data: [], error: null })
      return makeChain({ data: [], error: null })
    })
  })

  it('fetches all data on mount', async () => {
    const { result } = renderHook(() => useMissionDetail('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mission.title).toBe('Mission test')
    expect(result.current.team).toEqual([])
    expect(result.current.milestones).toEqual([])
    expect(result.current.meetings).toEqual([])
  })

  it('createMilestone inserts and adds to list', async () => {
    const newMilestone = { id: 'ms1', mission_id: 'm1', title: 'Livrable', due_date: '2026-06-01', done: false, created_at: '2026-05-02' }
    const { result } = renderHook(() => useMissionDetail('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const insertChain = makeChain(null)
    insertChain.insert = vi.fn(() => insertChain)
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn().mockResolvedValue({ data: newMilestone, error: null })
    supabase.from.mockReturnValue(insertChain)

    await act(async () => {
      await result.current.createMilestone('Livrable', '2026-06-01')
    })
    expect(result.current.milestones[0].title).toBe('Livrable')
  })

  it('toggleMilestone updates done state', async () => {
    const initialMilestone = { id: 'ms1', mission_id: 'm1', title: 'Livrable', due_date: '2026-06-01', done: false, created_at: '2026-05-02' }
    supabase.from.mockImplementation(table => {
      if (table === 'missions') return makeChain({ data: mockMission, error: null })
      if (table === 'milestones') return makeChain({ data: [initialMilestone], error: null })
      return makeChain({ data: [], error: null })
    })

    const { result } = renderHook(() => useMissionDetail('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const updateChain = makeChain({ error: null })
    updateChain.update = vi.fn(() => updateChain)
    updateChain.eq = vi.fn(() => updateChain)
    supabase.from.mockReturnValue(updateChain)

    await act(async () => {
      await result.current.toggleMilestone('ms1', true)
    })
    expect(result.current.milestones[0].done).toBe(true)
  })

  it('createMeeting inserts and prepends to list', async () => {
    const newMeeting = { id: 'mt1', mission_id: 'm1', title: 'Kick-off', date: '2026-05-10', notes: '', attendees: [], created_at: '2026-05-02' }
    const { result } = renderHook(() => useMissionDetail('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const insertChain = makeChain(null)
    insertChain.insert = vi.fn(() => insertChain)
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn().mockResolvedValue({ data: newMeeting, error: null })
    supabase.from.mockReturnValue(insertChain)

    await act(async () => {
      await result.current.createMeeting({ title: 'Kick-off', date: '2026-05-10', notes: '', attendees: [] })
    })
    expect(result.current.meetings[0].title).toBe('Kick-off')
  })

  it('updateMission updates the mission state', async () => {
    const updated = { ...mockMission, title: 'Renommée', chef: null }
    const { result } = renderHook(() => useMissionDetail('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const updateChain = makeChain(null)
    updateChain.update = vi.fn(() => updateChain)
    updateChain.eq = vi.fn(() => updateChain)
    updateChain.select = vi.fn(() => updateChain)
    updateChain.single = vi.fn().mockResolvedValue({ data: updated, error: null })
    supabase.from.mockReturnValue(updateChain)

    await act(async () => {
      await result.current.updateMission({ title: 'Renommée' })
    })
    expect(result.current.mission.title).toBe('Renommée')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --run src/__tests__/missions/useMissionDetail.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useMissionDetail`**

```js
// frontend/src/features/missions/hooks/useMissionDetail.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useMissionDetail(id) {
  const [mission, setMission] = useState(null)
  const [team, setTeam] = useState([])
  const [milestones, setMilestones] = useState([])
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [mRes, tRes, mlRes, meRes] = await Promise.all([
      supabase.from('missions').select('*, chef:profiles!chef_de_projet(prenom, nom)').eq('id', id).single(),
      supabase.from('mission_team').select('profile_id, member:profiles!profile_id(prenom, nom, role)').eq('mission_id', id),
      supabase.from('milestones').select('*').eq('mission_id', id).order('due_date'),
      supabase.from('meetings').select('*').eq('mission_id', id).order('date', { ascending: false }),
    ])
    setMission(mRes.data ?? null)
    setTeam((tRes.data ?? []).map(r => ({ id: r.profile_id, ...r.member })))
    setMilestones(mlRes.data ?? [])
    setMeetings(meRes.data ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function addTeamMember(profileId) {
    const { error } = await supabase.from('mission_team').insert({ mission_id: id, profile_id: profileId })
    if (error) throw error
    await fetchAll()
  }

  async function removeTeamMember(profileId) {
    const { error } = await supabase.from('mission_team').delete().match({ mission_id: id, profile_id: profileId })
    if (error) throw error
    setTeam(prev => prev.filter(m => m.id !== profileId))
  }

  async function createMilestone(title, dueDate) {
    const { data, error } = await supabase
      .from('milestones')
      .insert({ mission_id: id, title, due_date: dueDate || null })
      .select()
      .single()
    if (error) throw error
    setMilestones(prev => [...prev, data].sort((a, b) => (a.due_date ?? '9999') > (b.due_date ?? '9999') ? 1 : -1))
    return data
  }

  async function toggleMilestone(milestoneId, done) {
    const { error } = await supabase.from('milestones').update({ done }).eq('id', milestoneId)
    if (error) throw error
    setMilestones(prev => prev.map(m => m.id === milestoneId ? { ...m, done } : m))
  }

  async function deleteMilestone(milestoneId) {
    const { error } = await supabase.from('milestones').delete().eq('id', milestoneId)
    if (error) throw error
    setMilestones(prev => prev.filter(m => m.id !== milestoneId))
  }

  async function createMeeting(fields) {
    const { data, error } = await supabase
      .from('meetings')
      .insert({ ...fields, mission_id: id })
      .select()
      .single()
    if (error) throw error
    setMeetings(prev => [data, ...prev])
    return data
  }

  async function deleteMeeting(meetingId) {
    const { error } = await supabase.from('meetings').delete().eq('id', meetingId)
    if (error) throw error
    setMeetings(prev => prev.filter(m => m.id !== meetingId))
  }

  async function updateMission(fields) {
    const { data, error } = await supabase
      .from('missions')
      .update(fields)
      .eq('id', id)
      .select('*, chef:profiles!chef_de_projet(prenom, nom)')
      .single()
    if (error) throw error
    setMission(data)
    return data
  }

  return {
    mission, team, milestones, meetings, loading,
    updateMission,
    addTeamMember, removeTeamMember,
    createMilestone, toggleMilestone, deleteMilestone,
    createMeeting, deleteMeeting,
    refetch: fetchAll,
  }
}
```

- [ ] **Step 4: Run tests — expect all 5 to pass**

```bash
cd frontend && npm test -- --run src/__tests__/missions/useMissionDetail.test.js
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/missions/hooks/useMissionDetail.js frontend/src/__tests__/missions/useMissionDetail.test.js
git commit -m "feat: add useMissionDetail hook with milestones, meetings, team and tests"
```

---

### Task 5: MissionDetailPage + tab components + `/missions/:id` route

**Files:**
- Create: `frontend/src/features/missions/components/MilestoneList.jsx`
- Create: `frontend/src/features/missions/components/MeetingLog.jsx`
- Create: `frontend/src/features/missions/components/TeamPanel.jsx`
- Create: `frontend/src/features/missions/pages/MissionDetailPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create `MilestoneList`**

```jsx
// frontend/src/features/missions/components/MilestoneList.jsx
import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'

export default function MilestoneList({ milestones, onToggle, onDelete, onCreate }) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const today = new Date().toISOString().split('T')[0]

  async function handleAdd(e) {
    e.preventDefault()
    if (!title.trim()) return
    await onCreate(title.trim(), dueDate || null)
    setTitle('')
    setDueDate('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {milestones.length === 0 && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucun jalon pour le moment.</div>
      )}
      {milestones.map(ms => {
        const overdue = !ms.done && ms.due_date && ms.due_date < today
        return (
          <div key={ms.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
            <input
              type="checkbox"
              checked={ms.done}
              onChange={e => onToggle(ms.id, e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ flex: 1, fontSize: 14, color: ms.done ? 'var(--ink-4)' : 'var(--ink)', textDecoration: ms.done ? 'line-through' : 'none' }}>
              {ms.title}
            </span>
            {ms.due_date && (
              <span style={{ fontSize: 12, color: overdue ? '#dc2626' : 'var(--ink-3)', fontWeight: overdue ? 600 : 400 }}>
                {new Date(ms.due_date + 'T00:00:00').toLocaleDateString('fr-FR')}
                {overdue && ' ⚠'}
              </span>
            )}
            <button
              onClick={() => onDelete(ms.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 4, flexShrink: 0 }}
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        )
      })}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          className="field"
          style={{ flex: 1, fontSize: 13 }}
          placeholder="Nouveau jalon…"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <input
          className="field"
          type="date"
          style={{ width: 150, fontSize: 13 }}
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
        />
        <button type="submit" className="btn-ghost flex items-center gap-1.5" disabled={!title.trim()}>
          <Icon name="plus" size={13} /> Ajouter
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Create `MeetingLog`**

```jsx
// frontend/src/features/missions/components/MeetingLog.jsx
import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'

export default function MeetingLog({ meetings, onDelete, onCreate }) {
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState({ title: '', date: '', notes: '', attendees: '' })
  const [saving, setSaving] = useState(false)

  function set(key, val) { setFields(prev => ({ ...prev, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fields.title.trim() || !fields.date) return
    setSaving(true)
    try {
      await onCreate({
        title: fields.title.trim(),
        date: fields.date,
        notes: fields.notes.trim(),
        attendees: fields.attendees ? fields.attendees.split(',').map(s => s.trim()).filter(Boolean) : [],
      })
      setFields({ title: '', date: '', notes: '', attendees: '' })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {meetings.length === 0 && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucune réunion enregistrée.</div>
      )}
      {meetings.map(mt => (
        <div key={mt.id} className="card" style={{ padding: 16, position: 'relative' }}>
          <button
            onClick={() => onDelete(mt.id)}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)' }}
          >
            <Icon name="trash" size={13} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Icon name="calendar" size={14} style={{ color: 'var(--ink-3)' }} />
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {new Date(mt.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: mt.notes ? 8 : 0 }}>{mt.title}</div>
          {mt.notes && <div style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{mt.notes}</div>}
          {mt.attendees?.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
              Participants : {mt.attendees.join(', ')}
            </div>
          )}
        </div>
      ))}

      {!open ? (
        <button className="btn-ghost flex items-center gap-1.5" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
          <Icon name="plus" size={13} /> Ajouter une réunion
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Titre *</label>
              <input className="field" style={{ marginTop: 4, fontSize: 13 }} value={fields.title} onChange={e => set('title', e.target.value)} placeholder="Réunion de suivi" required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Date *</label>
              <input className="field" type="date" style={{ marginTop: 4, fontSize: 13 }} value={fields.date} onChange={e => set('date', e.target.value)} required />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Notes</label>
            <textarea className="field" style={{ marginTop: 4, fontSize: 13, resize: 'vertical', minHeight: 64 }} value={fields.notes} onChange={e => set('notes', e.target.value)} placeholder="Points abordés…" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Participants (séparés par virgule)</label>
            <input className="field" style={{ marginTop: 4, fontSize: 13 }} value={fields.attendees} onChange={e => set('attendees', e.target.value)} placeholder="Jean Dupont, Marie Martin" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
            <button type="submit" className="btn-ember" disabled={saving || !fields.title.trim() || !fields.date} style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? '…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `TeamPanel`**

```jsx
// frontend/src/features/missions/components/TeamPanel.jsx
import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { useMembers } from '../../members/hooks/useMembers'

const ROLE_LABELS = { admin: 'Admin', project_manager: 'Chef de Projet', consultant: 'Consultant' }

function MemberAvatar({ member, size = 32 }) {
  const initials = `${member.prenom?.[0] ?? ''}${member.nom?.[0] ?? ''}`.toUpperCase() || '?'
  const hue = (member.id ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <span className="avatar" style={{
      width: size, height: size,
      background: `oklch(0.88 0.06 ${hue})`,
      color: `oklch(0.32 0.10 ${hue})`,
      fontSize: Math.max(10, size * 0.38),
      border: '1px solid var(--line)',
      flexShrink: 0,
    }}>
      {initials}
    </span>
  )
}

export default function TeamPanel({ team, onAdd, onRemove, currentUserId, missionCreatedBy, chefDeProjet }) {
  const { members } = useMembers()
  const [query, setQuery] = useState('')
  const canManage = currentUserId === missionCreatedBy || currentUserId === chefDeProjet
  const teamIds = new Set(team.map(m => m.id))
  const filtered = members.filter(m => {
    if (teamIds.has(m.id)) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return `${m.prenom} ${m.nom}`.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {team.length === 0 && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucun consultant assigné.</div>
      )}
      {team.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
          <MemberAvatar member={m} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{m.prenom} {m.nom}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{ROLE_LABELS[m.role] ?? m.role}</div>
          </div>
          {canManage && (
            <button onClick={() => onRemove(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 4 }}>
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      ))}

      {canManage && (
        <div style={{ marginTop: 8 }}>
          <input
            className="field"
            style={{ fontSize: 13, marginBottom: 8 }}
            placeholder="Rechercher un membre…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query.trim() && filtered.map(m => (
            <button
              key={m.id}
              className="btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', fontSize: 13, marginBottom: 4 }}
              onClick={() => { onAdd(m.id); setQuery('') }}
            >
              <MemberAvatar member={m} size={24} />
              <span style={{ marginLeft: 8 }}>{m.prenom} {m.nom}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `MissionDetailPage`**

```jsx
// frontend/src/features/missions/pages/MissionDetailPage.jsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useAuth } from '../../auth/hooks/useAuth'
import { useMissionDetail } from '../hooks/useMissionDetail'
import { StatusBadge } from './MissionsPage'
import MissionForm from '../components/MissionForm'
import MilestoneList from '../components/MilestoneList'
import MeetingLog from '../components/MeetingLog'
import TeamPanel from '../components/TeamPanel'

const TABS = [
  { id: 'overview', label: 'Aperçu' },
  { id: 'team', label: 'Équipe' },
  { id: 'milestones', label: 'Jalons' },
  { id: 'meetings', label: 'Réunions' },
]

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-4)' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{value || '—'}</div>
    </div>
  )
}

export default function MissionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { mission, team, milestones, meetings, loading, updateMission, addTeamMember, removeTeamMember, createMilestone, toggleMilestone, deleteMilestone, createMeeting, deleteMeeting } = useMissionDetail(id)
  const [activeTab, setActiveTab] = useState('overview')
  const [showEdit, setShowEdit] = useState(false)

  if (loading) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
  if (!mission) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Mission introuvable.</div>

  const canEdit = user && (user.id === mission.created_by || user.id === mission.chef_de_projet)

  return (
    <div className="px-8 py-6 fade-up">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button className="btn-ghost flex items-center gap-1.5" style={{ marginBottom: 12, fontSize: 13 }} onClick={() => navigate('/missions')}>
          <Icon name="arrowL" size={13} /> Missions
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{mission.title}</h1>
            {mission.client_name && <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>{mission.client_name}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StatusBadge status={mission.status} />
            {canEdit && (
              <button className="btn-ghost flex items-center gap-1.5" onClick={() => setShowEdit(true)}>
                <Icon name="edit" size={13} /> Modifier
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 24 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--ink)' : 'var(--ink-3)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--ink)' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 640 }}>
          <Field label="Description" value={mission.description} />
          <Field label="Statut" value={({ draft: 'Brouillon', active: 'En cours', completed: 'Terminée', archived: 'Archivée' })[mission.status]} />
          <Field label="Client" value={mission.client_name} />
          <Field label="Contact client" value={mission.client_contact_name} />
          <Field label="Email client" value={mission.client_contact_email} />
          <Field label="Budget" value={mission.budget ? `${Number(mission.budget).toLocaleString('fr-FR')} €` : null} />
          <Field label="Début" value={mission.start_date ? new Date(mission.start_date + 'T00:00:00').toLocaleDateString('fr-FR') : null} />
          <Field label="Fin" value={mission.end_date ? new Date(mission.end_date + 'T00:00:00').toLocaleDateString('fr-FR') : null} />
          <Field label="Chef de Projet" value={mission.chef ? `${mission.chef.prenom} ${mission.chef.nom}` : null} />
        </div>
      )}

      {activeTab === 'team' && (
        <TeamPanel
          team={team}
          onAdd={addTeamMember}
          onRemove={removeTeamMember}
          currentUserId={user?.id}
          missionCreatedBy={mission.created_by}
          chefDeProjet={mission.chef_de_projet}
        />
      )}

      {activeTab === 'milestones' && (
        <MilestoneList
          milestones={milestones}
          onToggle={toggleMilestone}
          onDelete={deleteMilestone}
          onCreate={createMilestone}
        />
      )}

      {activeTab === 'meetings' && (
        <MeetingLog
          meetings={meetings}
          onDelete={deleteMeeting}
          onCreate={createMeeting}
        />
      )}

      {showEdit && (
        <MissionForm
          mission={mission}
          onClose={() => setShowEdit(false)}
          onSave={updateMission}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Wire `/missions/:id` route in `App.jsx`**

Add import:
```jsx
import MissionDetailPage from './features/missions/pages/MissionDetailPage'
```

Add route after the `/missions` route:
```jsx
<Route path="/missions/:id" element={<Protected><MissionDetailPage /></Protected>} />
```

- [ ] **Step 6: Verify manually**

Start the dev server. Create a mission on `/missions`, click it → detail page loads with all tabs. Test each tab: Aperçu shows fields, Équipe shows add member search, Jalons can add/check/delete milestones, Réunions can add/delete meetings. Click "Modifier" → form pre-filled, save updates the header.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/missions/ frontend/src/App.jsx
git commit -m "feat: MissionDetailPage with tabbed overview, team, milestones, and meetings"
```

---

### Task 6: `useDashboard` hook + tests

**Files:**
- Create: `frontend/src/features/dashboard/hooks/useDashboard.js`
- Create: `frontend/src/__tests__/dashboard/useDashboard.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/__tests__/dashboard/useDashboard.test.js
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useDashboard } from '../../features/dashboard/hooks/useDashboard'

function makeChain(resolvedValue) {
  const chain = {}
  ;['select', 'order', 'insert', 'update', 'delete', 'match', 'eq', 'single', 'in', 'lt', 'gte', 'limit'].forEach(m => {
    chain[m] = vi.fn(() => chain)
  })
  chain.then = resolve => Promise.resolve(resolvedValue).then(resolve)
  return chain
}

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}))

import { supabase } from '../../shared/lib/supabase'

const mockMissions = [
  { id: 'm1', title: 'Mission A', status: 'active', chef_de_projet: 'user-1', created_by: 'user-1', chef: { prenom: 'Moi', nom: 'Test' } },
  { id: 'm2', title: 'Mission B', status: 'draft', chef_de_projet: 'user-2', created_by: 'user-2', chef: null },
]

describe('useDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation(table => {
      if (table === 'missions') return makeChain({ data: mockMissions, error: null })
      if (table === 'milestones') return makeChain({ data: [], error: null })
      if (table === 'mission_team') return makeChain({ data: [], error: null })
      return makeChain({ data: [], error: null })
    })
  })

  it('loading becomes false after fetch', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('allMissions is populated', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.allMissions).toEqual(mockMissions)
  })

  it('kpis.activeMissions counts only active status', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.kpis.activeMissions).toBe(1)
  })

  it('myMissions includes missions where user is chef_de_projet', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myMissions.some(m => m.id === 'm1')).toBe(true)
    expect(result.current.myMissions.some(m => m.id === 'm2')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --run src/__tests__/dashboard/useDashboard.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useDashboard`**

```js
// frontend/src/features/dashboard/hooks/useDashboard.js
import { useState, useEffect } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useDashboard() {
  const [kpis, setKpis] = useState({ activeMissions: 0, lateMilestones: 0, activeConsultants: 0 })
  const [myMissions, setMyMissions] = useState([])
  const [allMissions, setAllMissions] = useState([])
  const [upcomingMilestones, setUpcomingMilestones] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      const today = new Date().toISOString().split('T')[0]

      const [allRes, lateRes, upcomingRes, myTeamRes, allTeamRes] = await Promise.all([
        supabase.from('missions')
          .select('*, chef:profiles!chef_de_projet(prenom, nom)')
          .order('created_at', { ascending: false }),
        supabase.from('milestones')
          .select('*')
          .eq('done', false)
          .lt('due_date', today),
        supabase.from('milestones')
          .select('*, mission:missions(title)')
          .eq('done', false)
          .gte('due_date', today)
          .order('due_date')
          .limit(5),
        supabase.from('mission_team')
          .select('mission_id')
          .eq('profile_id', user.id),
        supabase.from('mission_team')
          .select('mission_id, profile_id'),
      ])

      const all = allRes.data ?? []
      const activeMissionIds = new Set(all.filter(m => m.status === 'active').map(m => m.id))
      const myMissionIds = new Set((myTeamRes.data ?? []).map(r => r.mission_id))
      const activeConsultants = new Set(
        (allTeamRes.data ?? []).filter(r => activeMissionIds.has(r.mission_id)).map(r => r.profile_id)
      ).size

      setAllMissions(all)
      setMyMissions(all.filter(m => m.chef_de_projet === user.id || myMissionIds.has(m.id)))
      setUpcomingMilestones(upcomingRes.data ?? [])
      setKpis({
        activeMissions: activeMissionIds.size,
        lateMilestones: (lateRes.data ?? []).length,
        activeConsultants,
      })
      setLoading(false)
    }
    fetchAll()
  }, [])

  return { kpis, myMissions, allMissions, upcomingMilestones, loading }
}
```

- [ ] **Step 4: Run tests — expect all 4 to pass**

```bash
cd frontend && npm test -- --run src/__tests__/dashboard/useDashboard.test.js
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/dashboard/hooks/useDashboard.js frontend/src/__tests__/dashboard/useDashboard.test.js
git commit -m "feat: add useDashboard hook with KPIs, my missions, upcoming milestones and tests"
```

---

### Task 7: DashboardPage + wire `/dashboard` route

**Files:**
- Create: `frontend/src/features/dashboard/pages/DashboardPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create `DashboardPage`**

```jsx
// frontend/src/features/dashboard/pages/DashboardPage.jsx
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useDashboard } from '../hooks/useDashboard'
import { StatusBadge } from '../../missions/pages/MissionsPage'

function KpiCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '20px 24px', textAlign: 'center', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function MissionCard({ mission, onClick }) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{ padding: 16, cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{mission.title}</div>
        <StatusBadge status={mission.status} />
      </div>
      {mission.client_name && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{mission.client_name}</div>}
    </div>
  )
}

function CompactMissionsTable({ missions, onNavigate }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--line)' }}>
          {['Titre', 'Client', 'Statut'].map(h => (
            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {missions.map(m => (
          <tr
            key={m.id}
            onClick={() => onNavigate(m.id)}
            style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            <td style={{ padding: '10px 12px', fontWeight: 500 }}>{m.title}</td>
            <td style={{ padding: '10px 12px', color: 'var(--ink-2)' }}>{m.client_name || '—'}</td>
            <td style={{ padding: '10px 12px' }}><StatusBadge status={m.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function DashboardPage() {
  const { kpis, myMissions, allMissions, upcomingMilestones, loading } = useDashboard()
  const navigate = useNavigate()

  if (loading) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>

  return (
    <div className="px-8 py-6 fade-up">
      <h1 className="page-title" style={{ marginBottom: 24 }}>Tableau de bord</h1>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        <KpiCard label="Missions actives" value={kpis.activeMissions} color="#1d4ed8" />
        <KpiCard label="Jalons en retard" value={kpis.lateMilestones} color={kpis.lateMilestones > 0 ? '#dc2626' : '#15803d'} />
        <KpiCard label="Consultants actifs" value={kpis.activeConsultants} color="#7c3aed" />
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 24, alignItems: 'start' }}>

        {/* Left: Mes missions */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="briefcase" size={15} /> Mes missions
          </h2>
          {myMissions.length === 0 ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Vous n'êtes assigné à aucune mission.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myMissions.map(m => (
                <MissionCard key={m.id} mission={m} onClick={() => navigate(`/missions/${m.id}`)} />
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* All missions table */}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="list" size={15} /> Toutes les missions
            </h2>
            {allMissions.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Aucune mission enregistrée.</div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <CompactMissionsTable missions={allMissions} onNavigate={id => navigate(`/missions/${id}`)} />
              </div>
            )}
          </div>

          {/* Upcoming milestones */}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="calendar" size={15} /> Prochains jalons
            </h2>
            {upcomingMilestones.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Aucun jalon à venir.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {upcomingMilestones.map(ms => (
                  <div key={ms.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{ms.title}</div>
                      {ms.mission && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{ms.mission.title}</div>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)', flexShrink: 0 }}>
                      {new Date(ms.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire `/dashboard` route in `App.jsx`**

Add import:
```jsx
import DashboardPage from './features/dashboard/pages/DashboardPage'
```

Replace:
```jsx
<Route path="/dashboard" element={<Protected><ComingSoon title="Tableau de bord" /></Protected>} />
```
With:
```jsx
<Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
```

- [ ] **Step 3: Verify manually**

Navigate to `/dashboard`. Expect: KPI row with 3 cards, two-column layout below. Create some missions + milestones on `/missions` then return — KPIs update on reload. Clicking any mission row or card navigates to the detail page.

- [ ] **Step 4: Run all tests**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass (existing 18 + new 12 = 30 total).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/dashboard/ frontend/src/App.jsx
git commit -m "feat: DashboardPage with KPI cards, my missions, all missions table, upcoming milestones"
```
