import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../shared/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

import { supabase } from '../../shared/lib/supabase'
import { useContacts } from '../../features/directory/hooks/useContacts'

// search_contacts renvoie une ligne par contact, chacune portant le même
// total (count(*) over ()).
function resultat(contacts, total = contacts.length) {
  return { data: contacts.map(c => ({ contact: c, total })), error: null }
}

const JEAN = { id: 'c1', nom: 'Dupont', prenom: 'Jean', tags: [] }

beforeEach(() => vi.clearAllMocks())

describe('useContacts', () => {
  it('charge les contacts au montage', async () => {
    supabase.rpc.mockResolvedValue(resultat([JEAN]))
    const { result } = renderHook(() => useContacts({ page: 1, pageSize: 50 }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.contacts).toEqual([JEAN])
    expect(result.current.error).toBeNull()
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
