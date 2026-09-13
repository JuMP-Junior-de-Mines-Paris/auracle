import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../shared/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

import { supabase } from '../../shared/lib/supabase'
import { useContacts } from '../../features/directory/hooks/useContacts'

// search_contacts renvoie une ligne par contact : la fiche, le total, et
// l'historique de démarche que le hook fusionne dans l'objet contact.
function resultat(contacts, total = contacts.length, demarche = {}) {
  return {
    data: contacts.map(c => ({
      contact: c, total,
      assignee_id: null, assignee_nom: null,
      last_contact_at: null, last_contact_by: null, last_contact_nom: null,
      last_channel: null, nb_interactions: 0,
      ...demarche,
    })),
    error: null,
  }
}

const JEAN = { id: 'c1', nom: 'Dupont', prenom: 'Jean', tags: [] }

beforeEach(() => vi.clearAllMocks())

describe('useContacts', () => {
  it('charge les contacts au montage', async () => {
    supabase.rpc.mockResolvedValue(resultat([JEAN]))
    const { result } = renderHook(() => useContacts({ page: 1, pageSize: 50 }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.contacts[0]).toMatchObject(JEAN)
    expect(result.current.error).toBeNull()
  })

  it('fusionne l’historique de démarche dans la fiche', async () => {
    supabase.rpc.mockResolvedValue(resultat([JEAN], 1, {
      last_contact_at: '2026-09-01T10:00:00Z',
      last_contact_by: 'u2',
      last_contact_nom: 'Ziad Balbzioui',
      last_channel: 'linkedin',
      nb_interactions: 3,
    }))
    const { result } = renderHook(() => useContacts({}))

    await waitFor(() => expect(result.current.loading).toBe(false))
    const c = result.current.contacts[0]
    // L'affichage lit une seule forme, sans jongler entre deux objets.
    expect(c.nom).toBe('Dupont')
    expect(c.last_contact_nom).toBe('Ziad Balbzioui')
    expect(c.last_channel).toBe('linkedin')
    expect(c.nb_interactions).toBe(3)
  })

  it('filtre sur qui a démarché, et sur ce que personne n’a démarché', async () => {
    supabase.rpc.mockResolvedValue(resultat([]))

    const a = renderHook(() => useContacts({ contactedBy: 'u2' }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(supabase.rpc.mock.calls[0][1].contacted_by).toBe('u2')
    a.unmount()

    vi.clearAllMocks()
    supabase.rpc.mockResolvedValue(resultat([]))
    renderHook(() => useContacts({ onlyUncontacted: true }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(supabase.rpc.mock.calls[0][1].only_uncontacted).toBe(true)
  })

  it('compte les démarches à zéro quand il n’y en a pas', async () => {
    supabase.rpc.mockResolvedValue(resultat([JEAN]))
    const { result } = renderHook(() => useContacts({}))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.contacts[0].nb_interactions).toBe(0)
    expect(result.current.contacts[0].last_contact_at).toBeNull()
  })

  it('passe le terme en PARAMÈTRE, jamais concaténé dans un filtre', async () => {
    supabase.rpc.mockResolvedValue(resultat([]))
    // Une virgule et une parenthèse cassaient l'ancien filtre PostgREST.
    renderHook(() => useContacts({ page: 1, pageSize: 50, query: 'Dupont, Jean (Total)' }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    const [nom, args] = supabase.rpc.mock.calls[0]
    expect(nom).toBe('search_contacts')
    expect(args.q).toBe('Dupont, Jean (Total)')
  })

  it('traduit la pagination en limite et décalage', async () => {
    supabase.rpc.mockResolvedValue(resultat([]))
    renderHook(() => useContacts({ page: 3, pageSize: 50 }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    const args = supabase.rpc.mock.calls[0][1]
    expect(args.lim).toBe(50)
    expect(args.off).toBe(100)
  })

  it('distingue « aucun filtre » de « sans statut »', async () => {
    supabase.rpc.mockResolvedValue(resultat([]))

    const a = renderHook(() => useContacts({ statusFilter: undefined }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(supabase.rpc.mock.calls[0][1].only_null_status).toBe(false)
    a.unmount()

    vi.clearAllMocks()
    supabase.rpc.mockResolvedValue(resultat([]))
    renderHook(() => useContacts({ statusFilter: null }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(supabase.rpc.mock.calls[0][1].only_null_status).toBe(true)
  })

  it('lit le total sur la première ligne', async () => {
    supabase.rpc.mockResolvedValue(resultat([JEAN], 1234))
    const { result } = renderHook(() => useContacts({}))

    await waitFor(() => expect(result.current.total).toBe(1234))
  })

  it('remonte un refus au lieu de le faire passer pour un annuaire vide', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    const { result } = renderHook(() => useContacts({}))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.contacts).toEqual([])
    expect(result.current.error).toMatch(/droits/i)
  })

  it('createContact insère puis renvoie la fiche créée', async () => {
    supabase.rpc.mockResolvedValue(resultat([]))
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: JEAN, error: null }),
    }
    supabase.from.mockReturnValue(chain)

    const { result } = renderHook(() => useContacts({}))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let cree
    await act(async () => { cree = await result.current.createContact({ nom: 'Dupont' }) })

    expect(supabase.from).toHaveBeenCalledWith('contacts')
    expect(chain.insert).toHaveBeenCalledWith({ nom: 'Dupont' })
    expect(cree).toEqual(JEAN)
  })
})
