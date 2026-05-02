# Annuaire Improvements & New Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side pagination, fix broken bulk actions, implement list sharing, add clickable profiles in list view, and build a Members page.

**Architecture:** All data access is through the Supabase JS client (PostgREST). DB migrations run first in the Supabase SQL editor. Frontend changes follow a hook-first pattern: update the hook, then wire up the UI. No custom backend.

**Tech Stack:** React 18, Vite, TailwindCSS, Supabase JS client, Vitest + React Testing Library

**Root paths:**
- Frontend: `jump-oracle/.worktrees/phase1-build/frontend/src/`
- DB schema: `jump-oracle/.worktrees/phase1-build/supabase/schema.sql`
- Dev server: `cd jump-oracle/.worktrees/phase1-build/frontend && npm run dev`
- Tests: `cd jump-oracle/.worktrees/phase1-build/frontend && npm test`

---

## Task 1: Database Migrations

**Files:**
- Create: `jump-oracle/.worktrees/phase1-build/supabase/migrations/001_improvements.sql`
- Modify: `jump-oracle/.worktrees/phase1-build/supabase/schema.sql` (append new sections at bottom)

> Run the SQL in the Supabase SQL editor (Dashboard → SQL Editor). The `.sql` file serves as a record of what was applied.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/001_improvements.sql` with this exact content:

```sql
-- ── 1. Tags column on contacts ────────────────────────────────────────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- ── 2. Email column on profiles ───────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill email for existing members
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Update the sign-up trigger to capture email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email) VALUES (new.id, new.email);
  RETURN new;
END;
$$;

-- ── 3. list_shares table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS list_shares (
  list_id     UUID REFERENCES prospecting_lists(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by   UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (list_id, shared_with)
);

ALTER TABLE list_shares ENABLE ROW LEVEL SECURITY;

-- Owner can manage their shares
CREATE POLICY "list_shares: owner manage"
  ON list_shares FOR ALL
  USING (shared_by = auth.uid())
  WITH CHECK (shared_by = auth.uid());

-- Recipient can read shares addressed to them
CREATE POLICY "list_shares: recipient read"
  ON list_shares FOR SELECT
  USING (shared_with = auth.uid());

-- ── 4. Allow all authenticated users to read all profiles ─────────────
-- (needed for member search in share modal and for Members page)
CREATE POLICY "profiles: authenticated read all"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- ── 5. RPC: bulk-add a tag to multiple contacts (idempotent) ──────────
CREATE OR REPLACE FUNCTION add_tag_to_contacts(contact_ids UUID[], tag_name TEXT)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE contacts
  SET tags = array_append(tags, tag_name)
  WHERE id = ANY(contact_ids)
    AND NOT (tag_name = ANY(COALESCE(tags, '{}')));
$$;

-- ── 6. RPC: remove a tag from a single contact ────────────────────────
CREATE OR REPLACE FUNCTION remove_tag_from_contact(contact_id UUID, tag_name TEXT)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE contacts
  SET tags = array_remove(tags, tag_name)
  WHERE id = contact_id;
$$;
```

- [ ] **Step 2: Run the SQL in Supabase SQL editor**

Open the Supabase dashboard → SQL Editor → paste the content of `001_improvements.sql` → Run. Verify no errors.

- [ ] **Step 3: Append new sections to schema.sql**

At the bottom of `supabase/schema.sql`, append:

```sql
-- ── Additions (2026-05-02) ────────────────────────────────────────────

-- tags on contacts
-- ALTER TABLE contacts ADD COLUMN tags text[] DEFAULT '{}';

-- email on profiles
-- ALTER TABLE profiles ADD COLUMN email text;

-- list_shares
create table if not exists list_shares (
  list_id     uuid references prospecting_lists(id) on delete cascade,
  shared_with uuid references profiles(id) on delete cascade,
  shared_by   uuid references profiles(id),
  created_at  timestamptz default now(),
  primary key (list_id, shared_with)
);

-- RPCs: add_tag_to_contacts, remove_tag_from_contact
-- (see migrations/001_improvements.sql for full definitions)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: db migrations — tags, email on profiles, list_shares, tag RPCs"
```

---

## Task 2: Update useContacts Hook

**Files:**
- Modify: `frontend/src/features/directory/hooks/useContacts.js`
- Create: `frontend/src/__tests__/useContacts.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/useContacts.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useContacts } from '../features/directory/hooks/useContacts'

// Build a chainable Supabase mock that resolves at the end
function makeChain(resolvedValue) {
  const chain = {}
  const methods = ['select', 'order', 'range', 'or', 'ilike', 'eq', 'neq']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = (resolve) => Promise.resolve(resolvedValue).then(resolve)
  return chain
}

vi.mock('../shared/lib/supabase', () => {
  const chain = makeChain({ data: [], count: 0, error: null })
  return { supabase: { from: vi.fn(() => chain), rpc: vi.fn(() => Promise.resolve({ error: null })) } }
})

import { supabase } from '../shared/lib/supabase'

