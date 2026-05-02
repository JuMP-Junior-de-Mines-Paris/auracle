import { useState, useEffect } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useMyMissions() {
  const [missions, setMissions] = useState([])
  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: myMissions, error } = await supabase
        .from('missions')
        .select('*, chef:profiles!chef_de_projet(prenom, nom)')
        .eq('chef_de_projet', user.id)
        .order('created_at', { ascending: false })

      if (error || !myMissions?.length) {
        setMissions(myMissions ?? [])
        setMilestones([])
        setLoading(false)
        return
      }

      const ids = myMissions.map(m => m.id)
      const { data: allMilestones } = await supabase
        .from('milestones')
        .select('*')
        .in('mission_id', ids)
        .order('due_date')

      setMissions(myMissions)
      setMilestones(allMilestones ?? [])
      setLoading(false)
    }
    fetch()
  }, [])

  return { missions, milestones, loading }
}
