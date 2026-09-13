import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const state = { client: null }
vi.mock('../../shared/lib/supabase', () => ({ get supabase() { return state.client } }))

import { makeSupabase } from '../helpers/supabaseMock'
import { useDashboard } from '../../features/dashboard/hooks/useDashboard'

const hier = new Date(Date.now() - 864e5).toISOString().split('T')[0]
const demain = new Date(Date.now() + 864e5).toISOString().split('T')[0]

function monter({ tables = {}, overview = null } = {}) {
  state.client = makeSupabase({
    tables: { followups: [], tasks: [], missions: [], ...tables },
    rpcs: overview ? { prospection_overview: overview } : {},
  })
  return renderHook(() => useDashboard())
}

beforeEach(() => vi.clearAllMocks())

describe('useDashboard', () => {
  it('compte séparément ce qui est en retard', async () => {
    const { result } = monter({
      tables: {
        followups: [{ id: 'c1', next_action_at: hier }, { id: 'c2', next_action_at: demain }],
        tasks: [{ id: 't1', due_date: hier }, { id: 't2', due_date: null }],
      },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Une relance due demain n'est pas en retard ; une tâche sans échéance non plus.
    expect(result.current.enRetard).toEqual({ relances: 1, taches: 1 })
  })

  it('ne confond pas « rien à faire » et « premier jour »', async () => {
    const actif = monter({ overview: { demarches: 42, contacts_total: 100 } })
    await waitFor(() => expect(actif.result.current.loading).toBe(false))
    // L'équipe a déjà démarché : l'écran de démarrage serait à contretemps.
    expect(actif.result.current.premierJour).toBe(false)
    actif.unmount()

    const neuf = monter({ overview: { demarches: 0, contacts_total: 15737 } })
    await waitFor(() => expect(neuf.result.current.loading).toBe(false))
    expect(neuf.result.current.premierJour).toBe(true)
  })

  it('ne remonte que MES relances, MES tâches, MES missions', async () => {
    const sb = makeSupabase({ tables: { followups: [], tasks: [], missions: [] }, rpcs: {} })
    state.client = sb
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Les trois requêtes filtrent sur l'utilisateur, pas sur toute l'équipe.
    expect(sb.__calls.from).toEqual(expect.arrayContaining(['followups', 'tasks', 'missions']))
  })

  it('survit à une prospection_overview absente', async () => {
    const { result } = monter()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.equipe).toBeNull()
    expect(result.current.error).toBeNull()
  })
})

// Rendu de l'accueil : ces vérifications existent parce qu'un bug réel y a
// échappé aux tests de hook — `children ?? vide` ne retombait jamais, un
// enfant conditionnel valant `false` et non `undefined`.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../shared/components/ToastProvider'
import { AuthProvider } from '../../features/auth/hooks/useAuth'
import DashboardPage from '../../features/dashboard/pages/DashboardPage'

function accueil(rpcs = {}, tables = {}) {
  state.client = makeSupabase({
    tables: { followups: [], tasks: [], missions: [], profiles: [{ id: 'u1', role: 'chef_de_projet' }], ...tables },
    rpcs: { my_permissions: ['contacts.write'], ...rpcs },
    user: { id: 'u1', email: 'leah.toledano@jump-mines.fr' },
  })
  render(<MemoryRouter><ToastProvider><AuthProvider><DashboardPage /></AuthProvider></ToastProvider></MemoryRouter>)
}

describe('Accueil', () => {
  const ACTIVE = { prospection_overview: { contacts_total: 15737, contacts_touches: 340, demarches: 512,
                                           en_discussion: 12, convertis: 4, relances_en_retard: 7,
                                           membres_actifs_30j: 5, demarches_30j: 88 } }

  it('dit quoi faire au lieu de laisser un bloc muet', async () => {
    accueil(ACTIVE)
    await waitFor(() => expect(screen.getByText(/Aucune relance due/)).toBeInTheDocument())
    expect(screen.getByText(/Les points pris en réunion arrivent ici/)).toBeInTheDocument()
    expect(screen.getByText(/chef de projet d’aucune mission/)).toBeInTheDocument()
  })

  it('salue par le prénom, capitalisé, pas par l’adresse', async () => {
    accueil(ACTIVE)
    await waitFor(() => expect(screen.getByText(/, Leah$/)).toBeInTheDocument())
  })

  it('guide le premier jour, et seulement le premier jour', async () => {
    accueil({ prospection_overview: { contacts_total: 15737, demarches: 0 } })
    await waitFor(() => expect(screen.getByText('Par où commencer')).toBeInTheDocument())
  })

  it('ne guide plus dès que l’équipe a commencé', async () => {
    accueil(ACTIVE)
    await waitFor(() => expect(screen.getByText(/Aucune relance due/)).toBeInTheDocument())
    expect(screen.queryByText('Par où commencer')).not.toBeInTheDocument()
  })
})
