import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

export const CRITERES_VIDES = {
  q: '',
  promo_min: null, promo_max: null,
  entreprises: [], diplomes: [], villes: [], postes: [], pays: [],
  statuts: [], sans_statut: false,
  demarche_par: null, jamais_demarche: false,
  avec_linkedin: false, avec_email: false,
  dans_liste: null, hors_liste: null,
  inclure_exclus: false,
}

/** Retire ce qui ne filtre rien, pour que le critère enregistré soit lisible. */
export function nettoyer(c) {
  const out = {}
  for (const [k, v] of Object.entries(c ?? {})) {
    if (v === null || v === undefined || v === false || v === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out
}

export function estVide(c) {
  return Object.keys(nettoyer(c)).length === 0
}

/** Résumé lisible d'un segment, pour l'afficher sans le déplier. */
export function resumer(c) {
  const n = nettoyer(c)
  const bouts = []
  if (n.q) bouts.push(`« ${n.q} »`)
  if (n.promo_min || n.promo_max) {
    bouts.push(`promo ${n.promo_min ?? '…'}–${n.promo_max ?? '…'}`)
  }
  for (const [cle, mot] of [['entreprises', 'entreprise'], ['diplomes', 'diplôme'],
                            ['villes', 'ville'], ['postes', 'poste'], ['pays', 'pays']]) {
    if (n[cle]?.length) bouts.push(`${mot} : ${n[cle].slice(0, 2).join(', ')}${n[cle].length > 2 ? `+${n[cle].length - 2}` : ''}`)
  }
  if (n.statuts?.length) bouts.push(`${n.statuts.length} statut${n.statuts.length > 1 ? 's' : ''}`)
  if (n.sans_statut) bouts.push('sans statut')
  if (n.jamais_demarche) bouts.push('jamais démarchés')
  if (n.avec_linkedin) bouts.push('avec LinkedIn')
  if (n.avec_email) bouts.push('avec e-mail')
  return bouts.length ? bouts.join(' · ') : 'aucun critère'
}

/** Les valeurs réellement présentes en base, pour alimenter les filtres. */
export function useFacets() {
  const [facets, setFacets] = useState(null)
  useEffect(() => {
    supabase.rpc('contact_facets', { lim: 30 }).then(({ data }) => setFacets(data ?? null))
  }, [])
  return facets
}

/**
 * Aperçu d'un segment : le compte se recalcule pendant qu'on règle les
 * curseurs, la page de résultats seulement quand on la demande.
 */
export function useSegmentPreview(criteria, { delay = 350 } = {}) {
  const [count, setCount] = useState(null)
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const dernier = useRef(0)

  const clean = JSON.stringify(nettoyer(criteria))

  useEffect(() => {
    const jeton = ++dernier.current
    setLoading(true)
    const t = setTimeout(async () => {
      const crit = JSON.parse(clean)
      const [c, r] = await Promise.all([
        supabase.rpc('count_contacts', { criteria: crit }),
        supabase.rpc('search_segment', { criteria: crit, lim: 50, off: (page - 1) * 50 }),
      ])
      // Une réponse arrivée après une saisie plus récente est périmée.
      if (jeton !== dernier.current) return
      const err = c.error || r.error
      setError(err ? describeError(err) : null)
      setCount(err ? null : Number(c.data ?? 0))
      setRows(err ? [] : (r.data ?? []).map(x => ({
        ...x.contact,
        last_contact_at: x.last_contact_at,
        last_contact_nom: x.last_contact_nom,
        nb_interactions: Number(x.nb_interactions ?? 0),
      })))
      setLoading(false)
    }, delay)
    return () => clearTimeout(t)
  }, [clean, page, delay])

  return { count, rows, page, setPage, loading, error }
}

export function useSegments() {
  const [segments, setSegments] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('segments').select('*').order('created_at', { ascending: false })
    setSegments(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function save({ id, name, description, criteria, partage = true }) {
    const { data: { user } } = await supabase.auth.getUser()
    const corps = { name: name.trim(), description: description?.trim() || null, criteria: nettoyer(criteria), partage }
    const { data, error } = id
      ? await supabase.from('segments').update(corps).eq('id', id).select().single()
      : await supabase.from('segments').insert({ ...corps, created_by: user.id }).select().single()
    if (error) throw new Error(describeError(error))
    await fetchAll()
    return data
  }

  async function remove(id) {
    const { error } = await supabase.from('segments').delete().eq('id', id)
    if (error) throw new Error(describeError(error))
    setSegments(prev => prev.filter(s => s.id !== id))
  }

  /** Verse le segment dans une campagne ; renvoie le nombre réellement ajouté. */
  async function verser(segmentId, listId) {
    const { data, error } = await supabase.rpc('segment_to_list', { p_segment: segmentId, p_list: listId })
    if (error) throw new Error(describeError(error))
    return Number(data ?? 0)
  }

  return { segments, loading, save, remove, verser, refetch: fetchAll }
}
