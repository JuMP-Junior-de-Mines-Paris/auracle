import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProspectingLists } from '../features/directory/hooks/useProspectingLists'

vi.mock('../shared/lib/supabase', () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
  }
  return {
    supabase: {
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    },
  }
})

import { supabase } from '../shared/lib/supabase'

describe('useProspectingLists', () => {
  beforeEach(() => vi.clearAllMocks())

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
