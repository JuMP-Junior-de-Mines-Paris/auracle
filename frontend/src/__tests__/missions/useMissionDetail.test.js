import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useMissionDetail } from '../../features/missions/hooks/useMissionDetail'

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

const mockMission = { id: 'm1', title: 'Mission test', client_name: 'TOTAL', status: 'active', chef_de_projet: 'user-2', created_by: 'user-1' }

describe('useMissionDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation(table => {
      if (table === 'missions') return makeChain({ data: mockMission, error: null })
      if (table === 'mission_team') return makeChain({ data: [], error: null })
      if (table === 'milestones') return makeChain({ data: [], error: null })
      if (table === 'meetings') return makeChain({ data: [], error: null })
      return makeChain({ data: [], error: null })
    })
  })

  it('fetches all data on mount', async () => {
    const { result } = renderHook(() => useMissionDetail('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mission.title).toBe('Mission test')
    expect(result.current.team).toEqual([])
    expect(result.current.milestones).toEqual([])
    expect(result.current.meetings).toEqual([])
  })

  it('createMilestone inserts and adds to list', async () => {
    const newMilestone = { id: 'ms1', mission_id: 'm1', title: 'Livrable', due_date: '2026-06-01', done: false, created_at: '2026-05-02' }
    const { result } = renderHook(() => useMissionDetail('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const insertChain = makeChain(null)
    insertChain.insert = vi.fn(() => insertChain)
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn().mockResolvedValue({ data: newMilestone, error: null })
    supabase.from.mockReturnValue(insertChain)

    await act(async () => {
      await result.current.createMilestone('Livrable', '2026-06-01')
    })
    expect(result.current.milestones[0].title).toBe('Livrable')
  })

  it('toggleMilestone updates done state', async () => {
    const initialMilestone = { id: 'ms1', mission_id: 'm1', title: 'Livrable', due_date: '2026-06-01', done: false, created_at: '2026-05-02' }
    supabase.from.mockImplementation(table => {
      if (table === 'missions') return makeChain({ data: mockMission, error: null })
      if (table === 'milestones') return makeChain({ data: [initialMilestone], error: null })
      return makeChain({ data: [], error: null })
    })

    const { result } = renderHook(() => useMissionDetail('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const updateChain = makeChain({ error: null })
    updateChain.update = vi.fn(() => updateChain)
    updateChain.eq = vi.fn(() => updateChain)
    supabase.from.mockReturnValue(updateChain)

    await act(async () => {
      await result.current.toggleMilestone('ms1', true)
    })
    expect(result.current.milestones[0].done).toBe(true)
  })

  it('createMeeting inserts and prepends to list', async () => {
    const newMeeting = { id: 'mt1', mission_id: 'm1', title: 'Kick-off', date: '2026-05-10', notes: '', attendees: [], created_at: '2026-05-02' }
    const { result } = renderHook(() => useMissionDetail('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const insertChain = makeChain(null)
    insertChain.insert = vi.fn(() => insertChain)
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn().mockResolvedValue({ data: newMeeting, error: null })
    supabase.from.mockReturnValue(insertChain)

    await act(async () => {
      await result.current.createMeeting({ title: 'Kick-off', date: '2026-05-10', notes: '', attendees: [] })
    })
    expect(result.current.meetings[0].title).toBe('Kick-off')
  })

  it('updateMission updates the mission state', async () => {
    const updated = { ...mockMission, title: 'Renommée', chef: null }
    const { result } = renderHook(() => useMissionDetail('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const updateChain = makeChain(null)
    updateChain.update = vi.fn(() => updateChain)
    updateChain.eq = vi.fn(() => updateChain)
    updateChain.select = vi.fn(() => updateChain)
    updateChain.single = vi.fn().mockResolvedValue({ data: updated, error: null })
    supabase.from.mockReturnValue(updateChain)

    await act(async () => {
      await result.current.updateMission({ title: 'Renommée' })
    })
    expect(result.current.mission.title).toBe('Renommée')
  })
})
