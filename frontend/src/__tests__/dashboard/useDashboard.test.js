import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useDashboard } from '../../features/dashboard/hooks/useDashboard'

function makeChain(resolvedValue) {
  const chain = {}
  ;['select', 'order', 'insert', 'update', 'delete', 'match', 'eq', 'single', 'in', 'lt', 'gte', 'limit'].forEach(m => {
    chain[m] = vi.fn(() => chain)
  })
  chain.then = resolve => Promise.resolve(resolvedValue).then(resolve)
  return chain
}

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}))

import { supabase } from '../../shared/lib/supabase'

const mockMissions = [
  { id: 'm1', title: 'Mission A', status: 'active', chef_de_projet: 'user-1', created_by: 'user-1', chef: { prenom: 'Moi', nom: 'Test' } },
  { id: 'm2', title: 'Mission B', status: 'draft', chef_de_projet: 'user-2', created_by: 'user-2', chef: null },
]

describe('useDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation(table => {
      if (table === 'missions') return makeChain({ data: mockMissions, error: null })
      if (table === 'milestones') return makeChain({ data: [], error: null })
      if (table === 'mission_team') return makeChain({ data: [], error: null })
      return makeChain({ data: [], error: null })
    })
  })

  it('loading becomes false after fetch', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('allMissions is populated', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.allMissions).toEqual(mockMissions)
  })

  it('kpis.activeMissions counts only active status', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.kpis.activeMissions).toBe(1)
  })

  it('myMissions includes missions where user is chef_de_projet', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myMissions.some(m => m.id === 'm1')).toBe(true)
    expect(result.current.myMissions.some(m => m.id === 'm2')).toBe(false)
  })
})
