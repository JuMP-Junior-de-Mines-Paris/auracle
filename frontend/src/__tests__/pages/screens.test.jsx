import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Le mock doit exister avant l'import des modules qui s'en servent.
const state = { client: null }
vi.mock('../../shared/lib/supabase', () => ({
  get supabase() { return state.client },
}))

import { makeSupabase } from '../helpers/supabaseMock'
import { AuthProvider } from '../../features/auth/hooks/useAuth'
import AdminPage from '../../features/admin/pages/AdminPage'
import DuplicatesPage from '../../features/directory/pages/DuplicatesPage'
import TasksPage from '../../features/tasks/pages/TasksPage'
import InteractionPanel from '../../features/directory/components/InteractionPanel'

const ROLES = [
  { code: 'president', label: 'Président·e', groupe: 'bureau', rank: 10 },
  { code: 'respo_dev_co', label: 'Resp. dév. commercial', groupe: 'bureau_etendu', rank: 60 },
  { code: 'chef_de_projet', label: 'Chef·fe de projet', groupe: 'membre', rank: 90 },
]
const PERMS = [
  { code: 'admin.full', label: 'Tous les droits', category: 'Système' },
  { code: 'contacts.merge', label: 'Fusionner des doublons', category: 'Annuaire' },
]

function mount(ui, { permissions = ['admin.full'], tables = {}, rpcs = {} } = {}) {
  state.client = makeSupabase({
    tables,
    rpcs: { my_permissions: permissions, ...rpcs },
  })
  render(
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  )
  return state.client
}

beforeEach(() => vi.clearAllMocks())

describe('Console d\'administration', () => {
  const tables = {
    profiles: [
      { id: 'u1', prenom: 'Léah', nom: 'Toledano', email: 'leah@jump-mines.fr', role: 'president' },
      { id: 'u2', prenom: 'Ziad', nom: 'Balbzioui', email: 'ziad@jump-mines.fr', role: 'chef_de_projet' },
    ],
    roles: ROLES,
    permissions: PERMS,
    role_permissions: [{ role_code: 'president', permission_code: 'admin.full' }],
    audit_log: [],
  }

  it('liste les membres avec leur cercle', async () => {
    mount(<AdminPage />, { tables })
    await waitFor(() => expect(screen.getByText('leah@jump-mines.fr')).toBeInTheDocument())
    // « Membres » est à la fois un onglet et un cercle : on cible la cellule.
    expect(screen.getByText('Bureau', { selector: 'td' })).toBeInTheDocument()
    expect(screen.getByText('Membres', { selector: 'td' })).toBeInTheDocument()
    expect(screen.getByText('ziad@jump-mines.fr')).toBeInTheDocument()
  })

  it('passe le changement de rôle par la RPC, pas par un update direct', async () => {
    const sb = mount(<AdminPage />, { tables, rpcs: { set_member_role: null } })
    await waitFor(() => expect(screen.getByText('leah@jump-mines.fr')).toBeInTheDocument())

    const selects = screen.getAllByRole('combobox')
    await userEvent.selectOptions(selects[0], 'chef_de_projet')

    await waitFor(() => {
      expect(sb.__calls.rpc.some(c => c.name === 'set_member_role')).toBe(true)
    })
    // 007 a retiré `role` des colonnes écrivables : un update direct échouerait.
    expect(sb.__calls.update.filter(u => u.table === 'profiles')).toHaveLength(0)
  })

  it('masque les onglets dont la permission manque', async () => {
    mount(<AdminPage />, { tables, permissions: ['members.set_role'] })
    await waitFor(() => expect(screen.getByText('Membres', { selector: 'button' })).toBeInTheDocument())
    expect(screen.queryByText('Permissions', { selector: 'button' })).not.toBeInTheDocument()
    expect(screen.queryByText('Journal', { selector: 'button' })).not.toBeInTheDocument()
  })

  it('la matrice écrit dans role_permissions quand on coche', async () => {
    const sb = mount(<AdminPage />, { tables })
    await waitFor(() => expect(screen.getByText('leah@jump-mines.fr')).toBeInTheDocument())

    await userEvent.click(screen.getByText('Permissions', { selector: 'button' }))
    await waitFor(() => expect(screen.getByText('Fusionner des doublons')).toBeInTheDocument())

    const cases = screen.getAllByRole('checkbox')
    await userEvent.click(cases.find(c => !c.checked))

    await waitFor(() => {
      expect(sb.__calls.insert.some(i => i.table === 'role_permissions')).toBe(true)
    })
  })
})

