import { useState, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { buildPayload, describeExportError } from '../lib/ceModel'

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Envoie le formulaire à l'API et déclenche le téléchargement du .docx.
 *
 * L'appel passe par /api (même origine en production, proxy Vite en
 * développement) avec le jeton Supabase : le backend vérifie la permission
 * ce.write lui-même, la clé service-role contournant la RLS.
 */
export function useCeExport() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(null)

  const exportDocx = useCallback(async (state, { brouillon = false } = {}) => {
    setExporting(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) {
        setError(describeExportError(401))
        return false
      }

      const res = await fetch(`/api/ce/export-docx${brouillon ? '?brouillon=true' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildPayload(state)),
      })

      if (!res.ok) {
        const brut = await res.text().catch(() => '')
        let body = null
        try { body = JSON.parse(brut) } catch { /* texte brut ou vide */ }
        setError(describeExportError(res.status, body, { injoignable: brut.trim() === '' }))
        return false
      }

      const nom = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1]
      telecharger(await res.blob(), nom ?? 'Convention-d-Etude.docx')
      return true
    } catch {
      setError({ title: 'Connexion au serveur impossible. Vérifiez votre réseau.', items: [] })
      return false
    } finally {
      setExporting(false)
    }
  }, [])

  return { exporting, error, exportDocx, clearError: () => setError(null) }
}
