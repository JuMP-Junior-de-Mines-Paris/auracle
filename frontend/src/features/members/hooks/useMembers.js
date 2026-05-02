import { useState, useEffect } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useMembers() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, prenom, nom, role, email')
      .order('nom')
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setMembers(data ?? [])
        setLoading(false)
      })
  }, [])

  return { members, loading, error }
}
