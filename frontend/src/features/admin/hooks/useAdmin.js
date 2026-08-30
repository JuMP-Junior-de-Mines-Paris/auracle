import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

/**
 * Matrice rôle → permission.
 *
 * C'est de la donnée, pas du code : cocher une case ici change ce que les
 * politiques RLS autorisent, sans migration. Les policies citent une
 * permission via has_perm(), jamais un nom de rôle.
 */
export function usePermissionMatrix() {
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [grants, setGrants] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const key = (role, perm) => `${role}::${perm}`

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [r, p, rp] = await Promise.all([
      supabase.from('roles').select('*').order('rank'),
      supabase.from('permissions').select('*').order('category').order('label'),
      supabase.from('role_permissions').select('*'),
    ])
    const err = r.error || p.error || rp.error
    setError(err ? describeError(err) : null)
    setRoles(r.data ?? [])
    setPermissions(p.data ?? [])
    setGrants(new Set((rp.data ?? []).map(g => key(g.role_code, g.permission_code))))
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const holds = (role, perm) => grants.has(key(role, perm))

  async function toggle(roleCode, permCode) {
    const k = key(roleCode, permCode)
    const had = grants.has(k)

    // Optimiste : la grille reste réactive au clic. En cas de refus RLS on
    // remet l'état d'avant et on remonte l'erreur.
    setGrants(prev => {
      const next = new Set(prev)
      if (had) next.delete(k); else next.add(k)
      return next
    })

    const { error: err } = had
      ? await supabase.from('role_permissions').delete()
          .match({ role_code: roleCode, permission_code: permCode })
      : await supabase.from('role_permissions')
          .insert({ role_code: roleCode, permission_code: permCode })

    if (err) {
      setGrants(prev => {
        const next = new Set(prev)
        if (had) next.add(k); else next.delete(k)
        return next
      })
      throw new Error(describeError(err))
    }
  }

  return { roles, permissions, grants, holds, toggle, loading, error, refetch: fetchAll }
}

/** Gestion des membres : rôle, activation. */
export function useMemberAdmin() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, prenom, nom, email, role')
      .order('nom')
    setError(err ? describeError(err) : null)
    setMembers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function setRole(memberId, roleCode) {
    // Passe par la RPC : 007 a retiré `role` des colonnes écrivables, et la
    // fonction refuse de laisser le bureau sans détenteur de tous les droits.
    const { error: err } = await supabase.rpc('set_member_role', {
      target_id: memberId,
      new_role: roleCode,
    })
    if (err) throw new Error(describeError(err))
    setMembers(prev => prev.map(m => (m.id === memberId ? { ...m, role: roleCode } : m)))
  }

  async function updateIdentity(memberId, fields) {
    const { error: err } = await supabase
      .from('profiles')
      .update({ prenom: fields.prenom, nom: fields.nom })
      .eq('id', memberId)
    if (err) throw new Error(describeError(err))
    setMembers(prev => prev.map(m => (m.id === memberId ? { ...m, ...fields } : m)))
  }

  return { members, loading, error, setRole, updateIdentity, refetch: fetchAll }
}

/** Journal d'activité — alimenté par trigger, donc incontournable. */
export function useAuditLog({ limit = 100 } = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [table, setTable] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('audit_log')
      .select('*, actor_profile:profiles!actor(prenom, nom, email)')
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (table) q = q.eq('table_name', table)

    const { data, error: err } = await q
    setError(err ? describeError(err) : null)
    setEntries(err ? [] : (data ?? []))
    setLoading(false)
  }, [limit, table])

  useEffect(() => { fetchAll() }, [fetchAll])

  return { entries, loading, error, table, setTable, refetch: fetchAll }
}
