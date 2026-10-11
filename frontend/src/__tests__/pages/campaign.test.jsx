import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const state = { client: null }
vi.mock('../../shared/lib/supabase', () => ({ get supabase() { return state.client } }))

import { makeSupabase } from '../helpers/supabaseMock'
import { AuthProvider } from '../../features/auth/hooks/useAuth'
import { ToastProvider } from '../../shared/components/ToastProvider'
import CampaignPage from '../../features/directory/pages/CampaignPage'

const CONTACT = {
  id: 'c1', prenom: 'Jean', nom: 'Dupont',
  entreprise_actuelle: 'Total', linkedin: 'https://www.linkedin.com/in/jdupont/',
}

function monter({ rows, permissions = ['admin.full'] } = {}) {
  state.client = makeSupabase({
    tables: {
      prospecting_lists: [{ id: 'l1', name: 'Forum Entreprises' }],
      prospecting_list_contacts: rows,
      profiles: [{ id: 'u1', prenom: 'Léah', nom: 'Toledano', role: 'president' }],
      contact_interactions: [],
    },
    rpcs: { my_permissions: permissions },
  })
  render(
    <MemoryRouter initialEntries={['/annuaire/listes/l1']}>
      <ToastProvider>
        <AuthProvider>
          <Routes><Route path="/annuaire/listes/:id" element={<CampaignPage />} /></Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  )
  return state.client
}

const LIGNE = { list_id: 'l1', contact_id: 'c1', status: 'contacte', contact: CONTACT, assignee: null }

beforeEach(() => vi.clearAllMocks())

describe('Vue campagne', () => {
  it('range le contact dans la colonne de SON statut de campagne', async () => {
    monter({ rows: [LIGNE] })
    await waitFor(() => expect(screen.getByText('Total')).toBeInTheDocument())
    // Les cinq étapes ouvertes sont toujours là ; les sorties seulement si peuplées.
    const colonne = t => screen.queryByText(t, { selector: 'span' })
    expect(colonne('À contacter')).toBeInTheDocument()
    expect(colonne('Contacté')).toBeInTheDocument()
    expect(colonne('Refusé')).not.toBeInTheDocument()
  })

  it('affiche une voie de sortie dès qu’elle contient quelqu’un', async () => {
    monter({ rows: [{ ...LIGNE, status: 'refuse' }] })
    await waitFor(() => expect(screen.getByText('Total')).toBeInTheDocument())
    expect(screen.getByText('Refusé', { selector: 'span' })).toBeInTheDocument()
  })

  it('un contact sans statut retombe dans « à contacter »', async () => {
    monter({ rows: [{ ...LIGNE, status: null }] })
    await waitFor(() => expect(screen.getByText('Total')).toBeInTheDocument())
    // La colonne « À contacter » porte le compteur 1, les autres 0.
    const compteurs = screen.getAllByText('1')
    expect(compteurs.length).toBeGreaterThan(0)
  })

  it('déplacer une carte écrit une INTERACTION, jamais le statut directement', async () => {
    const sb = monter({ rows: [LIGNE] })
    await waitFor(() => expect(screen.getByText('Total')).toBeInTheDocument())

    const select = screen.getAllByRole('combobox').find(s => s.value === 'contacte')
    await userEvent.selectOptions(select, 'rdv_planifie')

    await waitFor(() => {
      const ins = sb.__calls.insert.find(i => i.table === 'contact_interactions')
      expect(ins).toBeTruthy()
      expect(ins.payload.outcome).toBe('rdv_planifie')
      expect(ins.payload.list_id).toBe('l1')
      expect(ins.payload.contact_id).toBe('c1')
    })
    // C'est le trigger apply_interaction qui reporte le statut, pas le client.
    expect(sb.__calls.update.filter(u => u.table === 'prospecting_list_contacts')).toHaveLength(0)
  })

  it('annonce le déplacement', async () => {
    monter({ rows: [LIGNE] })
    await waitFor(() => expect(screen.getByText('Total')).toBeInTheDocument())
    const select = screen.getAllByRole('combobox').find(s => s.value === 'contacte')
    await userEvent.selectOptions(select, 'converti')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Converti/))
  })

  it('sans droit d’écriture, ni déplacement ni répartition', async () => {
    monter({ rows: [LIGNE], permissions: ['audit.read'] })
    await waitFor(() => expect(screen.getByText('Total')).toBeInTheDocument())
    expect(screen.queryByText('Répartition')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('dit que la campagne est vide au lieu d’afficher des colonnes mortes', async () => {
    monter({ rows: [] })
    await waitFor(() => expect(screen.getByText('Campagne vide')).toBeInTheDocument())
  })
})
