import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useContacts } from '../features/directory/hooks/useContacts'

function makeChain(resolvedValue) {
  const chain = {}
  ;['select', 'order', 'range', 'or', 'ilike', 'eq', 'neq'].forEach(m => {
    chain[m] = vi.fn(() => chain)
  })
  chain.then = (resolve) => Promise.resolve(resolvedValue).then(resolve)
  return chain
}

vi.mock('../shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ error: null })),
  },
}))

import { supabase } from '../shared/lib/supabase'

describe('useContacts', () => {
  beforeEach(() => vi.clearAllMocks())

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
