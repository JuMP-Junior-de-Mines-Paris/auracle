import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useMissionDetail(id) {
  const [mission, setMission] = useState(null)
  const [team, setTeam] = useState([])
  const [milestones, setMilestones] = useState([])
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [mRes, tRes, mlRes, meRes] = await Promise.all([
      supabase.from('missions').select('*, chef:profiles!chef_de_projet(prenom, nom)').eq('id', id).single(),
      supabase.from('mission_team').select('profile_id, member:profiles!profile_id(prenom, nom, role)').eq('mission_id', id),
      supabase.from('milestones').select('*').eq('mission_id', id).order('due_date'),
      supabase.from('meetings').select('*').eq('mission_id', id).order('date', { ascending: false }),
    ])
    setMission(mRes.data ?? null)
    setTeam((tRes.data ?? []).map(r => ({ id: r.profile_id, ...r.member })))
    setMilestones(mlRes.data ?? [])
    setMeetings(meRes.data ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function addTeamMember(profileId) {
    const { error } = await supabase.from('mission_team').insert({ mission_id: id, profile_id: profileId })
    if (error) throw error
    await fetchAll()
  }

  async function removeTeamMember(profileId) {
    const { error } = await supabase.from('mission_team').delete().match({ mission_id: id, profile_id: profileId })
    if (error) throw error
    setTeam(prev => prev.filter(m => m.id !== profileId))
  }

  async function createMilestone(title, dueDate) {
    const { data, error } = await supabase
      .from('milestones')
      .insert({ mission_id: id, title, due_date: dueDate || null })
      .select()
      .single()
    if (error) throw error
    setMilestones(prev => [...prev, data].sort((a, b) => (a.due_date ?? '9999') > (b.due_date ?? '9999') ? 1 : -1))
    return data
  }

  async function toggleMilestone(milestoneId, done) {
    const { error } = await supabase.from('milestones').update({ done }).eq('id', milestoneId)
    if (error) throw error
    setMilestones(prev => prev.map(m => m.id === milestoneId ? { ...m, done } : m))
  }

  async function deleteMilestone(milestoneId) {
    const { error } = await supabase.from('milestones').delete().eq('id', milestoneId)
    if (error) throw error
    setMilestones(prev => prev.filter(m => m.id !== milestoneId))
  }

  async function createMeeting(fields) {
    const { data, error } = await supabase
      .from('meetings')
      .insert({ ...fields, mission_id: id })
      .select()
      .single()
    if (error) throw error
    setMeetings(prev => [data, ...prev])
    return data
  }

  async function deleteMeeting(meetingId) {
    const { error } = await supabase.from('meetings').delete().eq('id', meetingId)
    if (error) throw error
    setMeetings(prev => prev.filter(m => m.id !== meetingId))
  }

  async function updateMission(fields) {
    const { data, error } = await supabase
      .from('missions')
      .update(fields)
      .eq('id', id)
      .select('*, chef:profiles!chef_de_projet(prenom, nom)')
      .single()
    if (error) throw error
    setMission(data)
    return data
  }

  return {
    mission, team, milestones, meetings, loading,
    updateMission,
    addTeamMember, removeTeamMember,
    createMilestone, toggleMilestone, deleteMilestone,
    createMeeting, deleteMeeting,
    refetch: fetchAll,
  }
}
