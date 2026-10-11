import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const state = { client: null }
vi.mock('../../shared/lib/supabase', () => ({ get supabase() { return state.client } }))

import { makeSupabase } from '../helpers/supabaseMock'
import { AuthProvider } from '../../features/auth/hooks/useAuth'
import { ToastProvider } from '../../shared/components/ToastProvider'
import SegmentsPage from '../../features/directory/pages/SegmentsPage'
import { nettoyer, resumer, estVide, CRITERES_VIDES } from '../../features/directory/hooks/useSegments'

const FACETTES = {
  promo: { min: 1920, max: 2021 },
  entreprises: [{ valeur: 'EDF', n: 266 }, { valeur: 'TotalEnergies', n: 112 }],
  diplomes: [{ valeur: 'Matériaux', n: 597 }],
  villes: [{ valeur: '75000 Paris', n: 1085 }],
  pays: [{ valeur: 'France', n: 9000 }],
}

function monter(rpcs = {}) {
  state.client = makeSupabase({
    tables: { profiles: [{ id: 'u1', role: 'president' }], segments: [], prospecting_lists: [] },
    rpcs: {
      my_permissions: ['admin.full'],
      contact_facets: FACETTES,
      count_contacts: 1334,
      search_segment: [],
      ...rpcs,
    },
  })
  render(<MemoryRouter><ToastProvider><AuthProvider><SegmentsPage /></AuthProvider></ToastProvider></MemoryRouter>)
  return state.client
}

beforeEach(() => vi.clearAllMocks())

describe('Critères', () => {
  it('ne garde que ce qui filtre réellement', () => {
    expect(nettoyer({ ...CRITERES_VIDES, q: 'edf', promo_min: 2010 }))
      .toEqual({ q: 'edf', promo_min: 2010 })
    // Un tableau vide, un false, un null : autant de critères absents.
    expect(nettoyer(CRITERES_VIDES)).toEqual({})
    expect(estVide(CRITERES_VIDES)).toBe(true)
  })

  it('résume un segment sans avoir à le déplier', () => {
    const r = resumer({ promo_min: 2010, promo_max: 2021, entreprises: ['EDF'], jamais_demarche: true })
    expect(r).toContain('promo 2010–2021')
    expect(r).toContain('EDF')
    expect(r).toContain('jamais démarchés')
  })

  it('tronque une longue liste plutôt que d’étaler', () => {
    expect(resumer({ villes: ['a', 'b', 'c', 'd'] })).toContain('+2')
  })

  it('le dit quand rien n’est filtré', () => {
    expect(resumer({})).toBe('aucun critère')
  })
})

describe('Page Segments', () => {
  it('annonce le volume du segment courant', async () => {
    monter()
    await waitFor(() => expect(screen.getByText('1 334')).toBeInTheDocument())
  })

  it('propose les valeurs réelles avec leur poids', async () => {
    monter()
    await waitFor(() => expect(screen.getByText(/EDF/)).toBeInTheDocument())
    expect(screen.getByText('266')).toBeInTheDocument()
    expect(screen.getByText(/TotalEnergies/)).toBeInTheDocument()
  })

  it('cliquer une valeur l’ajoute aux critères envoyés', async () => {
    const sb = monter()
    await waitFor(() => expect(screen.getByText(/EDF/)).toBeInTheDocument())
    await userEvent.click(screen.getByText(/EDF/))

    await waitFor(() => {
      const appels = sb.__calls.rpc.filter(c => c.name === 'count_contacts')
      const dernier = appels[appels.length - 1]
      expect(dernier.args.criteria.entreprises).toEqual(['EDF'])
    })
  })

  it('n’enregistre pas un segment sans critère', async () => {
    monter()
    await waitFor(() => expect(screen.getByText('Réinitialiser')).toBeInTheDocument())
    expect(screen.getByText('Enregistrer').closest('button')).toBeDisabled()
  })

  it('dit de relâcher un critère plutôt que d’afficher un vide', async () => {
    monter({ count_contacts: 0, search_segment: [] })
    await waitFor(() => expect(screen.getByText(/Relâchez un critère/)).toBeInTheDocument())
  })
})
