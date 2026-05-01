import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useContacts } from '../../features/directory/hooks/useContacts'

const mockContacts = [
  { id: '1', prenom: 'Marc', nom: 'Dupont', entreprise_actuelle: 'TotalEnergies' },
  { id: '2', prenom: 'Sophie', nom: 'Martin', entreprise_actuelle: 'Airbus' },
]

const newContact = { id: '3', prenom: 'Alice', nom: 'Leblanc', entreprise_actuelle: 'Safran' }

const mockFrom = {
  select: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: mockContacts, error: null }),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: newContact, error: null }),
}

vi.mock('../../shared/lib/supabase', () => ({
  supabase: { from: vi.fn(() => mockFrom) },
}))

describe('useContacts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('fetches contacts on mount and sets loading to false', async () => {
    const { result } = renderHook(() => useContacts())
    expect(result.current.loading).toBe(true)
    await act(async () => {})
    expect(result.current.contacts).toEqual(mockContacts)
    expect(result.current.loading).toBe(false)
  })

  it('createContact inserts and adds the new contact to state', async () => {
    const { result } = renderHook(() => useContacts())
    await act(async () => {})
    await act(async () => {
      await result.current.createContact({ prenom: 'Alice', nom: 'Leblanc' })
    })
    expect(result.current.contacts).toHaveLength(3)
    expect(result.current.contacts.find(c => c.id === '3')).toBeDefined()
  })
})
