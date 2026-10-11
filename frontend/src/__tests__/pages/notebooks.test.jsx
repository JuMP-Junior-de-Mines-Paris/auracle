import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const state = { client: null }
vi.mock('../../shared/lib/supabase', () => ({ get supabase() { return state.client } }))

import { makeSupabase } from '../helpers/supabaseMock'
import { AuthProvider } from '../../features/auth/hooks/useAuth'
import { ToastProvider } from '../../shared/components/ToastProvider'
import NotebooksPage from '../../features/notebooks/pages/NotebooksPage'
import NotebookPage from '../../features/notebooks/pages/NotebookPage'
import { porteeMeta, PORTEES } from '../../features/notebooks/hooks/useNotebooks'

const CARNET = {
  id: 'n1', title: 'Réunions de bureau', description: 'Comptes rendus hebdomadaires',
  icon: '📓', visibility: 'bureau', archived: false, created_by: 'u1',
  auteur_prenom: 'Léah', auteur_nom: 'Toledano',
  nb_notes: 3, nb_todos: 5, nb_todos_ouverts: 2,
  derniere_activite: '2026-09-10T10:00:00Z', created_at: '2026-09-01T10:00:00Z',
}

function monter(ui, { tables = {}, route = '/carnets', chemin = '/carnets' } = {}) {
  state.client = makeSupabase({
    tables: { profiles: [{ id: 'u1', prenom: 'Léah', nom: 'Toledano', role: 'president' }], ...tables },
    rpcs: { my_permissions: ['admin.full'] },
  })
  render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider><AuthProvider>
        <Routes><Route path={chemin} element={ui} /></Routes>
      </AuthProvider></ToastProvider>
    </MemoryRouter>
  )
  return state.client
}

beforeEach(() => vi.clearAllMocks())

describe('Portées de partage', () => {
  it('couvre les deux cercles et les deux extrêmes', () => {
    expect(PORTEES.map(p => p.code)).toEqual(['prive', 'bureau', 'bureau_etendu', 'tous'])
  })

  it('retombe sur « bureau » pour une portée inconnue — jamais sur « tous »', () => {
    // Un défaut trop ouvert exposerait un carnet ; trop fermé ne fait que gêner.
    expect(porteeMeta('nimporte_quoi').code).toBe('bureau')
    expect(porteeMeta(undefined).code).toBe('bureau')
  })
})

describe('Liste des carnets', () => {
  it('situe un carnet sans avoir à l’ouvrir', async () => {
    monter(<NotebooksPage />, { tables: { notebooks_overview: [CARNET] } })
    await waitFor(() => expect(screen.getByText('Réunions de bureau')).toBeInTheDocument())
    expect(screen.getByText('Comptes rendus hebdomadaires')).toBeInTheDocument()
    expect(screen.getByText('3 notes')).toBeInTheDocument()
    expect(screen.getByText('2 / 5 à faire')).toBeInTheDocument()
    expect(screen.getByText('Bureau')).toBeInTheDocument()
  })

  it('crée un carnet « bureau » par défaut', async () => {
    const sb = monter(<NotebooksPage />, { tables: { notebooks_overview: [] } })
    await waitFor(() => expect(screen.getByText('Aucun carnet')).toBeInTheDocument())

    await userEvent.click(screen.getByText('Nouveau carnet'))
    await userEvent.type(screen.getByPlaceholderText(/Titre du carnet/), 'Passation')
    await userEvent.click(screen.getByText('Créer le carnet'))

    await waitFor(() => {
      const ins = sb.__calls.insert.find(i => i.table === 'notebooks')
      expect(ins.payload.title).toBe('Passation')
      expect(ins.payload.visibility).toBe('bureau')
    })
  })

  it('propose les quatre portées à la création', async () => {
    monter(<NotebooksPage />, { tables: { notebooks_overview: [] } })
    await waitFor(() => expect(screen.getByText('Aucun carnet')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Nouveau carnet'))
    for (const p of PORTEES) {
      expect(screen.getAllByText(p.label).length).toBeGreaterThan(0)
    }
  })
})

describe('Un carnet', () => {
  const ouvrir = (tables = {}) => monter(<NotebookPage />, {
    route: '/carnets/n1', chemin: '/carnets/:id',
    tables: { notebooks_overview: [CARNET], notebook_shares: [], notes: [], tasks: [], ...tables },
  })

  it('affiche les notes et les points à faire côte à côte', async () => {
    ouvrir()
    await waitFor(() => expect(screen.getByText('Réunions de bureau')).toBeInTheDocument())
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText(/À faire/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Compte rendu, décision/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Un point à traiter…')).toBeInTheDocument()
  })

  it('un point ajouté est une TÂCHE rattachée au carnet', async () => {
    const sb = ouvrir()
    await waitFor(() => expect(screen.getByPlaceholderText('Un point à traiter…')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText('Un point à traiter…'), 'Relancer le partenaire')
    await userEvent.click(screen.getByRole('button', { name: '' }).closest('form').querySelector('button[type=submit]'))

    await waitFor(() => {
      const ins = sb.__calls.insert.find(i => i.table === 'tasks')
      expect(ins.payload.title).toBe('Relancer le partenaire')
      // Rattachée au carnet, pas à une mission : c'est ce qui la fait
      // remonter dans « Mes tâches » sans l'inventer ailleurs.
      expect(ins.payload.notebook_id).toBe('n1')
      expect(ins.payload.mission_id).toBeNull()
    })
  })

  it('une note du carnet est une note polymorphe, pas une table de plus', async () => {
    const sb = ouvrir()
    await waitFor(() => expect(screen.getByPlaceholderText(/Compte rendu, décision/)).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText(/Compte rendu, décision/), 'Budget validé')
    await userEvent.click(screen.getByText('Ajouter'))

    await waitFor(() => {
      const ins = sb.__calls.insert.find(i => i.table === 'notes')
      expect(ins.payload.entity_type).toBe('notebook')
      expect(ins.payload.entity_id).toBe('n1')
      expect(ins.payload.content).toBe('Budget validé')
    })
  })

  it('dit pourquoi on ne voit pas un carnet, au lieu d’une page vide', async () => {
    monter(<NotebookPage />, {
      route: '/carnets/inconnu', chemin: '/carnets/:id',
      tables: { notebooks_overview: [], notebook_shares: [], notes: [], tasks: [] },
    })
    await waitFor(() => expect(screen.getByText('Carnet introuvable')).toBeInTheDocument())
    expect(screen.getByText(/portée ne vous inclut pas/)).toBeInTheDocument()
  })
})
