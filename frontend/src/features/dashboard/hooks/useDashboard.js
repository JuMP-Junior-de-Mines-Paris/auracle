import { useState, useEffect } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useDashboard() {
  const [kpis, setKpis] = useState({ activeMissions: 0, lateMilestones: 0, activeConsultants: 0 })
  const [myMissions, setMyMissions] = useState([])
  const [allMissions, setAllMissions] = useState([])
  const [upcomingMilestones, setUpcomingMilestones] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      const today = new Date().toISOString().split('T')[0]

      const [allRes, lateRes, upcomingRes, allTeamRes] = await Promise.all([
        supabase.from('missions')
          .select('*, chef:profiles!chef_de_projet(prenom, nom)')
          .order('created_at', { ascending: false }),
        supabase.from('milestones')
          .select('*')
          .eq('done', false)
          .lt('due_date', today),
        supabase.from('milestones')
          .select('*, mission:missions(title)')
          .eq('done', false)
          .gte('due_date', today)
          .order('due_date')
          .limit(5),
        supabase.from('mission_team')
          .select('mission_id'),
      ])

      const all = allRes.data ?? []
      const activeMissionIds = new Set(all.filter(m => m.status === 'active').map(m => m.id))
      const activeConsultants = (allTeamRes.data ?? []).filter(r => activeMissionIds.has(r.mission_id)).length

      setAllMissions(all)
      setMyMissions(all.filter(m => m.chef_de_projet === user.id))
      setUpcomingMilestones(upcomingRes.data ?? [])
      setKpis({
        activeMissions: activeMissionIds.size,
        lateMilestones: (lateRes.data ?? []).length,
        activeConsultants,
      })
      setLoading(false)
    }
    fetchAll()
  }, [])

  return { kpis, myMissions, allMissions, upcomingMilestones, loading }
}
