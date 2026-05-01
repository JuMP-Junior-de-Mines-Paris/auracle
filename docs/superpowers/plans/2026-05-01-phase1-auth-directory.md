# JuMP Oracle Phase 1 — Auth + Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working React + Supabase app with authentication, a contact directory (card grid), and prospecting lists.

**Architecture:** Feature-based folder structure under `frontend/src/features/`. Supabase JS client handles auth and data. Shared shell components (Sidebar, Layout) wrap all protected pages.

**Tech Stack:** Vite, React 18, React Router v6, TailwindCSS, FontAwesome, Supabase JS client, Vitest + React Testing Library.

---

## File Map

```
jump-oracle/
├── supabase/
│   └── schema.sql                              CREATE
├── frontend/
│   ├── index.html                              CREATE
│   ├── package.json                            CREATE
│   ├── vite.config.js                          CREATE
│   ├── tailwind.config.js                      CREATE
│   ├── postcss.config.js                       CREATE
│   ├── .env.local                              CREATE (git-ignored)
│   └── src/
│       ├── index.css                           CREATE
│       ├── main.jsx                            CREATE
│       ├── App.jsx                             CREATE
│       ├── setupTests.js                       CREATE
│       ├── __tests__/
│       │   ├── auth/
│       │   │   └── useAuth.test.jsx            CREATE
│       │   ├── directory/
│       │   │   ├── useContacts.test.js         CREATE
│       │   │   └── useProspectingLists.test.js CREATE
│       │   └── shared/
│       │       └── ProtectedRoute.test.jsx     CREATE
│       ├── features/
│       │   ├── auth/
│       │   │   ├── hooks/
│       │   │   │   └── useAuth.jsx             CREATE
│       │   │   ├── components/
│       │   │   │   └── LoginForm.jsx           CREATE
│       │   │   └── pages/
│       │   │       └── LoginPage.jsx           CREATE
│       │   └── directory/
│       │       ├── hooks/
│       │       │   ├── useContacts.js          CREATE
│       │       │   └── useProspectingLists.js  CREATE
│       │       ├── components/
│       │       │   ├── ContactCard.jsx         CREATE
│       │       │   ├── ContactModal.jsx        CREATE
│       │       │   ├── ContactForm.jsx         CREATE
│       │       │   └── ContextMenu.jsx         CREATE
│       │       └── pages/
│       │           ├── DirectoryPage.jsx       CREATE
│       │           ├── ListsPage.jsx           CREATE
│       │           └── ListDetailPage.jsx      CREATE
│       └── shared/
│           ├── lib/
│           │   └── supabase.js                 CREATE
│           └── components/
│               ├── Layout.jsx                  CREATE
│               ├── Sidebar.jsx                 CREATE
│               └── ProtectedRoute.jsx          CREATE
└── backend/                                    CREATE (empty dir)
```

---

## Task 1: Database Schema

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Create the SQL schema file**

```sql
-- supabase/schema.sql

-- Role enum
create type user_role as enum ('admin', 'project_manager', 'consultant');

-- profiles — extends auth.users, one row per member
create table profiles (
  id      uuid references auth.users(id) on delete cascade primary key,
  role    user_role not null default 'consultant',
  prenom  text not null default '',
  nom     text not null default ''
);

-- contacts — the full directory model
create table contacts (
  id                       uuid primary key default gen_random_uuid(),
  id_profil                text,
  prenom                   text,
  nom                      text,
  pays                     text,
  ville                    text,
  annee_obtention_diplome  integer,
  diplomes                 text,
  entreprise_actuelle      text,
  titre_poste              text,
  email                    text,
  telephone                text,
  linkedin                 text,
  created_by               uuid references profiles(id),
  created_at               timestamptz default now()
);

-- prospecting_lists
create table prospecting_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- prospecting_list_contacts — junction table
create table prospecting_list_contacts (
  list_id    uuid references prospecting_lists(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  primary key (list_id, contact_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table profiles                enable row level security;
alter table contacts                enable row level security;
alter table prospecting_lists       enable row level security;
alter table prospecting_list_contacts enable row level security;

-- profiles: each user reads/updates only their own row
create policy "profiles: own read"
  on profiles for select using (auth.uid() = id);
create policy "profiles: own update"
  on profiles for update using (auth.uid() = id);

-- contacts: all authenticated users can read, insert, update
create policy "contacts: auth select"
  on contacts for select using (auth.role() = 'authenticated');
create policy "contacts: auth insert"
  on contacts for insert with check (auth.role() = 'authenticated');
create policy "contacts: auth update"
  on contacts for update using (auth.role() = 'authenticated');
-- only admins can delete
create policy "contacts: admin delete"
  on contacts for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- prospecting_lists + junction: all authenticated users full access
create policy "lists: auth all"
  on prospecting_lists for all using (auth.role() = 'authenticated');
create policy "list_contacts: auth all"
  on prospecting_list_contacts for all using (auth.role() = 'authenticated');

-- ── Trigger: auto-create profile on sign-up ───────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

- [ ] **Step 2: Run the schema in Supabase**

Open your Supabase project → SQL Editor → paste the contents of `supabase/schema.sql` → Run.

Verify in Table Editor: `profiles`, `contacts`, `prospecting_lists`, `prospecting_list_contacts` all exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add supabase database schema"
```

---

