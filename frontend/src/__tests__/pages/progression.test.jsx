import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const state = { client: null }
vi.mock('../../shared/lib/supabase', () => ({ get supabase() { return state.client } }))

import { makeSupabase } from '../helpers/supabaseMock'
import { AuthProvider } from '../../features/auth/hooks/useAuth'
import ProgressionPage from '../../features/directory/pages/ProgressionPage'
import { tauxConversion, trier } from '../../features/directory/hooks/useProspectionStats'

const APERCU = {
  contacts_total: 15737, contacts_touches: 120, demarches: 310,
  en_discussion: 14, convertis: 5, relances_en_retard: 3,
  membres_actifs_30j: 4, demarches_30j: 47,
}
const MEMBRES = [
  { membre_id: 'u1', membre_nom: 'Léah Toledano', role_code: 'respo_dev_co', demarches: 200,
    contacts_touches: 80, en_cours: 50, en_discussion: 10, rdv: 2, convertis: 4, perdus: 14,
    relances_en_retard: 2, derniere_activite: '2026-09-12T09:00:00Z' },
  { membre_id: 'u2', membre_nom: 'Ziad Balbzioui', role_code: 'chef_de_projet', demarches: 110,
    contacts_touches: 40, en_cours: 30, en_discussion: 4, rdv: 0, convertis: 1, perdus: 5,
    relances_en_retard: 1, derniere_activite: '2026-09-01T09:00:00Z' },
  { membre_id: 'u3', membre_nom: 'Adèle Abada', role_code: 'chef_de_projet', demarches: 0,
    contacts_touches: 0, en_cours: 0, en_discussion: 0, rdv: 0, convertis: 0, perdus: 0,
    relances_en_retard: 0, derniere_activite: null },
]
const ENTONNOIR = [
  { code: 'a_contacter', label: 'À contacter', rank: 10, n: 40 },
  { code: 'contacte', label: 'Contacté', rank: 20, n: 60 },
  { code: 'converti', label: 'Converti', rank: 60, n: 5 },
  { code: 'refuse', label: 'Refusé', rank: 80, n: 15 },
]
const ACTIVITE = [
  { semaine: '2026-08-31', demarches: 12, membres_actifs: 3, contacts_touches: 10 },
  { semaine: '2026-09-07', demarches: 0, membres_actifs: 0, contacts_touches: 0 },
]

function monter(over = {}) {
  state.client = makeSupabase({
    tables: { profiles: [{ id: 'u1', role: 'president' }] },
    rpcs: {
      my_permissions: ['admin.full'],
      prospection_overview: APERCU,
      prospection_funnel: ENTONNOIR,
      prospection_activity: ACTIVITE,
      prospection_by_member: MEMBRES,
      ...over,
    },
  })
  render(<MemoryRouter><AuthProvider><ProgressionPage /></AuthProvider></MemoryRouter>)
}

beforeEach(() => vi.clearAllMocks())

describe('Taux de conversion', () => {
  it('se rapporte aux contacts, pas aux démarches', () => {
    // Relancer trois fois la même personne ne doit pas faire chuter le taux.
    expect(tauxConversion({ contacts_touches: 80, convertis: 4, demarches: 200 })).toBe(0.05)
  })

  it('vaut null sans contact, plutôt que zéro ou NaN', () => {
    expect(tauxConversion({ contacts_touches: 0, convertis: 0 })).toBeNull()
  })
})

describe('Tri', () => {
  it('classe par la mesure demandée, puis par nom', () => {
    expect(trier(MEMBRES, 'demarches').map(m => m.membre_nom)).toEqual(
      ['Léah Toledano', 'Ziad Balbzioui', 'Adèle Abada'])
    expect(trier(MEMBRES, 'nom')[0].membre_nom).toBe('Adèle Abada')
  })
})

describe('Page Progression', () => {
  it('situe la couverture par rapport à tout l’annuaire', async () => {
    monter()
    await waitFor(() => expect(screen.getByText(/15 737 contacts démarchés/)).toBeInTheDocument())
    expect(screen.getByText(/15 617 jamais démarchés/)).toBeInTheDocument()
  })

  it('n’arrondit pas une couverture infime à 0 %', async () => {
    monter({ prospection_overview: { ...APERCU, contacts_touches: 3 } })
    await waitFor(() => expect(screen.getByText(/< 1 %/)).toBeInTheDocument())
  })

  it('masque les membres inactifs, mais dit combien ils sont', async () => {
    monter()
    await waitFor(() => expect(screen.getByText('Léah Toledano')).toBeInTheDocument())
    expect(screen.queryByText('Adèle Abada')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Voir les 1 inactifs'))
    expect(screen.getByText('Adèle Abada')).toBeInTheDocument()
  })

  it('signale les issues par une icône et un mot, jamais par la couleur seule', async () => {
    monter()
    await waitFor(() => expect(screen.getByText('Entonnoir')).toBeInTheDocument())
    // Vert et rouge se confondent en deutéranopie : le mot doit être là.
    expect(screen.getByText('gagné')).toBeInTheDocument()
    expect(screen.getByText('perdu')).toBeInTheDocument()
  })

  it('dit que rien n’est engagé au lieu d’un entonnoir vide', async () => {
    monter({ prospection_funnel: [] })
    await waitFor(() => expect(screen.getByText(/Aucune fiche n'a encore de statut/)).toBeInTheDocument())
  })

  it('demande le rythme sur douze semaines', async () => {
    monter()
    await waitFor(() => expect(screen.getByText('Rythme')).toBeInTheDocument())
    const appel = state.client.__calls.rpc.find(c => c.name === 'prospection_activity')
    expect(appel.args).toEqual({ semaines: 12 })
  })
})
