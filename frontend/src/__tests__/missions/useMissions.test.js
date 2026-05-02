import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useMissions } from '../../features/missions/hooks/useMissions'

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
  { id: 'm1', title: 'Mission test', client_name: 'TOTAL', status: 'active', chef_de_projet: 'user-2', created_by: 'user-1', chef: { prenom: 'Jean', nom: 'Dupont' } },
]

describe('useMissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation(() => makeChain({ data: mockMissions, error: null }))
  })

  it('fetches missions on mount', async () => {
    const { result } = renderHook(() => useMissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.missions).toEqual(mockMissions)
  })

  it('createMission inserts and prepends to list', async () => {
    const newMission = { id: 'm2', title: 'Nouveau', client_name: 'EDF', status: 'draft', created_by: 'user-1', chef: null }
    const { result } = renderHook(() => useMissions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const insertChain = makeChain(null)
    insertChain.insert = vi.fn(() => insertChain)
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn().mockResolvedValue({ data: newMission, error: null })
    supabase.from.mockReturnValue(insertChain)

    await act(async () => {
      await result.current.createMission({ title: 'Nouveau', client_name: 'EDF', status: 'draft' })
    })
    expect(result.current.missions[0].title).toBe('Nouveau')
  })

  it('updateMission updates the mission in the list', async () => {
    const updated = { ...mockMissions[0], title: 'Renommée' }
    const { result } = renderHook(() => useMissions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const updateChain = makeChain(null)
    updateChain.update = vi.fn(() => updateChain)
    updateChain.eq = vi.fn(() => updateChain)
    updateChain.select = vi.fn(() => updateChain)
    updateChain.single = vi.fn().mockResolvedValue({ data: updated, error: null })
    supabase.from.mockReturnValue(updateChain)

    await act(async () => {
      await result.current.updateMission('m1', { title: 'Renommée' })
    })
    expect(result.current.missions[0].title).toBe('Renommée')
  })
})