## Task 2: Frontend Scaffold

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.js`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/index.html`, `frontend/src/index.css`, `frontend/src/main.jsx`, `frontend/src/setupTests.js`, `frontend/.env.local`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "jump-oracle-frontend",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "@fortawesome/fontawesome-svg-core": "^6.5.2",
    "@fortawesome/free-brands-svg-icons": "^6.5.2",
    "@fortawesome/free-solid-svg-icons": "^6.5.2",
    "@fortawesome/react-fontawesome": "^0.2.2",
    "@supabase/supabase-js": "^2.43.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.23.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.5",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "jsdom": "^24.1.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "vite": "^5.2.12",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
```

- [ ] **Step 3: Create `frontend/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#005a9f',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 4: Create `frontend/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JuMP Oracle</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create `frontend/src/setupTests.js`**

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 8: Create `frontend/src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 9: Create `frontend/.env.local`**

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Replace the values with your actual Supabase project URL and anon key (found in Supabase → Project Settings → API).

- [ ] **Step 10: Create empty `backend/` directory**

```bash
mkdir backend
```

- [ ] **Step 11: Install dependencies and verify dev server starts**

```bash
cd frontend
npm install
npm run dev
```

Expected: Vite dev server running at `http://localhost:5173` (no errors, blank page is fine — App.jsx doesn't exist yet).

- [ ] **Step 12: Commit**

```bash
git add frontend/ backend/
git commit -m "feat: scaffold vite+react frontend with tailwind and testing setup"
```

---

## Task 3: Supabase Client

**Files:**
- Create: `frontend/src/shared/lib/supabase.js`

- [ ] **Step 1: Create the Supabase client singleton**

```js
// frontend/src/shared/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/shared/lib/supabase.js
git commit -m "feat: add supabase client singleton"
```

---

## Task 4: useAuth Hook (TDD)

**Files:**
- Create: `frontend/src/features/auth/hooks/useAuth.jsx`
- Test: `frontend/src/__tests__/auth/useAuth.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/__tests__/auth/useAuth.test.jsx
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthProvider, useAuth } from '../../features/auth/hooks/useAuth'

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({}),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'consultant' } }),
    }),
  },
}))

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within AuthProvider'
    )
  })

  it('exposes null user when there is no session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await act(async () => {})
    expect(result.current.user).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('login calls supabase signInWithPassword', async () => {
    const { supabase } = await import('../../shared/lib/supabase')
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await act(async () => {})
    await act(async () => {
      await result.current.login('test@example.com', 'password')
    })
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password',
    })
  })

  it('logout calls supabase signOut', async () => {
    const { supabase } = await import('../../shared/lib/supabase')
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await act(async () => {})
    await act(async () => { await result.current.logout() })
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend
npm test -- src/__tests__/auth/useAuth.test.jsx
```

Expected: FAIL — `Cannot find module '../../features/auth/hooks/useAuth'`

- [ ] **Step 3: Implement useAuth**

```jsx
// frontend/src/features/auth/hooks/useAuth.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../../shared/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) fetchProfile(session.user.id)
        else { setRole(null); setLoading(false) }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    setRole(data?.role ?? null)
    setLoading(false)
  }

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- src/__tests__/auth/useAuth.test.jsx
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/auth/hooks/useAuth.jsx frontend/src/__tests__/auth/useAuth.test.jsx
git commit -m "feat: add useAuth hook with AuthContext and tests"
```

---

## Task 5: LoginForm + LoginPage

**Files:**
- Create: `frontend/src/features/auth/components/LoginForm.jsx`
- Create: `frontend/src/features/auth/pages/LoginPage.jsx`

- [ ] **Step 1: Create LoginForm**

```jsx
// frontend/src/features/auth/components/LoginForm.jsx
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function LoginForm({ onSuccess }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(email, password)
      onSuccess?.()
    } catch {
      setError('Email ou mot de passe incorrect.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-slate-600 mb-1">Email</label>
        <input
          type="email"
          required
          autoComplete="email"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#005a9f] focus:border-transparent"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm text-slate-600 mb-1">Mot de passe</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#005a9f] focus:border-transparent"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#005a9f] text-white py-2.5 rounded-lg hover:bg-[#004a8f] disabled:opacity-50 transition-colors font-medium"
      >
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create LoginPage**

```jsx
// frontend/src/features/auth/pages/LoginPage.jsx
import { useNavigate } from 'react-router-dom'
import LoginForm from '../components/LoginForm'

export default function LoginPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#005a9f]">JUMP ORACLE</h1>
          <p className="text-slate-500 text-sm mt-1">
            Connectez-vous pour accéder à l'application
          </p>
        </div>
        <LoginForm onSuccess={() => navigate('/annuaire')} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/auth/
git commit -m "feat: add login form and login page"
```

---

## Task 6: ProtectedRoute (TDD)

**Files:**
- Create: `frontend/src/shared/components/ProtectedRoute.jsx`
- Test: `frontend/src/__tests__/shared/ProtectedRoute.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/__tests__/shared/ProtectedRoute.test.jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import ProtectedRoute from '../../shared/components/ProtectedRoute'

