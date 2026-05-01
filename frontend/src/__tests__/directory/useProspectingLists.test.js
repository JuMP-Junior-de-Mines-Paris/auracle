import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useProspectingLists } from '../../features/directory/hooks/useProspectingLists'

const mockLists = [
  { id: 'l1', name: 'Énergie Q2', created_at: '2026-04-01', prospecting_list_contacts: [{ count: 3 }] },
]
const newList = { id: 'l2', name: 'Nouveau', created_at: '2026-05-01' }

const mockListsFrom = {
  select: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: mockLists }),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: newList, error: null }),
}

const mockJunctionFrom = {
  insert: vi.fn().mockResolvedValue({ error: null }),
  delete: vi.fn().mockReturnThis(),
  match: vi.fn().mockResolvedValue({ error: null }),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
}

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(table =>
      table === 'prospecting_lists' ? mockListsFrom : mockJunctionFrom
    ),
  },
}))

describe('useProspectingLists', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches lists on mount', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await act(async () => {})
    expect(result.current.lists).toEqual(mockLists)
    expect(result.current.loading).toBe(false)
  })

  it('createList adds a new list to state', async () => {
    const { result } = renderHook(() => useProspectingLists())
    await act(async () => {})
    await act(async () => { await result.current.createList('Nouveau') })
    expect(result.current.lists).toHaveLength(2)
    expect(result.current.lists[0].name).toBe('Nouveau')
  })

  it('addContactToList calls insert on junction table', async () => {
    const { supabase } = await import('../../shared/lib/supabase')
    const { result } = renderHook(() => useProspectingLists())
    await act(async () => {})
    await act(async () => { await result.current.addContactToList('l1', 'c1') })
    expect(supabase.from).toHaveBeenCalledWith('prospecting_list_contacts')
  })

  it('removeContactFromList calls delete on junction table', async () => {
    const { supabase } = await import('../../shared/lib/supabase')
    const { result } = renderHook(() => useProspectingLists())
    await act(async () => {})
    await act(async () => { await result.current.removeContactFromList('l1', 'c1') })
    expect(supabase.from).toHaveBeenCalledWith('prospecting_list_contacts')
  })
})
