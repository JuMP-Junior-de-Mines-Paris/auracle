import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

/**
 * Portées de partage, dans l'ordre du plus fermé au plus ouvert.
 *
 * Elles suivent les cercles de l'organisation plutôt qu'une liste de
 * personnes : c'est ainsi que l'information circule réellement, et ça évite
 * d'avoir à ré-inviter tout le monde à chaque renouvellement du bureau.
 */
export const PORTEES = [
  { code: 'prive',         label: 'Privé',          aide: 'Vous seul',                        icon: 'lock',  bg: '#f3f4f6', fg: '#4b5563' },
  { code: 'bureau',        label: 'Bureau',         aide: 'Président, vice-président, secrétaire, trésorier', icon: 'award', bg: '#dbeafe', fg: '#1d4ed8' },
  { code: 'bureau_etendu', label: 'Bureau étendu',  aide: 'Le bureau et les responsables',     icon: 'users', bg: '#ede9fe', fg: '#6d28d9' },
  { code: 'tous',          label: 'Tous les membres', aide: 'Toute la JuMP',                   icon: 'globe', bg: '#dcfce7', fg: '#15803d' },
]

export const porteeMeta = code => PORTEES.find(p => p.code === code) ?? PORTEES[1]

export function useNotebooks({ archived = false } = {}) {
  const [notebooks, setNotebooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    // La vue ne renvoie que les carnets visibles : le filtrage est en base,
    // pas ici. L'interface ne décide jamais de ce qu'on a le droit de voir.
    const { data, error: err } = await supabase
      .from('notebooks_overview')
      .select('*')
      .eq('archived', archived)
      .order('derniere_activite', { ascending: false })

    setError(err ? describeError(err) : null)
    setNotebooks(err ? [] : (data ?? []))
    setLoading(false)
  }, [archived])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function create({ title, description, visibility = 'bureau', icon = null }) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: err } = await supabase
      .from('notebooks')
      .insert({ title: title.trim(), description: description?.trim() || null, visibility, icon, created_by: user.id })
      .select()
      .single()
    if (err) throw new Error(describeError(err))
    await fetchAll()
    return data
  }

  async function update(id, fields) {
    const { error: err } = await supabase.from('notebooks').update(fields).eq('id', id)
    if (err) throw new Error(describeError(err))
    await fetchAll()
  }

  async function remove(id) {
    const { error: err } = await supabase.from('notebooks').delete().eq('id', id)
    if (err) throw new Error(describeError(err))
    setNotebooks(prev => prev.filter(n => n.id !== id))
  }

  return { notebooks, loading, error, create, update, remove, refetch: fetchAll }
}

/** Un carnet et ses invités nominatifs. */
export function useNotebook(id) {
  const [notebook, setNotebook] = useState(null)
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchOne = useCallback(async () => {
    if (!id) { setLoading(false); return }
    setLoading(true)
    const [nbRes, shRes] = await Promise.all([
      supabase.from('notebooks_overview').select('*').eq('id', id).maybeSingle(),
      supabase.from('notebook_shares').select('*, membre:profiles!profile_id(prenom, nom, email)').eq('notebook_id', id),
    ])
    setError(nbRes.error ? describeError(nbRes.error) : null)
    setNotebook(nbRes.data ?? null)
    setShares(shRes.data ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { fetchOne() }, [fetchOne])

  async function update(fields) {
    const { error: err } = await supabase.from('notebooks').update(fields).eq('id', id)
    if (err) throw new Error(describeError(err))
    await fetchOne()
  }

  async function invite(profileId) {
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase
      .from('notebook_shares')
      .upsert({ notebook_id: id, profile_id: profileId, shared_by: user.id })
    if (err) throw new Error(describeError(err))
    await fetchOne()
  }

  async function revoke(profileId) {
    const { error: err } = await supabase
      .from('notebook_shares').delete().match({ notebook_id: id, profile_id: profileId })
    if (err) throw new Error(describeError(err))
    await fetchOne()
  }

  return { notebook, shares, loading, error, update, invite, revoke, refetch: fetchOne }
}
