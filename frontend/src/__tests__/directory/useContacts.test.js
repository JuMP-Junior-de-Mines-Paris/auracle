import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useContacts } from '../../features/directory/hooks/useContacts'

function makeChain(resolvedValue) {
  const chain = {}
  ;['select', 'order', 'range', 'or', 'insert', 'single'].forEach(m => {
    chain[m] = vi.fn(() => chain)
  })
  chain.then = resolve => Promise.resolve(resolvedValue).then(resolve)
  return chain
}

const mockContacts = [
  { id: '1', prenom: 'Marc', nom: 'Dupont', entreprise_actuelle: 'TotalEnergies' },
  { id: '2', prenom: 'Sophie', nom: 'Martin', entreprise_actuelle: 'Airbus' },
]
const newContact = { id: '3', prenom: 'Alice', nom: 'Leblanc', entreprise_actuelle: 'Safran' }

vi.mock('../../shared/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '../../shared/lib/supabase'


describe('useContacts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches contacts on mount and sets loading to false', async () => {
    const chain = makeChain({ data: mockContacts, count: 2, error: null })
    supabase.from.mockReturnValue(chain)
    const { result } = renderHook(() => useContacts())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.contacts).toEqual(mockContacts)
  })

  it('createContact inserts and returns the new contact', async () => {
    const fetchChain = makeChain({ data: [], count: 0, error: null })
    const insertChain = makeChain({ data: newContact, error: null })
    insertChain.insert = vi.fn(() => insertChain)
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn().mockResolvedValue({ data: newContact, error: null })

    supabase.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(insertChain)

    const { result } = renderHook(() => useContacts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returned
    await act(async () => {
      returned = await result.current.createContact({ prenom: 'Alice', nom: 'Leblanc' })
    })
    expect(returned).toEqual(newContact)
  })

  it('calls .range() with correct offsets for page 2', async () => {
    const chain = makeChain({ data: [], count: 0, error: null })
    supabase.from.mockReturnValue(chain)
    renderHook(() => useContacts({ page: 2, pageSize: 50, query: '' }))
    await waitFor(() => expect(chain.range).toHaveBeenCalledWith(50, 99))
  })
  it('applies ilike filter when query is provided', async () => {
    const chain = makeChain({ data: [], count: 0, error: null })
    supabase.from.mockReturnValue(chain)
    renderHook(() => useContacts({ page: 1, pageSize: 50, query: 'dupont' }))
    await waitFor(() =>
      expect(chain.or).toHaveBeenCalledWith(
        'nom.ilike.%dupont%,prenom.ilike.%dupont%,entreprise_actuelle.ilike.%dupont%,ville.ilike.%dupont%'
      )
    )
  })
  it('returns total from count', async () => {
    const chain = makeChain({ data: [{ id: '1', nom: 'Test', prenom: 'A', tags: [] }], count: 1234, error: null })
    supabase.from.mockReturnValue(chain)
    const { result } = renderHook(() => useContacts({ page: 1, pageSize: 50, query: '' }))
    await waitFor(() => expect(result.current.total).toBe(1234))
  })
})
