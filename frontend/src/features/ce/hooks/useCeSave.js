import { useState, useCallback } from 'react'
import { api } from '../../../shared/lib/api'
import { buildPayload, describeExportError } from '../lib/ceModel'

/**
 * Enregistre la convention dans les archives (POST /api/ce/save) : une
 * référence = une mission archivée, catégorie « convention d'étude ».
 *
 * Renvoie { ok, status, data, error } sans jamais lever. `error` a la même
 * forme que celle de l'export ({ title, items }) pour s'afficher au même endroit.
 */
export function useCeSave() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const save = useCallback(async state => {
    setSaving(true)
    setError(null)
    const r = await api('/api/ce/save', { method: 'POST', body: buildPayload(state) })
    setSaving(false)
    if (r.ok) return { ok: true, status: r.status, data: r.data, error: null }

    const err = r.status === 403
      ? { title: 'Enregistrer dans les archives demande le droit de rédiger des conventions (ce.write).', items: [] }
      : r.status === 401 || r.status === 422
        ? describeExportError(r.status, r.data)
        : { title: r.message, items: [] }
    setError(err)
    return { ok: false, status: r.status, data: null, error: err }
  }, [])

  return { saving, saveError: error, save, clearSaveError: () => setError(null) }
}
