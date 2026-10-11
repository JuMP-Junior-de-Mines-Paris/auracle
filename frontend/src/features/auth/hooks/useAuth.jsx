import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)

  // Rôle et permissions en une passe : les deux conditionnent le premier
  // rendu, les charger séparément ferait clignoter les commandes protégées.
  const loadProfile = useCallback(async userId => {
    const [profileRes, permsRes] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', userId).single(),
      supabase.rpc('my_permissions'),
    ])

    setRole(profileRes.data?.role ?? null)

    // La RPC n'existe pas tant que la migration 008 n'est pas appliquée :
    // on retombe alors sur une liste vide plutôt que de casser la session.
    setPermissions(
      permsRes.error
        ? []
        : (permsRes.data ?? []).map(row => (typeof row === 'string' ? row : row.my_permissions))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) loadProfile(session.user.id)
        else { setRole(null); setPermissions([]); setLoading(false) }
      }
    )

    return () => subscription.unsubscribe()
  }, [loadProfile])

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, role, permissions, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
