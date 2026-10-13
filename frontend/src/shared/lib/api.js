import { supabase } from './supabase'

/**
 * Appel authentifié au backend FastAPI (/api, même origine en production,
 * proxy Vite en développement).
 *
 * Ne lève jamais : renvoie { ok, status, data, message }. `message` est déjà
 * lisible, que le serveur ait répondu { detail: { message } }, { detail: "…" }
 * ou rien du tout (backend éteint : le proxy Vite répond 500 sans corps).
 */
export async function api(path, { method = 'GET', body } = {}) {
  try {
    const { data: session } = await supabase.auth.getSession()
    const token = session?.session?.access_token
    if (!token) return { ok: false, status: 401, data: null, message: 'Session expirée : reconnectez-vous.' }

    const res = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
    const brut = await res.text().catch(() => '')
    let data = null
    try { data = brut ? JSON.parse(brut) : null } catch { /* texte brut */ }
    if (res.ok) return { ok: true, status: res.status, data, message: null }

    const detail = data?.detail
    const message = detail?.message
      ?? (typeof detail === 'string' ? detail : null)
      ?? (brut.trim() === '' ? 'Le serveur ne répond pas. Le backend est-il lancé ?' : `Erreur ${res.status}`)
    return { ok: false, status: res.status, data, code: detail?.code ?? null, message }
  } catch {
    return { ok: false, status: 0, data: null, message: 'Connexion au serveur impossible. Vérifiez votre réseau.' }
  }
}
