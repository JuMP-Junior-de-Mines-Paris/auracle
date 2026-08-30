import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

/**
 * Grappes de doublons déjà présentes en base.
 *
 * La vue duplicate_clusters ne retient que les collisions sur une clé forte
 * (e-mail, LinkedIn, id_profil) : ce sont des doublons certains, pas des
 * suspicions. La détection floue vit dans useDuplicateCheck, à la saisie.
 */
export function useDuplicates() {
  const [clusters, setClusters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchClusters = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('duplicate_clusters')
      .select('*')
      .order('n', { ascending: false })

    if (err) { setError(describeError(err)); setClusters([]); setLoading(false); return }

    // La vue ne donne que des identifiants ; on récupère les fiches en une
    // requête plutôt qu'une par grappe.
    const ids = [...new Set((data ?? []).flatMap(c => c.contact_ids))]
    const { data: contacts } = ids.length
      ? await supabase.from('contacts').select('*').in('id', ids)
      : { data: [] }

    const byId = new Map((contacts ?? []).map(c => [c.id, c]))
    setClusters(
      (data ?? []).map(c => ({
        ...c,
        contacts: c.contact_ids.map(id => byId.get(id)).filter(Boolean),
      })).filter(c => c.contacts.length > 1)
    )
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchClusters() }, [fetchClusters])

  async function merge(masterId, duplicateIds) {
    const { error: err } = await supabase.rpc('merge_contacts', {
      master_id: masterId,
      duplicate_ids: duplicateIds,
    })
    if (err) throw new Error(describeError(err))
    await fetchClusters()
  }

  return { clusters, loading, error, merge, refetch: fetchClusters }
}

/**
 * Détection à la saisie : prévient avant l'enregistrement plutôt que de
 * laisser créer un doublon qu'il faudra fusionner ensuite.
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