describe('useContacts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls .range() with correct offsets for page 2', async () => {
    const chain = makeChain({ data: [], count: 50, error: null })
    supabase.from.mockReturnValue(chain)
    renderHook(() => useContacts({ page: 2, pageSize: 50, query: '' }))
    await waitFor(() => expect(chain.range).toHaveBeenCalledWith(50, 99))
  })

  it('applies ilike filter when query is provided', async () => {
    const chain = makeChain({ data: [], count: 0, error: null })
    supabase.from.mockReturnValue(chain)
    renderHook(() => useContacts({ page: 1, pageSize: 50, query: 'dupont' }))
    await waitFor(() => expect(chain.or).toHaveBeenCalledWith(
      'nom.ilike.%dupont%,prenom.ilike.%dupont%,entreprise_actuelle.ilike.%dupont%,ville.ilike.%dupont%'
    ))
  })

  it('returns total from count', async () => {
    const chain = makeChain({ data: [{ id: '1', nom: 'Test', prenom: 'A', tags: [] }], count: 1234, error: null })
    supabase.from.mockReturnValue(chain)
    const { result } = renderHook(() => useContacts({ page: 1, pageSize: 50, query: '' }))
    await waitFor(() => expect(result.current.total).toBe(1234))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd jump-oracle/.worktrees/phase1-build/frontend
npm test -- --reporter=verbose useContacts
```

Expected: FAIL — `useContacts` does not accept params yet.

- [ ] **Step 3: Rewrite useContacts.js**

Replace the entire content of `frontend/src/features/directory/hooks/useContacts.js`:

```js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useContacts({ page = 1, pageSize = 50, query = '' } = {}) {
  const [contacts, setContacts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let q = supabase.from('contacts').select('*', { count: 'exact' }).order('nom')

    if (query.trim()) {
      const s = query.trim()
      q = q.or(
        `nom.ilike.%${s}%,prenom.ilike.%${s}%,entreprise_actuelle.ilike.%${s}%,ville.ilike.%${s}%`
      )
    }

    q = q.range(from, to)

    const { data, count, error: err } = await q
    if (err) setError(err.message)
    else {
      setContacts(data ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [page, pageSize, query])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  async function createContact(contactData) {
    const { data, error: err } = await supabase
      .from('contacts')
      .insert(contactData)
      .select()
      .single()
    if (err) throw err
    return data
  }

  async function updateTags(contactIds, tagName) {
    const { error: err } = await supabase.rpc('add_tag_to_contacts', {
      contact_ids: contactIds,
      tag_name: tagName,
    })
    if (err) throw err
    await fetchContacts()
  }

  async function removeTag(contactId, tagName) {
    const { error: err } = await supabase.rpc('remove_tag_from_contact', {
      contact_id: contactId,
      tag_name: tagName,
    })
    if (err) throw err
    setContacts(prev =>
      prev.map(c => c.id === contactId
        ? { ...c, tags: (c.tags ?? []).filter(t => t !== tagName) }
        : c
      )
    )
  }

  return { contacts, total, loading, error, createContact, updateTags, removeTag, refetch: fetchContacts }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose useContacts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/directory/hooks/useContacts.js frontend/src/__tests__/useContacts.test.js
git commit -m "feat: server-side pagination + tag RPCs in useContacts"
```

---

## Task 3: Update useProspectingLists — Batch Add + Share

**Files:**
- Modify: `frontend/src/features/directory/hooks/useProspectingLists.js`
- Create: `frontend/src/__tests__/useProspectingLists.test.js`

> **Must complete before Task 4** — DirectoryPage's bulk handlers call `addContactsToList` and `shareList` from this hook.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/__tests__/useProspectingLists.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProspectingLists } from '../features/directory/hooks/useProspectingLists'

vi.mock('../shared/lib/supabase', () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
  }
  return {
    supabase: {
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    },
  }
})

import { supabase } from '../shared/lib/supabase'

describe('useProspectingLists', () => {
  beforeEach(() => vi.clearAllMocks())

  it('addContactsToList calls upsert with correct rows', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    }
    supabase.from.mockReturnValue(mockChain)

    await act(async () => {
      await result.current.addContactsToList('list-1', ['c-1', 'c-2'])
    })

    expect(mockChain.upsert).toHaveBeenCalledWith(
      [{ list_id: 'list-1', contact_id: 'c-1' }, { list_id: 'list-1', contact_id: 'c-2' }],
      { onConflict: 'list_id,contact_id', ignoreDuplicates: true }
    )
  })

  it('shareList inserts into list_shares', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    }
    supabase.from.mockReturnValue(mockChain)

    await act(async () => {
      await result.current.shareList('list-1', ['u-2', 'u-3'])
    })

    expect(supabase.from).toHaveBeenCalledWith('list_shares')
    expect(mockChain.insert).toHaveBeenCalledWith([
      { list_id: 'list-1', shared_with: 'u-2', shared_by: 'user-1' },
      { list_id: 'list-1', shared_with: 'u-3', shared_by: 'user-1' },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose useProspectingLists
```

Expected: FAIL — `addContactsToList` and `shareList` not implemented.

- [ ] **Step 3: Rewrite useProspectingLists.js**

Replace the full content of `frontend/src/features/directory/hooks/useProspectingLists.js`:

```js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useProspectingLists() {
  const [lists, setLists] = useState([])
  const [sharedLists, setSharedLists] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLists = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data } = await supabase
      .from('prospecting_lists')
      .select('*, prospecting_list_contacts(count), list_shares(shared_with, shared_by, profiles!shared_by(prenom, nom))')
      .order('created_at', { ascending: false })

    const all = data ?? []
    const mine = all.filter(l => l.created_by === user?.id || !l.created_by)
    const shared = all.filter(l => l.created_by !== user?.id && l.created_by !== null)

    setLists(mine)
    setSharedLists(shared)
    setLoading(false)
  }, [])

  useEffect(() => { fetchLists() }, [fetchLists])

  async function createList(name) {
    const { data, error } = await supabase
      .from('prospecting_lists')
      .insert({ name })
      .select()
      .single()
    if (error) throw error
    setLists(prev => [{ ...data, prospecting_list_contacts: [{ count: 0 }] }, ...prev])
    return data
  }

  async function addContactToList(listId, contactId) {
    const { error } = await supabase
      .from('prospecting_list_contacts')
      .insert({ list_id: listId, contact_id: contactId })
    if (error) throw error
    await fetchLists()
  }

  async function addContactsToList(listId, contactIds) {
    const rows = contactIds.map(contact_id => ({ list_id: listId, contact_id }))
    const { error } = await supabase
      .from('prospecting_list_contacts')
      .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })
    if (error) throw error
    await fetchLists()
  }

  async function removeContactFromList(listId, contactId) {
    const { error } = await supabase
      .from('prospecting_list_contacts')
      .delete()
      .match({ list_id: listId, contact_id: contactId })
    if (error) throw error
  }

  async function fetchListContacts(listId) {
    const { data, error } = await supabase
      .from('prospecting_list_contacts')
      .select('contacts(*)')
      .eq('list_id', listId)
    if (error) throw error
    return (data ?? []).map(row => row.contacts)
  }

  async function shareList(listId, userIds) {
    const { data: { user } } = await supabase.auth.getUser()
    const rows = userIds.map(uid => ({ list_id: listId, shared_with: uid, shared_by: user.id }))
    const { error } = await supabase.from('list_shares').insert(rows)
    if (error) throw error
  }

  async function revokeShare(listId, userId) {
    const { error } = await supabase
      .from('list_shares')
      .delete()
      .match({ list_id: listId, shared_with: userId })
    if (error) throw error
  }

  return {
    lists,
    sharedLists,
    loading,
    createList,
    addContactToList,
    addContactsToList,
    removeContactFromList,
    fetchListContacts,
    shareList,
    revokeShare,
    refetch: fetchLists,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose useProspectingLists
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/directory/hooks/useProspectingLists.js frontend/src/__tests__/useProspectingLists.test.js
git commit -m "feat: batch add, share/revoke in useProspectingLists"
```

---

## Task 4: DirectoryPage — Full-Page Scroll & Pagination

**Files:**
- Modify: `frontend/src/features/directory/pages/DirectoryPage.jsx`

- [ ] **Step 1: Add page state and Pagination component, remove fixed-height container**

Replace the full content of `frontend/src/features/directory/pages/DirectoryPage.jsx`:

```jsx
import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { useContacts } from '../hooks/useContacts'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactDrawer from '../components/ContactDrawer'
import ContactForm from '../components/ContactForm'

const TAG_COLORS = ['#015d9c', '#3f7a4d', '#b8861a', '#8d2f10', '#5a3873', '#2f6dc4']
function tagColor(tag) {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length]
}

function ContactAvatar({ contact, size = 28 }) {
  const initials = `${contact.prenom?.[0] ?? ''}${contact.nom?.[0] ?? ''}`.toUpperCase() || '?'
  const hue = (((contact.id_profil ?? '') + contact.nom).split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360
  return (
    <span className="avatar" style={{
      width: size, height: size,
      background: `oklch(0.88 0.06 ${hue})`,
      color: `oklch(0.32 0.10 ${hue})`,
      fontSize: Math.max(10, size * 0.4),
      border: '1px solid var(--line)',
      flexShrink: 0,
    }}>{initials}</span>
  )
}

function Pagination({ page, total, pageSize, onPage }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  function pages() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const p = []
    p.push(1)
    if (page > 3) p.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) p.push(i)
    if (page < totalPages - 2) p.push('…')
    p.push(totalPages)
    return p
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '16px 0', flexWrap: 'wrap' }}>
      <button
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        className="btn-ghost"
        style={{ padding: '6px 12px', fontSize: 13, opacity: page === 1 ? 0.4 : 1 }}
      >
        ← Précédent
      </button>
      {pages().map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} style={{ padding: '6px 4px', fontSize: 13, color: 'var(--ink-3)' }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={p === page ? 'btn-ember' : 'btn-ghost'}
            style={{ padding: '6px 10px', fontSize: 13, minWidth: 36 }}
          >
            {p}
          </button>
        )
      )}
      <button
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
        className="btn-ghost"
        style={{ padding: '6px 12px', fontSize: 13, opacity: page === totalPages ? 0.4 : 1 }}
      >
        Suivant →
      </button>
    </div>
  )
}

export default function DirectoryPage() {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [openContact, setOpenContact] = useState(null)
  const [showForm, setShowForm] = useState(false)

  // Bulk action UI state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showListDropdown, setShowListDropdown] = useState(false)
  const [showTagPopover, setShowTagPopover] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [toast, setToast] = useState(null)

  const { contacts, total, loading, createContact, updateTags } = useContacts({ page, pageSize: 50, query })
  const { lists, createList, addContactToList, addContactsToList } = useProspectingLists()

  function handleSearch(val) {
    setQuery(val)
    setPage(1)
    setSelected(new Set())
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const toggle = id => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }
  const toggleAll = () => {
    if (selected.size === contacts.length) setSelected(new Set())
    else setSelected(new Set(contacts.map(c => c.id)))
  }

  async function handleCreateList() {
    if (!newListName.trim() || bulkLoading) return
    setBulkLoading(true)
    try {
      const list = await createList(newListName.trim())
      await addContactsToList(list.id, [...selected])
      setSelected(new Set())
      setShowCreateModal(false)
      setNewListName('')
      showToast(`Liste « ${list.name} » créée avec ${selected.size} contacts`)
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleAddToList(listId) {
    setBulkLoading(true)
    try {
      await addContactsToList(listId, [...selected])
      const listName = lists.find(l => l.id === listId)?.name ?? ''
      setSelected(new Set())
      setShowListDropdown(false)
      showToast(`${selected.size} contact${selected.size > 1 ? 's' : ''} ajouté${selected.size > 1 ? 's' : ''} à « ${listName} »`)
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleApplyTag() {
    if (!tagInput.trim() || bulkLoading) return
    setBulkLoading(true)
    try {
      await updateTags([...selected], tagInput.trim())
      setSelected(new Set())
      setShowTagPopover(false)
      setTagInput('')
      showToast(`Tag « ${tagInput.trim()} » appliqué`)
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="px-8 py-6 fade-up">
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1a1614', color: '#fff', borderRadius: 10, padding: '10px 20px', fontSize: 13, zIndex: 100, whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* Topbar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Annuaire</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
            {total.toLocaleString('fr-FR')} contacts
          </p>
        </div>
        <button className="btn-ember flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={14} /> Nouveau contact
        </button>
      </div>

      {/* Filter bar — sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--paper)', paddingBottom: 8 }}>
        <div className="card p-3 mb-3 flex items-center gap-2 flex-wrap">
          <div style={{ position: 'relative', flex: 1, minWidth: 280 }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }} />
            <input
              className="field ring-ember"
              style={{ paddingLeft: 36 }}
              placeholder="Rechercher : nom, entreprise, poste, ville…"
              value={query}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>
          <button className="btn-ghost flex items-center gap-1.5">
            <Icon name="upload" size={14} /> Importer CSV
          </button>
        </div>

        {/* Selection bar */}
        {selected.size > 0 && (
          <div className="mb-3 flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--ember-soft)', border: '1px solid #c2d9ef', position: 'relative' }}>
            <div style={{ fontSize: 13, color: 'var(--ember-2)' }}>
              <strong>{selected.size}</strong> contact{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-2">
              {/* Add to existing list */}
              <div style={{ position: 'relative' }}>
                <button
                  className="btn-ghost flex items-center gap-1.5"
                  onClick={() => { setShowListDropdown(v => !v); setShowTagPopover(false) }}
                >
                  <Icon name="bookmark" size={13} /> Ajouter à une liste
                </button>
                {showListDropdown && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fffdf8', border: '1px solid var(--line)', borderRadius: 10, padding: 6, minWidth: 200, zIndex: 20, boxShadow: '0 4px 16px rgba(0,0,0,.08)' }}>
                    {lists.length === 0 ? (
                      <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-3)' }}>Aucune liste existante</div>
                    ) : lists.map(list => (
                      <button
                        key={list.id}
                        className="btn-ghost"
                        style={{ width: '100%', justifyContent: 'flex-start', fontSize: 13 }}
                        onClick={() => handleAddToList(list.id)}
                        disabled={bulkLoading}
                      >
                        {list.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tag */}
              <div style={{ position: 'relative' }}>
                <button
                  className="btn-ghost flex items-center gap-1.5"
                  onClick={() => { setShowTagPopover(v => !v); setShowListDropdown(false) }}
                >
                  <Icon name="tag" size={13} /> Tag
                </button>
                {showTagPopover && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fffdf8', border: '1px solid var(--line)', borderRadius: 10, padding: 10, zIndex: 20, boxShadow: '0 4px 16px rgba(0,0,0,.08)', display: 'flex', gap: 6, minWidth: 220 }}>
                    <input
                      autoFocus
                      className="field"
                      style={{ fontSize: 13, padding: '7px 10px', flex: 1 }}
                      placeholder="Nom du tag…"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleApplyTag()}
                    />
                    <button
                      className="btn-ember"
                      style={{ whiteSpace: 'nowrap', padding: '7px 12px', fontSize: 13, opacity: (!tagInput.trim() || bulkLoading) ? 0.5 : 1 }}
                      disabled={!tagInput.trim() || bulkLoading}
                      onClick={handleApplyTag}
                    >
                      Appliquer
                    </button>
                  </div>
                )}
              </div>

              {/* Create list from selection */}
              <button
                className="btn-primary flex items-center gap-1.5"
                onClick={() => { setShowCreateModal(true); setShowListDropdown(false); setShowTagPopover(false) }}
              >
                <Icon name="plus" size={13} /> Créer une liste
              </button>
              <button style={{ padding: 6, color: 'var(--ink-3)', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setSelected(new Set())}>
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Counter */}
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          <strong style={{ color: 'var(--ink)' }}>{total.toLocaleString('fr-FR')}</strong> résultat{total !== 1 ? 's' : ''}
          {query && <span> pour « {query} »</span>}
        </div>
      </div>

      {/* Table — no fixed height, page scrolls */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === contacts.length && contacts.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th>Nom</th>
                <th>Entreprise / Poste</th>
                <th>Localisation</th>
                <th>Diplôme · Année</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} className={selected.has(c.id) ? 'selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setOpenContact(c)}>
                      <ContactAvatar contact={c} size={28} />
                      <div style={{ lineHeight: 1.3 }}>
                        <div style={{ fontWeight: 500, fontSize: 13.5 }}>{c.prenom} {c.nom?.toUpperCase()}</div>
                        {c.id_profil && <div className="font-mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>#{c.id_profil}</div>}
                        {/* Tag pills */}
                        {c.tags?.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                            {c.tags.slice(0, 2).map(tag => (
                              <span key={tag} style={{ background: tagColor(tag) + '22', color: tagColor(tag), border: `1px solid ${tagColor(tag)}55`, borderRadius: 99, padding: '1px 7px', fontSize: 10.5, fontWeight: 500 }}>
                                {tag}
                              </span>
                            ))}
                            {c.tags.length > 2 && (
                              <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>+{c.tags.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ lineHeight: 1.3 }}>
                      <div style={{ fontSize: 13 }}>{c.entreprise_actuelle || '—'}</div>
                      {c.titre_poste && <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{c.titre_poste}</div>}
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {c.ville || '—'}{c.pays && <span style={{ color: 'var(--ink-4)' }}> · {c.pays}</span>}
                  </td>
                  <td>
                    <div style={{ lineHeight: 1.3 }}>
                      {c.diplomes && <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{c.diplomes}</div>}
                      {c.annee_obtention_diplome && <div className="font-mono" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{c.annee_obtention_diplome}</div>}
                      {!c.diplomes && !c.annee_obtention_diplome && <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} style={{ color: 'var(--ember)' }} onClick={e => e.stopPropagation()}>{c.email}</a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)' }}>
                    Aucun contact trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination bar */}
      <Pagination page={page} total={total} pageSize={50} onPage={setPage} />

      {/* Create list modal */}
      {showCreateModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,22,20,.25)' }}
          onClick={() => setShowCreateModal(false)}
        >
          <div style={{ background: '#fffdf8', border: '1px solid var(--line)', borderRadius: 16, padding: 24, width: 360, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Nouvelle liste</h3>
            <input
              autoFocus
              className="field"
              style={{ width: '100%', marginBottom: 12 }}
              placeholder="Nom de la liste…"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateList()}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setShowCreateModal(false); setNewListName('') }}>Annuler</button>
              <button
                className="btn-ember"
                style={{ flex: 1, opacity: (!newListName.trim() || bulkLoading) ? 0.5 : 1 }}
                disabled={!newListName.trim() || bulkLoading}
                onClick={handleCreateList}
              >
                {bulkLoading ? '…' : `Créer avec ${selected.size} contact${selected.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact drawer */}
      {openContact && (
        <ContactDrawer
          contact={openContact}
          lists={lists}
          onClose={() => setOpenContact(null)}
          onAddToList={addContactToList}
          onCreateList={createList}
        />
      )}

      {/* New contact form */}
      {showForm && (
        <ContactForm onClose={() => setShowForm(false)} onSubmit={createContact} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Start the dev server (`npm run dev`). Navigate to `/annuaire`. Verify:
- The page scrolls naturally (no fixed-height clipping)
- The search bar sticks at the top when scrolling
- The pagination bar appears at the bottom (if >50 contacts exist)
- Clicking page 2 loads the next 50 contacts
- Searching resets to page 1
- Selecting contacts shows the bulk action bar

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/directory/pages/DirectoryPage.jsx
git commit -m "feat: full-page scroll, server-side pagination, tag pills, bulk action UI"
```



---

## Task 5: ListsPage — Clickable Profiles + Share UI

**Files:**
- Modify: `frontend/src/features/directory/pages/ListsPage.jsx`

Replace the full content of `frontend/src/features/directory/pages/ListsPage.jsx`:

- [ ] **Step 1: Write the updated ListsPage**

```jsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactDrawer from '../components/ContactDrawer'
import { supabase } from '../../../shared/lib/supabase'

const LIST_COLORS = ['#015d9c', '#3f7a4d', '#b8861a', '#8d2f10', '#5a3873', '#2f6dc4']

function ShareModal({ listId, onClose, shareList }) {
  const [members, setMembers] = useState([])
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useState(() => {
    supabase.from('profiles').select('id, prenom, nom, email').order('nom')
      .then(({ data }) => { setMembers(data ?? []); setLoadingMembers(false) })
  })

  const filtered = members.filter(m =>
    `${m.prenom} ${m.nom}`.toLowerCase().includes(search.toLowerCase()) ||
    (m.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleShare() {
    if (selected.length === 0 || submitting) return
    setSubmitting(true)
    try {
      await shareList(listId, selected)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  function toggleMember(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,22,20,.25)' }}
      onClick={onClose}
    >
      <div style={{ background: '#fffdf8', border: '1px solid var(--line)', borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>Partager la liste</h3>
        <input
          className="field"
          placeholder="Rechercher un membre…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', marginBottom: 10 }}
        />
        {/* Selected chips */}
        {selected.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {selected.map(uid => {
              const m = members.find(x => x.id === uid)
              return (
                <span key={uid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--ember-soft)', border: '1px solid #c2d9ef', borderRadius: 99, padding: '3px 10px', fontSize: 12 }}>
                  {m?.prenom} {m?.nom}
                  <button onClick={() => toggleMember(uid)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                    <Icon name="x" size={11} />
                  </button>
                </span>
              )
            })}
          </div>
        )}
        {/* Member list */}
        <div style={{ maxHeight: 200, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          {loadingMembers ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Aucun membre trouvé</div>
          ) : filtered.map(m => (
            <button
              key={m.id}
              className={selected.includes(m.id) ? 'btn-ember' : 'btn-ghost'}
              style={{ justifyContent: 'flex-start', fontSize: 13 }}
              onClick={() => toggleMember(m.id)}
            >
              <span style={{ flex: 1, textAlign: 'left' }}>{m.prenom} {m.nom}</span>
              <span style={{ color: selected.includes(m.id) ? 'rgba(255,255,255,.7)' : 'var(--ink-3)', fontSize: 11 }}>{m.email}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
          <button
            className="btn-ember"
            style={{ flex: 1, opacity: (selected.length === 0 || submitting) ? 0.5 : 1 }}
            disabled={selected.length === 0 || submitting}
            onClick={handleShare}
          >
            {submitting ? '…' : `Partager avec ${selected.length} membre${selected.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ListsPage() {
  const { id: selectedId } = useParams()
  const navigate = useNavigate()
  const { lists, sharedLists, loading: listsLoading, createList, addContactToList, fetchListContacts, removeContactFromList, shareList } = useProspectingLists()

  const [showInput, setShowInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [listContacts, setListContacts] = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [prevId, setPrevId] = useState(null)

  // Drawer state for clickable profiles
  const [selectedContact, setSelectedContact] = useState(null)

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false)

  // Load contacts when selected list changes
  if (selectedId && selectedId !== prevId) {
    setPrevId(selectedId)
    setLoadingContacts(true)
    fetchListContacts(selectedId).then(data => { setListContacts(data); setLoadingContacts(false) })
  }

  const allLists = [...lists, ...sharedLists]
  const activeList = allLists.find(l => l.id === selectedId)
  const isOwner = lists.some(l => l.id === selectedId)

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    const list = await createList(newName.trim())
    setNewName('')
    setShowInput(false)
    setCreating(false)
    navigate(`/annuaire/listes/${list.id}`)
  }

  async function handleRemove(contactId) {
    await removeContactFromList(selectedId, contactId)
    setListContacts(prev => prev.filter(c => c.id !== contactId))
  }

  function renderListCard(list, i, isShared = false) {
    return (
      <div
        key={list.id}
        onClick={() => navigate(`/annuaire/listes/${list.id}`)}
        className="card"
        style={{
          padding: 12,
          cursor: 'pointer',
          transition: 'border-color .12s, background .12s',
          borderColor: selectedId === list.id ? 'var(--ember)' : 'var(--line)',
          background: selectedId === list.id ? 'var(--ember-soft)' : '#fffdf8',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {isShared ? (
            <Icon name="users" size={13} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
          ) : (
            <span style={{ width: 8, height: 8, borderRadius: 99, background: LIST_COLORS[i % LIST_COLORS.length], flexShrink: 0 }} />
          )}
          <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{list.name}</div>
        </div>
        {isShared && list.list_shares?.[0]?.profiles && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>
            Partagé par {list.list_shares[0].profiles.prenom} {list.list_shares[0].profiles.nom}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-3)' }}>
          <span>{list.prospecting_list_contacts?.[0]?.count ?? 0} contacts</span>
          <span>{new Date(list.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="px-8 py-6 fade-up flex gap-6" style={{ minHeight: 0 }}>
      {/* Left sidebar */}
      <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 className="page-title" style={{ fontSize: 28 }}>Listes</h1>
          <button
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ember)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => setShowInput(true)}
          >
            <Icon name="plus" size={12} /> Nouvelle
          </button>
        </div>

        {showInput && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              className="field"
              style={{ fontSize: 13, padding: '7px 10px' }}
              placeholder="Nom de la liste…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowInput(false); setNewName('') } }}
            />
            <button
              className="btn-ember"
              style={{ whiteSpace: 'nowrap', opacity: (!newName.trim() || creating) ? 0.5 : 1, padding: '7px 12px', fontSize: 13 }}
              disabled={!newName.trim() || creating}
              onClick={handleCreate}
            >
              {creating ? '…' : 'Créer'}
            </button>
          </div>
        )}

        {/* Mes listes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {listsLoading ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Chargement…</div>
          ) : lists.length === 0 ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Aucune liste</div>
          ) : lists.map((list, i) => renderListCard(list, i, false))}
        </div>

        {/* Partagées avec moi */}
        {sharedLists.length > 0 && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--ink-4)', letterSpacing: '.08em', textTransform: 'uppercase', paddingTop: 4 }}>
              Partagées avec moi
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sharedLists.map((list, i) => renderListCard(list, i, true))}
            </div>
          </>
        )}
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {!selectedId || !activeList ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--ink-3)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--paper-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon name="bookmark" size={22} />
            </div>
            <div style={{ fontWeight: 500, color: 'var(--ink)', fontSize: 15, marginBottom: 4 }}>Sélectionnez une liste</div>
            <div style={{ fontSize: 13, maxWidth: 280 }}>Choisissez une liste dans le panneau de gauche pour voir son contenu.</div>
          </div>
        ) : (
          <>
            {/* List header card */}
            <div className="card p-5">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h2 className="font-serif" style={{ fontSize: 30, lineHeight: 1.05 }}>{activeList.name}</h2>
                  <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--ink-3)' }}>
                    {activeList.prospecting_list_contacts?.[0]?.count ?? 0} contacts · créé le {new Date(activeList.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost flex items-center gap-1.5"><Icon name="download" size={13} /> Export CSV</button>
                  {isOwner && (
                    <button
                      className="btn-ghost flex items-center gap-1.5"
                      onClick={() => setShowShareModal(true)}
                    >
                      <Icon name="users" size={13} /> Partager
                    </button>
                  )}
                  <button className="btn-ember flex items-center gap-1.5"><Icon name="send" size={13} /> Composer email</button>
                </div>
              </div>
            </div>

            {/* Contacts table — rows are clickable */}
            <div className="card overflow-hidden">
              {loadingContacts ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
              ) : listContacts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 14 }}>
                  Cette liste est vide. Ajoutez des contacts depuis l'Annuaire.
                </div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th><input type="checkbox" /></th>
                      <th>Contact</th>
                      <th>Entreprise</th>
                      <th>Email</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listContacts.map(c => (
                      <tr
                        key={c.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedContact(c)}
                      >
                        <td><input type="checkbox" onClick={e => e.stopPropagation()} /></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              className="avatar"
                              style={{
                                width: 26, height: 26,
                                background: `oklch(0.88 0.06 ${(((c.id_profil ?? '') + c.nom).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 47) % 360})`,
                                color: `oklch(0.32 0.10 ${(((c.id_profil ?? '') + c.nom).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 47) % 360})`,
                                fontSize: 11, border: '1px solid var(--line)',
                              }}
                            >
                              {`${c.prenom?.[0] ?? ''}${c.nom?.[0] ?? ''}`.toUpperCase() || '?'}
                            </span>
                            <div style={{ lineHeight: 1.3 }}>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{c.prenom} {c.nom?.toUpperCase()}</div>
                              {c.titre_poste && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.titre_poste}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.entreprise_actuelle || '—'}</td>
                        <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                          {c.email ? (
                            <a href={`mailto:${c.email}`} style={{ color: 'var(--ember)' }} onClick={e => e.stopPropagation()}>{c.email}</a>
                          ) : '—'}
                        </td>
                        <td>
                          {isOwner && (
                            <button
                              style={{ padding: 4, color: 'var(--bad)', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 6 }}
                              onClick={e => { e.stopPropagation(); handleRemove(c.id) }}
                              title="Retirer de la liste"
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* Contact drawer */}
      {selectedContact && (
        <ContactDrawer
          contact={selectedContact}
          lists={lists}
          onClose={() => setSelectedContact(null)}
          onAddToList={addContactToList}
          onCreateList={createList}
        />
      )}

      {/* Share modal */}
      {showShareModal && selectedId && (
        <ShareModal
          listId={selectedId}
          onClose={() => setShowShareModal(false)}
          shareList={shareList}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Fix the useEffect bug in ShareModal**

The `useState(() => {...})` call on line loading members is wrong — it should be `useEffect`. Find this block in ShareModal:

```js
  useState(() => {
    supabase.from('profiles').select('id, prenom, nom, email').order('nom')
      .then(({ data }) => { setMembers(data ?? []); setLoadingMembers(false) })
  })
```

Replace with:

```js
  useEffect(() => {
    supabase.from('profiles').select('id, prenom, nom, email').order('nom')
      .then(({ data }) => { setMembers(data ?? []); setLoadingMembers(false) })
  }, [])
```

Also add `useEffect` to the imports at the top of the file:
```js
import { useState, useEffect } from 'react'
```

- [ ] **Step 3: Verify in browser**

Start the dev server. Navigate to `/annuaire/listes`. Verify:
- Clicking a contact row opens the ContactDrawer on the right
- The trash icon still works (doesn't open drawer)
- "Partager" button appears in the list header (only for your own lists)
- Clicking "Partager" opens the share modal with a member list
- Selecting members and submitting calls `shareList` without error
- Shared lists appear in a "Partagées avec moi" section in the sidebar

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/directory/pages/ListsPage.jsx
git commit -m "feat: clickable profiles in list view, share modal, shared lists sidebar section"
```

---

## Task 6: Members Feature

**Files:**
- Create: `frontend/src/features/members/hooks/useMembers.js`
- Create: `frontend/src/features/members/pages/MembersPage.jsx`

- [ ] **Step 1: Create useMembers hook**

Create `frontend/src/features/members/hooks/useMembers.js`:

```js
import { useState, useEffect } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useMembers() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, prenom, nom, role, email')
      .order('nom')
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setMembers(data ?? [])
        setLoading(false)
      })
  }, [])

  return { members, loading, error }
}
```

- [ ] **Step 2: Create MembersPage**

Create `frontend/src/features/members/pages/MembersPage.jsx`:

```jsx
import { Icon } from '../../../shared/lib/icons'
import { useMembers } from '../hooks/useMembers'

const ROLE_LABELS = {
  admin: 'Admin',
  project_manager: 'Chef de projet',
  consultant: 'Consultant',
}

const ROLE_COLORS = {
  admin: { bg: '#dbeafe', text: '#1d4ed8' },
  project_manager: { bg: '#dcfce7', text: '#15803d' },
  consultant: { bg: '#f3f4f6', text: '#374151' },
}

function MemberAvatar({ member }) {
  const initials = `${member.prenom?.[0] ?? ''}${member.nom?.[0] ?? ''}`.toUpperCase() || '?'
  const color = member.role === 'admin' ? '#015d9c' : 'var(--ink-3)'
  return (
    <span className="avatar" style={{ width: 32, height: 32, background: color + '1a', color, fontSize: 13, border: `1px solid ${color}33`, flexShrink: 0 }}>
      {initials}
    </span>
  )
}

export default function MembersPage() {
  const { members, loading, error } = useMembers()

  return (
    <div className="px-8 py-6 fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Membres</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
            {members.length} membre{members.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--bad)', fontSize: 14 }}>{error}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 48 }}></th>
                <th>Nom</th>
                <th>Email</th>
                <th>Rôle</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const roleStyle = ROLE_COLORS[m.role] ?? ROLE_COLORS.consultant
                return (
                  <tr key={m.id}>
                    <td><MemberAvatar member={m} /></td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13.5 }}>
                        {m.prenom} {m.nom?.toUpperCase()}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                      {m.email ? (
                        <a href={`mailto:${m.email}`} style={{ color: 'var(--ember)' }}>{m.email}</a>
                      ) : '—'}
                    </td>
                    <td>
                      <span style={{
                        background: roleStyle.bg,
                        color: roleStyle.text,
                        borderRadius: 99,
                        padding: '3px 10px',
                        fontSize: 12,
                        fontWeight: 500,
                      }}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)' }}>
                    Aucun membre trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/members/
git commit -m "feat: Members page with useMembers hook"
```

---

## Task 7: Routes + Sidebar Navigation

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/shared/components/Sidebar.jsx`

- [ ] **Step 1: Add /membres route to App.jsx**

In `App.jsx`, add the import at the top (after the existing imports):

```js
import MembersPage from './features/members/pages/MembersPage'
```

Then add the route inside `<Routes>`, after the `/annuaire/listes/:id` route:

```jsx
<Route path="/membres" element={<Protected><MembersPage /></Protected>} />
```

- [ ] **Step 2: Add Membres nav item to Sidebar.jsx**

In `Sidebar.jsx`, find the `NAV_SECTIONS` array and update the `'Prospection'` section:

```js
  {
    title: 'Prospection',
    items: [
      { to: '/annuaire',        icon: 'users',    label: 'Annuaire' },
      { to: '/annuaire/listes', icon: 'bookmark', label: 'Listes' },
      { to: '/membres',         icon: 'user',     label: 'Membres' },
    ],
  },
```

- [ ] **Step 3: Verify in browser**

Navigate to `/membres`. Verify:
- The sidebar shows a "Membres" link
- The page loads and shows a table with member rows (avatar, name, email, role badge)
- Role badges are color-coded (blue for admin, green for project_manager, grey for consultant)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/shared/components/Sidebar.jsx
git commit -m "feat: /membres route and sidebar nav item"
```

---

## Task 8: ContactDrawer — Tag Pills

**Files:**
- Modify: `frontend/src/features/directory/components/ContactDrawer.jsx`

The drawer needs to show tags and allow removing them. The `removeTag` function comes from `useContacts`, so the drawer needs to receive it as a prop (or the parent passes it).

- [ ] **Step 1: Update ContactDrawer to accept and display tags**

In `ContactDrawer.jsx`, update the component signature to accept `onRemoveTag`:

```jsx
export default function ContactDrawer({ contact: c, lists, onClose, onAddToList, onCreateList, onRemoveTag }) {
```

After the `<div className="dotted-x" />` line (around line 87), add the tags section:

```jsx
          {/* Tags */}
          {c.tags?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-4)', marginBottom: 8 }}>
                Tags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {c.tags.map(tag => {
                  const TAG_COLORS = ['#015d9c', '#3f7a4d', '#b8861a', '#8d2f10', '#5a3873', '#2f6dc4']
                  let h = 0; for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0
                  const color = TAG_COLORS[Math.abs(h) % TAG_COLORS.length]
                  return (
                    <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: color + '22', color, border: `1px solid ${color}55`, borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>
                      {tag}
                      {onRemoveTag && (
                        <button onClick={() => onRemoveTag(c.id, tag)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color }}>
                          <Icon name="x" size={10} />
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
```

- [ ] **Step 2: Pass onRemoveTag from DirectoryPage**

In `DirectoryPage.jsx`, find the `<ContactDrawer>` usage and add the `onRemoveTag` prop:

```jsx
      {openContact && (
        <ContactDrawer
          contact={openContact}
          lists={lists}
          onClose={() => setOpenContact(null)}
          onAddToList={addContactToList}
          onCreateList={createList}
          onRemoveTag={removeTag}
        />
      )}
```

Also destructure `removeTag` from `useContacts`:

```js
  const { contacts, total, loading, createContact, updateTags, removeTag } = useContacts({ page, pageSize: 50, query })
```

- [ ] **Step 3: Verify in browser**

Apply a tag via the bulk action popover in the annuaire. Then click the contact to open the drawer. Verify:
- Tag pills appear in the drawer
- Clicking the × on a tag pill removes it and the drawer updates

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/directory/components/ContactDrawer.jsx frontend/src/features/directory/pages/DirectoryPage.jsx
git commit -m "feat: tag pills in ContactDrawer with remove action"
```

---

## Verification Checklist

Run through each feature manually in the browser after all tasks are complete:

- [ ] **Pagination:** Navigate to `/annuaire`. Scroll down — the page scrolls naturally. Pagination bar appears at the bottom. Clicking page 2 loads 50 new contacts. Searching resets to page 1.
- [ ] **Bulk create list:** Select 3 contacts → "Créer une liste" → type a name → confirm. Verify the list is created and you land on it with the 3 contacts.
- [ ] **Bulk add to list:** Select contacts → "Ajouter à une liste" → pick an existing list. Verify toast appears and contacts are added.
- [ ] **Bulk tag:** Select contacts → "Tag" → type a tag name → "Appliquer". Verify tag pills appear in the table row.
- [ ] **Tag in drawer:** Click a tagged contact → drawer opens → tag pills shown → click × to remove.
- [ ] **Clickable profiles in list view:** Navigate to a list → click a contact row → drawer slides in.
- [ ] **Share list:** On a list you own → "Partager" → select a member → submit. Navigate to another account and verify the list appears under "Partagées avec moi".
- [ ] **Members page:** Click "Membres" in sidebar → table of members with avatar, name, email, role badge.

---

## Run Tests

```bash
cd jump-oracle/.worktrees/phase1-build/frontend
npm test
```

All tests should pass.

