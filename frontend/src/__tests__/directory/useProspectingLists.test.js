import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useProspectingLists } from '../../features/directory/hooks/useProspectingLists'

function makeChain(resolvedValue) {
  const chain = {}
  ;['select', 'order', 'insert', 'upsert', 'delete', 'match', 'eq', 'single'].forEach(m => {
    chain[m] = vi.fn(() => chain)
  })
  chain.then = resolve => Promise.resolve(resolvedValue).then(resolve)
  return chain
}

const mockLists = [
  { id: 'l1', name: 'Énergie Q2', created_at: '2026-04-01', created_by: 'user-1', prospecting_list_contacts: [{ count: 3 }] },
]

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}))

import { supabase } from '../../shared/lib/supabase'

describe('useProspectingLists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation(table => {
      if (table === 'prospecting_lists') return makeChain({ data: mockLists, error: null })
      return makeChain({ data: [], error: null })
    })
  })

  it('fetches own lists on mount', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.lists).toEqual(mockLists)
    expect(result.current.sharedLists).toEqual([])
  })

  it('createList inserts and prepends to lists', async () => {
    const newList = { id: 'l2', name: 'Nouveau', created_at: '2026-05-01', created_by: 'user-1' }
    const { result } = renderHook(() => useProspectingLists())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const insertChain = makeChain(null)
    insertChain.insert = vi.fn(() => insertChain)
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn().mockResolvedValue({ data: newList, error: null })
    supabase.from.mockReturnValue(insertChain)

    await act(async () => { await result.current.createList('Nouveau') })
    expect(result.current.lists[0].name).toBe('Nouveau')
  })

  it('addContactToList calls insert on junction table', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.addContactToList('l1', 'c1') })
    expect(supabase.from).toHaveBeenCalledWith('prospecting_list_contacts')
  })

  it('removeContactFromList calls delete on junction table', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.removeContactFromList('l1', 'c1') })
    expect(supabase.from).toHaveBeenCalledWith('prospecting_list_contacts')
  })

  it('addContactsToList calls upsert with correct rows', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    }
    supabase.from.mockReturnValue(mockChain)

    await act(async () => {
      await result.current.addContactsToList('list-1', ['c-1', 'c-2'])
    })

    expect(mockChain.upsert).toHaveBeenCalledWith(
      [{ list_id: 'list-1', contact_id: 'c-1' }, { list_id: 'list-1', contact_id: 'c-2' }],
      { onConflict: 'list_id,contact_id', ignoreDuplicates: true }
    )
  })
  it('shareList inserts into list_shares', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    }
    supabase.from.mockReturnValue(mockChain)

    await act(async () => {
      await result.current.shareList('list-1', ['u-2', 'u-3'])
    })

    expect(supabase.from).toHaveBeenCalledWith('list_shares')
    expect(mockChain.insert).toHaveBeenCalledWith([
      { list_id: 'list-1', shared_with: 'u-2', shared_by: 'user-1' },
      { list_id: 'list-1', shared_with: 'u-3', shared_by: 'user-1' },
    ])
  })
})
