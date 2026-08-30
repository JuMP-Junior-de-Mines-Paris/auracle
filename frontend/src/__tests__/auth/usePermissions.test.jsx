import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

import { supabase } from '../../shared/lib/supabase'
import { AuthProvider } from '../../features/auth/hooks/useAuth'
import { usePermissions } from '../../features/auth/hooks/usePermissions'
import Can from '../../shared/components/Can'
import RoleRoute from '../../shared/components/RoleRoute'

function mockSession(role, permissions, { rpcFails = false } = {}) {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'u1', email: 'a@jump-mines.fr' } } },
  })
  supabase.from.mockReturnValue({
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role } }) }) }),
  })
  supabase.rpc.mockResolvedValue(
    rpcFails
      ? { data: null, error: { message: 'function my_permissions does not exist' } }
      : { data: permissions, error: null }
  )
}

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

describe('usePermissions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accorde une permission explicitement détenue', async () => {
    mockSession('chef_de_projet', ['contacts.write', 'missions.create'])
    const { result } = renderHook(() => usePermissions(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.can('missions.create')).toBe(true)
    expect(result.current.can('contacts.delete')).toBe(false)
    expect(result.current.isAdmin).toBe(false)
  })

  it('admin.full vaut joker sur toutes les permissions', async () => {
    mockSession('president', ['admin.full'])
    const { result } = renderHook(() => usePermissions(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.can('missions.delete')).toBe(true)
    expect(result.current.can('permissions.manage')).toBe(true)
    expect(result.current.can('nimporte.quoi')).toBe(true)
  })

  it('accepte un tableau : il suffit d\'en détenir une', async () => {
    mockSession('respo_qualite', ['ce.write'])
    const { result } = renderHook(() => usePermissions(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.can(['ce.write', 'ce.finalize'])).toBe(true)
    expect(result.current.can(['missions.delete', 'contacts.delete'])).toBe(false)
    expect(result.current.canEvery(['ce.write', 'ce.finalize'])).toBe(false)
  })

  it('ne refuse rien quand aucune permission n\'est demandée', async () => {
    mockSession('chef_de_projet', [])
    const { result } = renderHook(() => usePermissions(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.can(undefined)).toBe(true)
  })

  it('retombe sur aucune permission si la RPC n\'existe pas encore', async () => {
    mockSession('chef_de_projet', null, { rpcFails: true })
    const { result } = renderHook(() => usePermissions(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.can('contacts.write')).toBe(false)
    expect(result.current.isAdmin).toBe(false)
  })
})

describe('<Can>', () => {
  beforeEach(() => vi.clearAllMocks())

  it('affiche ses enfants quand la permission est détenue', async () => {
    mockSession('respo_dev_co', ['contacts.import'])
    render(<Can perm="contacts.import"><button>Importer CSV</button></Can>, { wrapper })

    await waitFor(() => expect(screen.getByText('Importer CSV')).toBeInTheDocument())
  })

  it('masque ses enfants sans la permission', async () => {
    mockSession('chef_de_projet', ['contacts.write'])
    render(<Can perm="contacts.import"><button>Importer CSV</button></Can>, { wrapper })

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(screen.queryByText('Importer CSV')).not.toBeInTheDocument()
  })

  it('respecte la condition `also` même avec la permission', async () => {
    mockSession('president', ['admin.full'])
    render(<Can perm="missions.create" also={false}><button>Nouvelle mission</button></Can>, { wrapper })

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(screen.queryByText('Nouvelle mission')).not.toBeInTheDocument()
  })
})

describe('<RoleRoute>', () => {
  beforeEach(() => vi.clearAllMocks())

  it('laisse passer avec la permission', async () => {
    mockSession('president', ['admin.full'])
    render(<RoleRoute perm="permissions.manage"><div>Console</div></RoleRoute>, { wrapper })

    await waitFor(() => expect(screen.getByText('Console')).toBeInTheDocument())
  })

  it('affiche un écran explicite plutôt que de rediriger', async () => {
    mockSession('chef_de_projet', ['contacts.write'])
    render(<RoleRoute perm="permissions.manage"><div>Console</div></RoleRoute>, { wrapper })

    await waitFor(() => expect(screen.getByText('Accès réservé')).toBeInTheDocument())
    expect(screen.queryByText('Console')).not.toBeInTheDocument()
  })
})