describe('Page Doublons', () => {
  const contacts = [
    { id: 'c1', prenom: 'Jean', nom: 'Dupont', email: 'j@x.fr', entreprise_actuelle: 'Total', telephone: '0102030405', ville: 'Paris' },
    { id: 'c2', prenom: 'Jean', nom: 'Dupont', email: 'j@x.fr', entreprise_actuelle: null, telephone: null },
  ]

  it('propose la fiche la plus complète comme maître', async () => {
    mount(<DuplicatesPage />, {
      tables: {
        duplicate_clusters: [{ cle: 'email', valeur: 'j@x.fr', n: 2, contact_ids: ['c1', 'c2'] }],
        contacts,
      },
    })
    await waitFor(() => expect(screen.getByText('Même adresse e-mail')).toBeInTheDocument())

    // c1 a plus de champs renseignés : c'est lui qui doit être coché.
    const radios = screen.getAllByRole('radio')
    expect(radios[0].checked).toBe(true)
    expect(radios[1].checked).toBe(false)
  })

  it('appelle merge_contacts avec le maître et les doublons', async () => {
    const sb = mount(<DuplicatesPage />, {
      tables: {
        duplicate_clusters: [{ cle: 'email', valeur: 'j@x.fr', n: 2, contact_ids: ['c1', 'c2'] }],
        contacts,
      },
      rpcs: { merge_contacts: null },
    })
    await waitFor(() => expect(screen.getByText('Fusionner')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Fusionner'))

    await waitFor(() => {
      const call = sb.__calls.rpc.find(c => c.name === 'merge_contacts')
      expect(call).toBeTruthy()
      expect(call.args).toEqual({ master_id: 'c1', duplicate_ids: ['c2'] })
    })
  })

  it('cache le bouton de fusion sans la permission', async () => {
    mount(<DuplicatesPage />, {
      permissions: ['contacts.write'],
      tables: {
        duplicate_clusters: [{ cle: 'email', valeur: 'j@x.fr', n: 2, contact_ids: ['c1', 'c2'] }],
        contacts,
      },
    })
    await waitFor(() => expect(screen.getByText('Même adresse e-mail')).toBeInTheDocument())
    expect(screen.queryByText('Fusionner')).not.toBeInTheDocument()
    expect(screen.getByText(/permission/i)).toBeInTheDocument()
  })

  it('annonce un annuaire propre plutôt qu\'une page vide', async () => {
    mount(<DuplicatesPage />, { tables: { duplicate_clusters: [], contacts: [] } })
    await waitFor(() => expect(screen.getByText('Aucun doublon')).toBeInTheDocument())
  })
})

describe('Page Tâches', () => {
  const hier = new Date(Date.now() - 864e5).toISOString().split('T')[0]

  const tables = {
    tasks: [
      { id: 't1', title: 'Relancer Total', status: 'a_faire', priority: 'haute', due_date: hier, assigned_to: 'u1', mission: null },
      { id: 't2', title: 'Rédiger la CE', status: 'termine', priority: 'normale', due_date: null, assigned_to: 'u1', mission: null },
    ],
    profiles: [{ id: 'u1', prenom: 'Léah', nom: 'Toledano', role: 'president' }],
  }

  it('met le retard en tête et sort les tâches closes de la liste', async () => {
    mount(<TasksPage />, { tables })
    await waitFor(() => expect(screen.getByText('Relancer Total')).toBeInTheDocument())

    expect(screen.getByText(/En retard/)).toBeInTheDocument()
    // La tâche terminée est repliée derrière son compteur, pas affichée.
    expect(screen.queryByText('Rédiger la CE')).not.toBeInTheDocument()
    expect(screen.getByText(/1 tâche terminée/)).toBeInTheDocument()
  })

  it('cocher une tâche la passe à terminée', async () => {
    const sb = mount(<TasksPage />, { tables })
    await waitFor(() => expect(screen.getByText('Relancer Total')).toBeInTheDocument())

    await userEvent.click(screen.getAllByRole('checkbox')[0])
    await waitFor(() => {
      const maj = sb.__calls.update.find(u => u.table === 'tasks')
      expect(maj?.payload).toEqual({ status: 'termine' })
    })
  })

  it('crée une tâche avec les champs saisis', async () => {
    const sb = mount(<TasksPage />, { tables })
    await waitFor(() => expect(screen.getByPlaceholderText('Nouvelle tâche…')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText('Nouvelle tâche…'), 'Appeler le client')
    await userEvent.click(screen.getByText('Ajouter'))

    await waitFor(() => {
      const ins = sb.__calls.insert.find(i => i.table === 'tasks')
      expect(ins?.payload.title).toBe('Appeler le client')
      expect(ins?.payload.status).toBe('a_faire')
    })
  })
})

describe('Suivi des démarches', () => {
  it('affiche la frise et dit clairement quand rien n\'est tracé', async () => {
    mount(<InteractionPanel contactId="c1" lists={[]} />, {
      tables: { contact_interactions: [], contact_assignments: [] },
    })
    await waitFor(() =>
      expect(screen.getByText(/Aucune démarche enregistrée/)).toBeInTheDocument()
    )
    expect(screen.getByText(/Personne ne suit ce contact/)).toBeInTheDocument()
  })

  it('nomme le titulaire quand le contact est déjà pris', async () => {
    mount(<InteractionPanel contactId="c1" lists={[]} />, {
      tables: {
        contact_interactions: [],
        contact_assignments: [{
          id: 'a1', contact_id: 'c1', assigned_to: 'u2', assigned_at: '2026-08-01T10:00:00Z',
          assignee: { prenom: 'Ziad', nom: 'Balbzioui', email: 'z@jump-mines.fr' },
        }],
      },
    })
    await waitFor(() => expect(screen.getByText(/Ziad Balbzioui/)).toBeInTheDocument())
    expect(screen.getByText('Libérer')).toBeInTheDocument()
  })

  it('enregistre une démarche avec son canal et son résultat', async () => {
    const sb = mount(<InteractionPanel contactId="c1" lists={[]} />, {
      tables: { contact_interactions: [], contact_assignments: [] },
    })
    await waitFor(() => expect(screen.getByText('Enregistrer une démarche')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Enregistrer une démarche'))

    await userEvent.type(screen.getByPlaceholderText('Ce qui a été dit…'), 'Premier contact par mail')
    await userEvent.click(screen.getByText('Enregistrer'))

    await waitFor(() => {
      const ins = sb.__calls.insert.find(i => i.table === 'contact_interactions')
      expect(ins?.payload.summary).toBe('Premier contact par mail')
      expect(ins?.payload.channel).toBe('email')
      expect(ins?.payload.outcome).toBe('contacte')
      expect(ins?.payload.contact_id).toBe('c1')
    })
  })

  it('cache la saisie sans la permission d\'écrire', async () => {
    mount(<InteractionPanel contactId="c1" lists={[]} />, {
      permissions: ['audit.read'],
      tables: { contact_interactions: [], contact_assignments: [] },
    })
    await waitFor(() => expect(screen.getByText(/Aucune démarche/)).toBeInTheDocument())
    expect(screen.queryByText('Enregistrer une démarche')).not.toBeInTheDocument()
  })
})
