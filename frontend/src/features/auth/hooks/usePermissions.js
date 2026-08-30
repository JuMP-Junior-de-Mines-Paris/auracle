import { useMemo } from 'react'
import { useAuth } from './useAuth'

// Miroir du joker SQL : détenir admin.full, c'est tout détenir.
export const ADMIN_FULL = 'admin.full'

/**
 * Lecture des permissions du membre connecté.
 *
 * Ce hook ne protège rien : il décide seulement de ce qu'on affiche. La
 * garantie est en base, dans les politiques RLS. Masquer un bouton évite
 * de proposer une action qui échouerait — ça ne remplace pas le refus.
 */
export function usePermissions() {
  const { permissions, loading } = useAuth()

  return useMemo(() => {
    const held = new Set(permissions ?? [])
    const isAdmin = held.has(ADMIN_FULL)

    const can = perm => {
      if (!perm) return true
      if (isAdmin) return true
      return Array.isArray(perm) ? perm.some(p => held.has(p)) : held.has(perm)
    }

    return {
      can,
      canEvery: perms => perms.every(p => can(p)),
      isAdmin,
      permissions: held,
      loading,
    }
  }, [permissions, loading])
}
