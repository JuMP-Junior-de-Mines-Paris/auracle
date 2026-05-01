import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import ProtectedRoute from '../../shared/components/ProtectedRoute'

vi.mock('../../features/auth/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../features/auth/hooks/useAuth'

describe('ProtectedRoute', () => {
  it('redirects to /login when not authenticated', () => {
    useAuth.mockReturnValue({ user: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/annuaire']}>
        <Routes>
          <Route
            path="/annuaire"
            element={<ProtectedRoute><div>Protected</div></ProtectedRoute>}
          />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    useAuth.mockReturnValue({ user: { id: '1' }, loading: false })
    render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected content</div></ProtectedRoute>
      </MemoryRouter>
    )
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('shows loading state while session resolves', () => {
    useAuth.mockReturnValue({ user: null, loading: true })
    render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected</div></ProtectedRoute>
      </MemoryRouter>
    )
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })
})
