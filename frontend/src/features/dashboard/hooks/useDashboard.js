import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

const AUJOURDHUI = () => new Date().toISOString().split('T')[0]

/**
 * L'accueil répond à une question : qu'est-ce qui m'attend aujourd'hui ?
 *
 * L'ancienne version affichait trois compteurs de missions et trois listes
 * vides, sans un seul bouton — et comptait les « consultants actifs » en
 * additionnant des lignes de texte libre (F-09). Elle n'avait jamais suivi
 * ce qu'est devenue l'application.
 */
export function useDashboard() {
  const [moi, setMoi] = useState({ relances: [], taches: [], missions: [] })
  const [equipe, setEquipe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const uid = user?.id
    const today = AUJOURDHUI()

    const [relRes, tacheRes, missRes, prospRes] = await Promise.all([
      // Mes relances : ce qui est dû, pas tout l'avenir.
      supabase.from('followups').select('*')
        .eq('assigned_to', uid ?? '00000000-0000-0000-0000-000000000000')
        .lte('next_action_at', today)
        .order('next_action_at')
        .limit(8),
      supabase.from('tasks')
        .select('*, mission:missions(title), notebook:notebooks(title)')
        .eq('assigned_to', uid ?? '00000000-0000-0000-0000-000000000000')
        .not('status', 'in', '("termine","annule")')
        .order('due_date', { nullsFirst: false })
        .limit(8),
      supabase.from('missions')
        .select('*, chef:profiles!chef_de_projet(prenom, nom)')
        .eq('chef_de_projet', uid ?? '00000000-0000-0000-0000-000000000000')
        .order('created_at', { ascending: false }),
      supabase.rpc('prospection_overview'),
    ])

    const err = relRes.error || tacheRes.error || missRes.error
    setError(err ? describeError(err) : null)

    setMoi({
      relances: relRes.data ?? [],
      taches: tacheRes.data ?? [],
      missions: missRes.data ?? [],
    })
    setEquipe(prospRes.error ? null : prospRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const today = AUJOURDHUI()
  const enRetard = {
    relances: moi.relances.filter(r => r.next_action_at < today).length,
    taches: moi.taches.filter(t => t.due_date && t.due_date < today).length,
  }
  // Rien à faire ET rien à suivre : c'est un premier jour, pas une journée vide.
  const premierJour = (equipe?.demarches ?? 0) === 0 && moi.missions.length === 0

  return { moi, equipe, enRetard, premierJour, loading, error, refetch: fetchAll }
}