vi.mock('../../features/auth/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../features/auth/hooks/useAuth'

describe('ProtectedRoute', () => {
  it('redirects to /login when not authenticated', () => {
    useAuth.mockReturnValue({ user: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/annuaire']}>
        <Routes>
          <Route
            path="/annuaire"
            element={<ProtectedRoute><div>Protected</div></ProtectedRoute>}
          />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    useAuth.mockReturnValue({ user: { id: '1' }, loading: false })
    render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected content</div></ProtectedRoute>
      </MemoryRouter>
    )
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('shows loading state while session resolves', () => {
    useAuth.mockReturnValue({ user: null, loading: true })
    render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected</div></ProtectedRoute>
      </MemoryRouter>
    )
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- src/__tests__/shared/ProtectedRoute.test.jsx
```

Expected: FAIL — `Cannot find module '../../shared/components/ProtectedRoute'`

- [ ] **Step 3: Implement ProtectedRoute**

```jsx
// frontend/src/shared/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/hooks/useAuth'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-400">
        Chargement…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- src/__tests__/shared/ProtectedRoute.test.jsx
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/components/ProtectedRoute.jsx frontend/src/__tests__/shared/ProtectedRoute.test.jsx
git commit -m "feat: add ProtectedRoute component with tests"
```

---

## Task 7: Sidebar

**Files:**
- Create: `frontend/src/shared/components/Sidebar.jsx`

- [ ] **Step 1: Create Sidebar**

```jsx
// frontend/src/shared/components/Sidebar.jsx
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faAddressBook,
  faBriefcase,
  faChartBar,
  faGear,
  faRightFromBracket,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
import { useAuth } from '../../features/auth/hooks/useAuth'

const NAV_ITEMS = [
  { to: '/annuaire', icon: faAddressBook, label: 'Annuaire', enabled: true },
  { to: '/missions', icon: faBriefcase, label: 'Missions', enabled: false },
  { to: '/dashboard', icon: faChartBar, label: 'Dashboard', enabled: false },
  { to: '/settings', icon: faGear, label: 'Paramètres', enabled: false },
]

export default function Sidebar() {
  const [expanded, setExpanded] = useState(() => window.innerWidth >= 1024)
  const { user, role, logout } = useAuth()
  const initials = (user?.email?.[0] ?? 'U').toUpperCase()

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col h-screen bg-white border-r border-slate-200 transition-all duration-200 flex-shrink-0 ${
          expanded ? 'w-56' : 'w-12'
        }`}
      >
        {/* Logo + toggle */}
        <div
          className={`flex items-center h-14 border-b border-slate-100 px-3 ${
            expanded ? 'justify-between' : 'justify-center'
          }`}
        >
          {expanded && (
            <span className="font-bold text-[#005a9f] text-sm tracking-wide select-none">
              JUMP ORACLE
            </span>
          )}
          <button
            className="text-slate-400 hover:text-[#005a9f] transition-colors p-1"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Réduire le menu' : 'Agrandir le menu'}
          >
            <FontAwesomeIcon
              icon={expanded ? faChevronLeft : faChevronRight}
              size="sm"
            />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 overflow-hidden">
          {NAV_ITEMS.map(item =>
            item.enabled ? (
              <NavLink
                key={item.to}
                to={item.to}
                title={!expanded ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg transition-colors text-sm ${
                    isActive
                      ? 'bg-[#005a9f] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  } ${!expanded ? 'justify-center' : ''}`
                }
              >
                <FontAwesomeIcon icon={item.icon} className="w-4 h-4 flex-shrink-0" />
                {expanded && <span>{item.label}</span>}
              </NavLink>
            ) : (
              <div
                key={item.to}
                title={!expanded ? `${item.label} (bientôt)` : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg text-slate-300 cursor-not-allowed text-sm select-none ${
                  !expanded ? 'justify-center' : ''
                }`}
              >
                <FontAwesomeIcon icon={item.icon} className="w-4 h-4 flex-shrink-0" />
                {expanded && (
                  <span className="flex items-center gap-2">
                    {item.label}
                    <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">
                      Bientôt
                    </span>
                  </span>
                )}
              </div>
            )
          )}
        </nav>

        {/* User + logout */}
        <div
          className={`border-t border-slate-100 p-3 flex items-center gap-3 ${
            !expanded ? 'justify-center' : ''
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-[#005a9f] text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {initials}
          </div>
          {expanded && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 truncate">{user?.email}</p>
              <p className="text-xs text-slate-400 capitalize">
                {role?.replace('_', ' ')}
              </p>
            </div>
          )}
          {expanded && (
            <button
              className="text-slate-400 hover:text-red-500 transition-colors"
              onClick={logout}
              title="Déconnexion"
            >
              <FontAwesomeIcon icon={faRightFromBracket} size="sm" />
            </button>
          )}
        </div>
      </aside>

      {/* ── Mobile bottom nav ────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex z-40 safe-area-inset-bottom">
        {NAV_ITEMS.filter(i => i.enabled).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-xs gap-1 ${
                isActive ? 'text-[#005a9f]' : 'text-slate-400'
              }`
            }
          >
            <FontAwesomeIcon icon={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          className="flex-1 flex flex-col items-center py-2 text-xs gap-1 text-slate-400"
          onClick={logout}
        >
          <FontAwesomeIcon icon={faRightFromBracket} />
          <span>Déco.</span>
        </button>
      </nav>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/shared/components/Sidebar.jsx
git commit -m "feat: add collapsible sidebar with mobile bottom nav"
```

---

## Task 8: Layout + App Routing

**Files:**
- Create: `frontend/src/shared/components/Layout.jsx`
- Create: `frontend/src/App.jsx`

- [ ] **Step 1: Create Layout**

```jsx
// frontend/src/shared/components/Layout.jsx
import Sidebar from './Sidebar'

export default function Layout({ children }) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Create App.jsx**

```jsx
// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './features/auth/hooks/useAuth'
import ProtectedRoute from './shared/components/ProtectedRoute'
import Layout from './shared/components/Layout'
import LoginPage from './features/auth/pages/LoginPage'
import DirectoryPage from './features/directory/pages/DirectoryPage'
import ListsPage from './features/directory/pages/ListsPage'
import ListDetailPage from './features/directory/pages/ListDetailPage'

function ComingSoon({ title }) {
  return (
    <div className="flex items-center justify-center h-full text-slate-400 text-lg">
      {title} — Bientôt disponible
    </div>
  )
}

function Protected({ children }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/annuaire" replace />} />
          <Route path="/annuaire" element={<Protected><DirectoryPage /></Protected>} />
          <Route path="/annuaire/listes" element={<Protected><ListsPage /></Protected>} />
          <Route path="/annuaire/listes/:id" element={<Protected><ListDetailPage /></Protected>} />
          <Route path="/missions" element={<Protected><ComingSoon title="Missions" /></Protected>} />
          <Route path="/dashboard" element={<Protected><ComingSoon title="Dashboard" /></Protected>} />
          <Route path="/settings" element={<Protected><ComingSoon title="Paramètres" /></Protected>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Create placeholder pages so the app compiles**

Create `frontend/src/features/directory/pages/DirectoryPage.jsx`:

```jsx
// frontend/src/features/directory/pages/DirectoryPage.jsx
export default function DirectoryPage() {
  return <div className="p-6 text-slate-500">Annuaire — en cours…</div>
}
```

Create `frontend/src/features/directory/pages/ListsPage.jsx`:

```jsx
// frontend/src/features/directory/pages/ListsPage.jsx
export default function ListsPage() {
  return <div className="p-6 text-slate-500">Listes — en cours…</div>
}
```

Create `frontend/src/features/directory/pages/ListDetailPage.jsx`:

```jsx
// frontend/src/features/directory/pages/ListDetailPage.jsx
export default function ListDetailPage() {
  return <div className="p-6 text-slate-500">Détail liste — en cours…</div>
}
```

- [ ] **Step 4: Run dev server and verify login flow works end to end**

```bash
npm run dev
```

- Navigate to `http://localhost:5173` — should redirect to `/login`
- Log in with a Supabase user — should land on `/annuaire` with the sidebar visible
- Confirm sidebar collapses/expands on click

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/components/Layout.jsx frontend/src/App.jsx frontend/src/features/directory/
git commit -m "feat: add layout, app routing, and placeholder pages"
```

---

## Task 9: useContacts Hook (TDD)

**Files:**
- Create: `frontend/src/features/directory/hooks/useContacts.js`
- Test: `frontend/src/__tests__/directory/useContacts.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/__tests__/directory/useContacts.test.js
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useContacts } from '../../features/directory/hooks/useContacts'

const mockContacts = [
  { id: '1', prenom: 'Marc', nom: 'Dupont', entreprise_actuelle: 'TotalEnergies' },
  { id: '2', prenom: 'Sophie', nom: 'Martin', entreprise_actuelle: 'Airbus' },
]

const newContact = { id: '3', prenom: 'Alice', nom: 'Leblanc', entreprise_actuelle: 'Safran' }

const mockFrom = {
  select: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: mockContacts, error: null }),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: newContact, error: null }),
}

vi.mock('../../shared/lib/supabase', () => ({
  supabase: { from: vi.fn(() => mockFrom) },
}))

describe('useContacts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('fetches contacts on mount and sets loading to false', async () => {
    const { result } = renderHook(() => useContacts())
    expect(result.current.loading).toBe(true)
    await act(async () => {})
    expect(result.current.contacts).toEqual(mockContacts)
    expect(result.current.loading).toBe(false)
  })

  it('createContact inserts and adds the new contact to state', async () => {
    const { result } = renderHook(() => useContacts())
    await act(async () => {})
    await act(async () => {
      await result.current.createContact({ prenom: 'Alice', nom: 'Leblanc' })
    })
    expect(result.current.contacts).toHaveLength(3)
    expect(result.current.contacts.find(c => c.id === '3')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- src/__tests__/directory/useContacts.test.js
```

Expected: FAIL — `Cannot find module '../../features/directory/hooks/useContacts'`

- [ ] **Step 3: Implement useContacts**

```js
// frontend/src/features/directory/hooks/useContacts.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useContacts() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('contacts').select('*').order('nom')
    if (error) setError(error.message)
    else setContacts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  async function createContact(contactData) {
    const { data, error } = await supabase
      .from('contacts')
      .insert(contactData)
      .select()
      .single()
    if (error) throw error
    setContacts(prev =>
      [...prev, data].sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? ''))
    )
    return data
  }

  return { contacts, loading, error, createContact, refetch: fetchContacts }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- src/__tests__/directory/useContacts.test.js
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/directory/hooks/useContacts.js frontend/src/__tests__/directory/useContacts.test.js
git commit -m "feat: add useContacts hook with tests"
```

---

## Task 10: ContactCard

**Files:**
- Create: `frontend/src/features/directory/components/ContactCard.jsx`

- [ ] **Step 1: Create ContactCard**

```jsx
// frontend/src/features/directory/components/ContactCard.jsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLinkedinIn } from '@fortawesome/free-brands-svg-icons'

export default function ContactCard({ contact, onClick, onContextMenu }) {
  const initials =
    `${contact.prenom?.[0] ?? ''}${contact.nom?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <div
      className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:shadow-md hover:border-[#005a9f] transition-all select-none"
      onClick={() => onClick(contact)}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, contact) }}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-[#005a9f] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 truncate">
            {contact.prenom} {contact.nom}
          </p>
          {contact.titre_poste && (
            <p className="text-xs text-slate-500 truncate">{contact.titre_poste}</p>
          )}
        </div>
      </div>

      {/* Company */}
      {contact.entreprise_actuelle && (
        <p className="text-sm text-slate-600 mb-2 truncate">{contact.entreprise_actuelle}</p>
      )}

      {/* Contact details */}
      <div className="space-y-0.5 mb-3">
        {contact.email && (
          <p className="text-xs text-[#005a9f] truncate">{contact.email}</p>
        )}
        {contact.telephone && (
          <p className="text-xs text-slate-500">{contact.telephone}</p>
        )}
      </div>

      {/* LinkedIn */}
      {contact.linkedin && (
        <a
          href={contact.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs bg-[#005a9f] text-white px-2.5 py-1 rounded hover:bg-[#004a8f] transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <FontAwesomeIcon icon={faLinkedinIn} />
          LinkedIn
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/directory/components/ContactCard.jsx
git commit -m "feat: add ContactCard component"
```

---

## Task 11: ContextMenu

**Files:**
- Create: `frontend/src/features/directory/components/ContextMenu.jsx`

- [ ] **Step 1: Create ContextMenu**

```jsx
// frontend/src/features/directory/components/ContextMenu.jsx
import { useState } from 'react'

export default function ContextMenu({
  x, y, lists,
  onViewProfile, onCopyEmail, onAddToList, onCreateList,
}) {
  const [showSub, setShowSub] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    await onCreateList(newName.trim())
    setCreating(false)
    setNewName('')
  }

  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[190px]"
      style={{ top: y, left: x }}
      onClick={e => e.stopPropagation()}
    >
      <button
        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        onClick={onViewProfile}
      >
        Voir le profil
      </button>

      <button
        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex justify-between items-center"
        onClick={() => setShowSub(v => !v)}
      >
        Ajouter à une liste…
        <span className="text-slate-400">›</span>
      </button>

      {showSub && (
        <div className="border-t border-slate-100">
          {lists.map(list => (
            <button
              key={list.id}
              className="w-full text-left px-6 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => onAddToList(list.id)}
            >
              {list.name}
            </button>
          ))}
          <div className="px-4 py-2 flex gap-2 border-t border-slate-100">
            <input
              autoFocus
              className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#005a9f]"
              placeholder="Nouvelle liste…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <button
              className="text-xs bg-[#005a9f] text-white px-2 py-1 rounded disabled:opacity-40"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? '…' : '+'}
            </button>
          </div>
        </div>
      )}

      <button
        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        onClick={onCopyEmail}
      >
        Copier l'email
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/directory/components/ContextMenu.jsx
git commit -m "feat: add ContextMenu with list sub-menu"
```

---

## Task 12: ContactModal

**Files:**
- Create: `frontend/src/features/directory/components/ContactModal.jsx`

- [ ] **Step 1: Create ContactModal**

```jsx
// frontend/src/features/directory/components/ContactModal.jsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { faLinkedinIn } from '@fortawesome/free-brands-svg-icons'

const FIELD_LABELS = [
  { key: 'email',                    label: 'Email' },
  { key: 'telephone',                label: 'Téléphone' },
  { key: 'entreprise_actuelle',      label: 'Entreprise' },
  { key: 'titre_poste',              label: 'Poste' },
  { key: 'ville',                    label: 'Ville' },
  { key: 'pays',                     label: 'Pays' },
  { key: 'diplomes',                 label: 'Diplômes' },
  { key: 'annee_obtention_diplome',  label: 'Année diplôme' },
  { key: 'id_profil',                label: 'ID Profil' },
]

export default function ContactModal({ contact, onClose }) {
  const initials =
    `${contact.prenom?.[0] ?? ''}${contact.nom?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:rounded-xl sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#005a9f] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              {initials}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {contact.prenom} {contact.nom}
              </h2>
              {contact.titre_poste && (
                <p className="text-slate-500 text-sm">{contact.titre_poste}</p>
              )}
              {contact.entreprise_actuelle && (
                <p className="text-slate-500 text-sm">{contact.entreprise_actuelle}</p>
              )}
            </div>
          </div>
          <button
            className="text-slate-400 hover:text-slate-600 p-1 flex-shrink-0"
            onClick={onClose}
            aria-label="Fermer"
          >
            <FontAwesomeIcon icon={faXmark} size="lg" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {FIELD_LABELS.filter(f => contact[f.key] != null && contact[f.key] !== '').map(f => (
            <div key={f.key}>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">{f.label}</p>
              <p className="text-slate-700">{contact[f.key]}</p>
            </div>
          ))}

          {contact.linkedin && (
            <a
              href={contact.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#005a9f] text-white px-4 py-2 rounded-lg hover:bg-[#004a8f] transition-colors text-sm mt-2"
            >
              <FontAwesomeIcon icon={faLinkedinIn} />
              Voir sur LinkedIn
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/directory/components/ContactModal.jsx
git commit -m "feat: add ContactModal with responsive bottom sheet on mobile"
```

---

## Task 13: ContactForm

**Files:**
- Create: `frontend/src/features/directory/components/ContactForm.jsx`

- [ ] **Step 1: Create ContactForm**

```jsx
// frontend/src/features/directory/components/ContactForm.jsx
import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'

const FIELDS = [
  { name: 'prenom',                   label: 'Prénom',          type: 'text',   required: true },
  { name: 'nom',                      label: 'Nom',             type: 'text',   required: true },
  { name: 'entreprise_actuelle',      label: 'Entreprise',      type: 'text' },
  { name: 'titre_poste',              label: 'Poste',           type: 'text' },
  { name: 'email',                    label: 'Email',           type: 'email' },
  { name: 'telephone',                label: 'Téléphone',       type: 'tel' },
  { name: 'linkedin',                 label: 'LinkedIn (URL)',  type: 'url' },
  { name: 'ville',                    label: 'Ville',           type: 'text' },
  { name: 'pays',                     label: 'Pays',            type: 'text' },
  { name: 'diplomes',                 label: 'Diplômes',        type: 'text' },
  { name: 'annee_obtention_diplome',  label: 'Année diplôme',  type: 'number' },
  { name: 'id_profil',               label: 'ID Profil',       type: 'text' },
]

export default function ContactForm({ onClose, onSubmit }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function handleChange(e, field) {
    const value =
      field.type === 'number'
        ? e.target.value === '' ? null : parseInt(e.target.value, 10)
        : e.target.value
    setForm(prev => ({ ...prev, [field.name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await onSubmit(form)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:rounded-xl sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-slate-800">Nouveau contact</h2>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="Fermer">
            <FontAwesomeIcon icon={faXmark} size="lg" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {FIELDS.map(field => (
            <div key={field.name}>
              <label className="block text-sm text-slate-600 mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <input
                type={field.type}
                required={field.required}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005a9f] focus:border-transparent"
                onChange={e => handleChange(e, field)}
              />
            </div>
          ))}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[#005a9f] text-white rounded-lg text-sm hover:bg-[#004a8f] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/directory/components/ContactForm.jsx
git commit -m "feat: add ContactForm modal"
```

---

## Task 14: DirectoryPage

> **Prerequisite:** Complete Task 15 (useProspectingLists hook) before this task — DirectoryPage imports it.

**Files:**
- Modify: `frontend/src/features/directory/pages/DirectoryPage.jsx` (replace placeholder)

- [ ] **Step 1: Replace placeholder with full DirectoryPage**

```jsx
// frontend/src/features/directory/pages/DirectoryPage.jsx
import { useState, useCallback, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { useContacts } from '../hooks/useContacts'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactCard from '../components/ContactCard'
import ContactModal from '../components/ContactModal'
import ContactForm from '../components/ContactForm'
import ContextMenu from '../components/ContextMenu'

export default function DirectoryPage() {
  const { contacts, loading, createContact } = useContacts()
  const { lists, createList, addContactToList } = useProspectingLists()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [focusedContact, setFocusedContact] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, contact }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const filtered = contacts.filter(c => {
    const q = debouncedSearch.toLowerCase()
    return (
      `${c.prenom ?? ''} ${c.nom ?? ''}`.toLowerCase().includes(q) ||
      (c.entreprise_actuelle ?? '').toLowerCase().includes(q) ||
      (c.titre_poste ?? '').toLowerCase().includes(q)
    )
  })

  const handleContextMenu = useCallback((e, contact) => {
    setContextMenu({ x: e.clientX, y: e.clientY, contact })
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  return (
    <div className="p-4 sm:p-6">
      {/* Search */}
      <div className="relative mb-6">
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005a9f] focus:border-transparent bg-white"
          placeholder="Rechercher par nom, entreprise, poste…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <p className="text-slate-400 text-center py-12">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(contact => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onClick={setFocusedContact}
              onContextMenu={handleContextMenu}
            />
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-slate-400 text-center py-12">
              Aucun contact trouvé.
            </p>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-[#005a9f] text-white rounded-full shadow-lg hover:bg-[#004a8f] transition-colors flex items-center justify-center text-xl"
        onClick={() => setShowForm(true)}
        aria-label="Ajouter un contact"
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          lists={lists}
          onViewProfile={() => { setFocusedContact(contextMenu.contact); setContextMenu(null) }}
          onCopyEmail={() => {
            navigator.clipboard.writeText(contextMenu.contact.email ?? '')
            setContextMenu(null)
          }}
          onAddToList={async listId => {
            await addContactToList(listId, contextMenu.contact.id)
            setContextMenu(null)
          }}
          onCreateList={async name => {
            const list = await createList(name)
            await addContactToList(list.id, contextMenu.contact.id)
            setContextMenu(null)
          }}
        />
      )}

      {/* Modals */}
      {focusedContact && (
        <ContactModal contact={focusedContact} onClose={() => setFocusedContact(null)} />
      )}
      {showForm && (
        <ContactForm onClose={() => setShowForm(false)} onSubmit={createContact} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

```bash
npm run dev
```

Navigate to `/annuaire`. You should see:
- Search bar
- Contact cards (if any contacts exist in Supabase)
- "+" FAB in bottom-right
- Right-click on a card → context menu appears
- Click a card → modal opens

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/directory/pages/DirectoryPage.jsx
git commit -m "feat: implement directory page with search, grid, and context menu"
```

---

## Task 15: useProspectingLists Hook (TDD)

**Files:**
- Create: `frontend/src/features/directory/hooks/useProspectingLists.js`
- Test: `frontend/src/__tests__/directory/useProspectingLists.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/__tests__/directory/useProspectingLists.test.js
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useProspectingLists } from '../../features/directory/hooks/useProspectingLists'

const mockLists = [
  { id: 'l1', name: 'Énergie Q2', created_at: '2026-04-01', prospecting_list_contacts: [{ count: 3 }] },
]
const newList = { id: 'l2', name: 'Nouveau', created_at: '2026-05-01' }

const mockListsFrom = {
  select: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: mockLists }),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: newList, error: null }),
}

const mockJunctionFrom = {
  insert: vi.fn().mockResolvedValue({ error: null }),
  delete: vi.fn().mockReturnThis(),
  match: vi.fn().mockResolvedValue({ error: null }),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
}

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(table =>
      table === 'prospecting_lists' ? mockListsFrom : mockJunctionFrom
    ),
  },
}))

describe('useProspectingLists', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches lists on mount', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await act(async () => {})
    expect(result.current.lists).toEqual(mockLists)
    expect(result.current.loading).toBe(false)
  })

  it('createList adds a new list to state', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await act(async () => {})
    await act(async () => { await result.current.createList('Nouveau') })
    expect(result.current.lists).toHaveLength(2)
    expect(result.current.lists[0].name).toBe('Nouveau')
  })

  it('addContactToList calls insert on junction table', async () => {
    const { supabase } = await import('../../shared/lib/supabase')
    const { result } = renderHook(() => useProspectingLists())
    await act(async () => {})
    await act(async () => { await result.current.addContactToList('l1', 'c1') })
    expect(supabase.from).toHaveBeenCalledWith('prospecting_list_contacts')
  })

  it('removeContactFromList calls delete on junction table', async () => {
    const { supabase } = await import('../../shared/lib/supabase')
    const { result } = renderHook(() => useProspectingLists())
    await act(async () => {})
    await act(async () => { await result.current.removeContactFromList('l1', 'c1') })
    expect(supabase.from).toHaveBeenCalledWith('prospecting_list_contacts')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- src/__tests__/directory/useProspectingLists.test.js
```

Expected: FAIL — `Cannot find module '../../features/directory/hooks/useProspectingLists'`

- [ ] **Step 3: Implement useProspectingLists**

```js
// frontend/src/features/directory/hooks/useProspectingLists.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useProspectingLists() {
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLists = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('prospecting_lists')
      .select('*, prospecting_list_contacts(count)')
      .order('created_at', { ascending: false })
    setLists(data ?? [])
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

  return {
    lists,
    loading,
    createList,
    addContactToList,
    removeContactFromList,
    fetchListContacts,
    refetch: fetchLists,
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- src/__tests__/directory/useProspectingLists.test.js
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/directory/hooks/useProspectingLists.js frontend/src/__tests__/directory/useProspectingLists.test.js
git commit -m "feat: add useProspectingLists hook with tests"
```

---

## Task 16: ListsPage

**Files:**
- Modify: `frontend/src/features/directory/pages/ListsPage.jsx` (replace placeholder)

- [ ] **Step 1: Replace placeholder with full ListsPage**

```jsx
// frontend/src/features/directory/pages/ListsPage.jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faList } from '@fortawesome/free-solid-svg-icons'
import { useProspectingLists } from '../hooks/useProspectingLists'

export default function ListsPage() {
  const { lists, loading, createList } = useProspectingLists()
  const [showInput, setShowInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    await createList(newName.trim())
    setNewName('')
    setShowInput(false)
    setCreating(false)
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Listes de prospection</h1>
        <button
          className="flex items-center gap-2 bg-[#005a9f] text-white px-4 py-2 rounded-lg hover:bg-[#004a8f] transition-colors text-sm"
          onClick={() => setShowInput(true)}
        >
          <FontAwesomeIcon icon={faPlus} />
          Nouvelle liste
        </button>
      </div>

      {showInput && (
        <div className="mb-6 flex gap-3">
          <input
            autoFocus
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005a9f]"
            placeholder="Nom de la liste…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <button
            className="px-4 py-2 bg-[#005a9f] text-white rounded-lg text-sm disabled:opacity-50"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
          >
            {creating ? '…' : 'Créer'}
          </button>
          <button
            className="px-4 py-2 text-slate-500 text-sm"
            onClick={() => { setShowInput(false); setNewName('') }}
          >
            Annuler
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400 text-center py-12">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {lists.map(list => (
            <Link
              key={list.id}
              to={`/annuaire/listes/${list.id}`}
              className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md hover:border-[#005a9f] transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#005a9f]/10 flex items-center justify-center flex-shrink-0">
                  <FontAwesomeIcon icon={faList} className="text-[#005a9f]" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{list.name}</p>
                  <p className="text-sm text-slate-500">
                    {list.prospecting_list_contacts?.[0]?.count ?? 0} contact(s)
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(list.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            </Link>
          ))}
          {lists.length === 0 && (
            <p className="col-span-full text-center text-slate-500 py-12">
              Aucune liste. Créez votre première liste de prospection.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add "Listes" nav link to Sidebar**

In `frontend/src/shared/components/Sidebar.jsx`, update `NAV_ITEMS` to add the lists sub-link. The cleanest approach is to add a second active item:

```jsx
// Replace the NAV_ITEMS array in Sidebar.jsx
const NAV_ITEMS = [
  { to: '/annuaire', icon: faAddressBook, label: 'Annuaire', enabled: true },
  { to: '/annuaire/listes', icon: faList, label: 'Listes', enabled: true },
  { to: '/missions', icon: faBriefcase, label: 'Missions', enabled: false },
  { to: '/dashboard', icon: faChartBar, label: 'Dashboard', enabled: false },
  { to: '/settings', icon: faGear, label: 'Paramètres', enabled: false },
]
```

Also add `faList` to the FontAwesome import at the top of Sidebar.jsx:

```jsx
import {
  faAddressBook,
  faBriefcase,
  faChartBar,
  faGear,
  faList,
  faRightFromBracket,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/directory/pages/ListsPage.jsx frontend/src/shared/components/Sidebar.jsx
git commit -m "feat: implement lists page and add lists nav item to sidebar"
```

---

## Task 17: ListDetailPage

**Files:**
- Modify: `frontend/src/features/directory/pages/ListDetailPage.jsx` (replace placeholder)

- [ ] **Step 1: Replace placeholder with full ListDetailPage**

```jsx
// frontend/src/features/directory/pages/ListDetailPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactCard from '../components/ContactCard'
import ContactModal from '../components/ContactModal'

export default function ListDetailPage() {
  const { id } = useParams()
  const { lists, fetchListContacts, removeContactFromList } = useProspectingLists()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [focusedContact, setFocusedContact] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)

  const list = lists.find(l => l.id === id)

  useEffect(() => {
    fetchListContacts(id).then(data => { setContacts(data); setLoading(false) })
  }, [id, fetchListContacts])

  const handleContextMenu = useCallback((e, contact) => {
    setContextMenu({ x: e.clientX, y: e.clientY, contact })
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  async function handleRemove(contactId) {
    await removeContactFromList(id, contactId)
    setContacts(prev => prev.filter(c => c.id !== contactId))
    setContextMenu(null)
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/annuaire/listes"
          className="text-slate-400 hover:text-[#005a9f] transition-colors"
          aria-label="Retour aux listes"
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">{list?.name ?? 'Liste'}</h1>
        <span className="text-slate-400 text-sm">{contacts.length} contact(s)</span>
      </div>

      {/* Grid */}
      {loading ? (
        <p className="text-slate-400 text-center py-12">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {contacts.map(contact => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onClick={setFocusedContact}
              onContextMenu={handleContextMenu}
            />
          ))}
          {contacts.length === 0 && (
            <p className="col-span-full text-center text-slate-500 py-12">
              Cette liste est vide. Ajoutez des contacts depuis l'Annuaire.
            </p>
          )}
        </div>
      )}

      {/* List-specific context menu (remove action only) */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => { setFocusedContact(contextMenu.contact); setContextMenu(null) }}
          >
            Voir le profil
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
            onClick={() => handleRemove(contextMenu.contact.id)}
          >
            Retirer de la liste
          </button>
        </div>
      )}

      {focusedContact && (
        <ContactModal contact={focusedContact} onClose={() => setFocusedContact(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify full flow in browser**

```bash
npm run dev
```

Test the following:
1. `/annuaire` → right-click a card → "Ajouter à une liste…" → create a new list
2. Navigate to `/annuaire/listes` → list appears with contact count
3. Click the list → `/annuaire/listes/:id` → contact cards visible
4. Right-click a contact → "Retirer de la liste" → card disappears

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/directory/pages/ListDetailPage.jsx
git commit -m "feat: implement list detail page with remove from list action"
```

---

## Task 18: Run Full Test Suite + Final Verification

- [ ] **Step 1: Run all tests**

```bash
cd frontend
npm test
```

Expected: All tests pass. Output should show:
- `src/__tests__/auth/useAuth.test.jsx` — 4 passed
- `src/__tests__/shared/ProtectedRoute.test.jsx` — 3 passed
- `src/__tests__/directory/useContacts.test.js` — 2 passed
- `src/__tests__/directory/useProspectingLists.test.js` — 4 passed

- [ ] **Step 2: Build verification**

```bash
npm run build
```

Expected: `dist/` created with no errors.

- [ ] **Step 3: Manual smoke test checklist**

- [ ] Login with a valid Supabase user → redirects to `/annuaire`
- [ ] Unauthenticated access to `/annuaire` → redirects to `/login`
- [ ] Sidebar collapses/expands on click
- [ ] On mobile (< 768px): sidebar replaced by bottom nav
- [ ] Search bar filters contacts in real time
- [ ] Click a contact card → modal opens with full profile
- [ ] Modal closes on backdrop click
- [ ] Right-click a card → context menu appears
- [ ] "Copier l'email" → copies to clipboard
- [ ] "Ajouter à une liste…" → shows existing lists + new list input
- [ ] FAB → opens add contact form → submit → card appears in grid
- [ ] `/annuaire/listes` → lists page loads
- [ ] Create a new list from lists page
- [ ] Click a list → detail page shows contacts
- [ ] Right-click in detail page → "Retirer de la liste" removes contact

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete phase 1 — auth, directory, and prospecting lists"
```
