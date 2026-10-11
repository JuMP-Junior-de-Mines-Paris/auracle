import { usePermissions } from '../../features/auth/hooks/usePermissions'

/**
 * Affiche ses enfants seulement si la permission est détenue.
 *
 *   <Can perm="missions.create">
 *     <button>Nouvelle mission</button>
 *   </Can>
 *
 * `perm` accepte un tableau — il suffit alors d'en détenir une.
 * `fallback` remplace le contenu masqué (par défaut : rien).
 * `also` ajoute une condition maison, pour les cas où la permission ne
 * suffit pas (être chef de projet de CETTE mission, par exemple).
 */
export default function Can({ perm, also = true, fallback = null, children }) {
  const { can } = usePermissions()
  return can(perm) && also ? children : fallback
}
