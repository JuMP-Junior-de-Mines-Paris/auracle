import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const state = { client: null }
vi.mock('../../shared/lib/supabase', () => ({
  get supabase() { return state.client },
}))

import { makeSupabase } from '../helpers/supabaseMock'
import { AuthProvider } from '../../features/auth/hooks/useAuth'
import ArchivesPage from '../../features/archives/pages/ArchivesPage'
import MissionsPage from '../../features/missions/pages/MissionsPage'

const MISSIONS = [
  { id: 'a1', title: 'CE-2026-014 — Recyclage des batteries', client_name: 'Acme Recyclage', status: 'archived', category: 'convention_etude', created_at: '2026-10-12T10:00:00Z', chef: null },
  { id: 'a2', title: 'Refonte du site vitrine', client_name: 'Boulangerie Lenôtre', status: 'archived', category: 'mission', created_at: '2025-06-01T10:00:00Z', chef: null },
  { id: 'a3', title: 'CE-2026-015 — Étude de marché', client_name: 'Zeta', status: 'archived', category: 'convention_etude', created_at: '2026-10-13T10:00:00Z', chef: null },
  { id: 'm1', title: 'Mission en cours', client_name: 'Total', status: 'active', category: 'mission', created_at: '2026-01-01T10:00:00Z', chef: null },
]

const ARCHIVES = MISSIONS.filter(m => m.status === 'archived')

// Le faux client ignore les filtres : l'écran d'archives reçoit donc d'emblée des lignes archivées.
function mount(ui, { tables = { missions: ARCHIVES, profiles: [] }, permissions = ['admin.full'] } = {}) {
  state.client = makeSupabase({ tables, rpcs: { my_permissions: permissions } })
  render(<MemoryRouter><AuthProvider>{ui}</AuthProvider></MemoryRouter>)
  return state.client
}

beforeEach(() => vi.clearAllMocks())

describe('Page Archives', () => {
  it('demande à la base uniquement les missions archivées', async () => {
    const sb = mount(<ArchivesPage />)
    await screen.findByText('Refonte du site vitrine')
    const requete = sb.from.mock.results.find((_, i) => sb.from.mock.calls[i][0] === 'missions').value
    expect(requete.eq).toHaveBeenCalledWith('status', 'archived')
  })

  it('liste les conventions et les missions archivées avec leur catégorie', async () => {
    mount(<ArchivesPage />)
    expect(await screen.findByText('CE-2026-014 — Recyclage des batteries')).toBeInTheDocument()
    expect(screen.getByText('Refonte du site vitrine')).toBeInTheDocument()
    expect(screen.getAllByText('Convention d’étude', { selector: 'span span, td span' }).length).toBeGreaterThan(0)
  })

  it('compte les archives par catégorie et filtre au clic', async () => {
    mount(<ArchivesPage />)
    await screen.findByText('Refonte du site vitrine')
    expect(screen.getByRole('button', { name: /Toutes \(3\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Convention d’étude \(2\)/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Convention d’étude \(2\)/ }))
    expect(screen.getByText('CE-2026-014 — Recyclage des batteries')).toBeInTheDocument()
    expect(screen.getByText('CE-2026-015 — Étude de marché')).toBeInTheDocument()
    expect(screen.queryByText('Refonte du site vitrine')).not.toBeInTheDocument()
  })

  it('recherche par titre ou par client, sans tenir compte des accents', async () => {
    mount(<ArchivesPage />)
    await screen.findByText('Refonte du site vitrine')
    await userEvent.type(screen.getByLabelText('Rechercher dans les archives'), 'lenotre')
    expect(screen.getByText('Refonte du site vitrine')).toBeInTheDocument()
    expect(screen.queryByText('CE-2026-014 — Recyclage des batteries')).not.toBeInTheDocument()
  })

  it('dit quand rien ne correspond, et quand il n’y a aucune archive', async () => {
    mount(<ArchivesPage />)
    await screen.findByText('Refonte du site vitrine')
    await userEvent.type(screen.getByLabelText('Rechercher dans les archives'), 'zzzz')
    expect(screen.getByText('Aucune archive ne correspond.')).toBeInTheDocument()
  })

  it('affiche l’état vide', async () => {
    mount(<ArchivesPage />, { tables: { missions: [] } })
    expect(await screen.findByText('Aucune archive pour le moment.')).toBeInTheDocument()
  })
})

describe('Page Missions', () => {
  it('ne montre pas les missions archivées : elles vivent dans les archives', async () => {
    mount(<MissionsPage />, { tables: { missions: MISSIONS, profiles: [] } })
    expect(await screen.findByText('Mission en cours')).toBeInTheDocument()
    expect(screen.queryByText('Refonte du site vitrine')).not.toBeInTheDocument()
    expect(screen.queryByText('CE-2026-014 — Recyclage des batteries')).not.toBeInTheDocument()
  })

  it('renvoie vers les archives', async () => {
    mount(<MissionsPage />, { tables: { missions: MISSIONS, profiles: [] } })
    await screen.findByText('Mission en cours')
    expect(within(document.body).getByRole('button', { name: /Archives/ })).toBeInTheDocument()
  })
})
