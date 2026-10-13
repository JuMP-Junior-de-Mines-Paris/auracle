import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../shared/lib/api'

/**
 * Clé Gemini du membre connecté. Le serveur ne la renvoie jamais : on ne
 * connaît que « configurée » et ses quatre derniers caractères.
 */
export function useAiKey() {
  const [etat, setEtat] = useState({ chargement: true, configured: false, hint: null, model: null, erreur: null })

  useEffect(() => {
    let actif = true
    api('/api/ai-key').then(r => {
      if (!actif) return
      setEtat(r.ok
        ? { chargement: false, configured: r.data.configured, hint: r.data.hint, model: r.data.model, erreur: null }
        : { chargement: false, configured: false, hint: null, model: null, erreur: r.message })
    })
    return () => { actif = false }
  }, [])

  /** Renvoie { ok, message, modelOk }. Le message d'erreur est affichable tel quel. */
  const enregistrer = useCallback(async cle => {
    const r = await api('/api/ai-key', { method: 'PUT', body: { key: cle } })
    if (!r.ok) return { ok: false, message: r.message }
    setEtat(e => ({ ...e, configured: true, hint: r.data.hint, model: r.data.model, erreur: null }))
    return { ok: true, modelOk: r.data.model_ok }
  }, [])

  const supprimer = useCallback(async () => {
    const r = await api('/api/ai-key', { method: 'DELETE' })
    if (!r.ok) return { ok: false, message: r.message }
    setEtat(e => ({ ...e, configured: false, hint: null }))
    return { ok: true }
  }, [])

  return { ...etat, enregistrer, supprimer }
}
