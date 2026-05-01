import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthProvider, useAuth } from '../../features/auth/hooks/useAuth'

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({}),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'consultant' } }),
    }),
  },
}))

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within AuthProvider'
    )
  })

  it('exposes null user when there is no session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await act(async () => {})
    expect(result.current.user).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('login calls supabase signInWithPassword', async () => {
    const { supabase } = await import('../../shared/lib/supabase')
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await act(async () => {})
    await act(async () => {
      await result.current.login('test@example.com', 'password')
    })
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password',
    })
  })

  it('logout calls supabase signOut', async () => {
    const { supabase } = await import('../../shared/lib/supabase')
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await act(async () => {})
    await act(async () => { await result.current.logout() })
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})
