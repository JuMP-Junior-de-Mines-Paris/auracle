import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

/**
 * Détection à la saisie.
 *
 * Seul reste du dédoublonnage côté interface : la page de fusion a été
 * retirée, l'annuaire étant propre (zéro grappe sur les 15 737 fiches) et
 * les index uniques de la migration 012 rendant le doublon exact
 * impossible. Cette alerte garde son intérêt en amont — elle attrape les
 * variantes d'orthographe, que l'unicité laisse passer.
 *
 * merge_contacts() et la vue duplicate_clusters restent en base : si une
 * grappe approximative apparaît un jour, elle se traite en SQL.
 */
export function useDuplicateCheck(fields, { enabled = true, delay = 400 } = {}) {
  const [candidates, setCandidates] = useState([])
  const [checking, setChecking] = useState(false)

  const { prenom, nom, email, linkedin, entreprise_actuelle, telephone, id } = fields ?? {}

  useEffect(() => {
    // Rien à comparer tant qu'aucune clé n'est saisie.
    if (!enabled || (!email && !linkedin && !telephone && !(nom && entreprise_actuelle))) {
      setCandidates([])
      return
    }

    let cancelled = false
    setChecking(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('find_duplicate_candidates', {
        p_contact_id: id ?? null,
        p_prenom: prenom ?? null,
        p_nom: nom ?? null,
        p_email: email ?? null,
        p_linkedin: linkedin ?? null,
        p_entreprise: entreprise_actuelle ?? null,
        p_telephone: telephone ?? null,
      })
      if (!cancelled) { setCandidates(data ?? []); setChecking(false) }
    }, delay)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [enabled, delay, id, prenom, nom, email, linkedin, entreprise_actuelle, telephone])

  return { candidates, checking }
}
