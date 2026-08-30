// Traduction des erreurs PostgREST / Postgres en phrases lisibles.
//
// L'enjeu principal : depuis la migration 009, un refus de permission
// renvoie une liste vide ou une 403. Sans ce message, l'utilisateur lit
// « aucune donnée » là où il faudrait lire « vous n'avez pas le droit ».

const CODES = {
  // insufficient_privilege — levé par nos triggers de garde
  '42501': "Vous n'avez pas les droits nécessaires pour cette action.",
  // violation de RLS à l'insertion
  '42P17': "Vous n'avez pas les droits nécessaires pour cette action.",
  // unique_violation — servira au dédoublonnage de l'annuaire
  '23505': 'Cet enregistrement existe déjà.',
  // foreign_key_violation
  '23503': 'Cet élément est rattaché à un autre enregistrement.',
  // no_data_found
  'P0002': 'Enregistrement introuvable.',
  // PostgREST : aucune ligne renvoyée par .single()
  'PGRST116': 'Enregistrement introuvable, ou hors de votre périmètre.',
}

export function describeError(error) {
  if (!error) return null
  if (CODES[error.code]) return CODES[error.code]

  const msg = error.message ?? String(error)
  if (/row-level security|violates row-level/i.test(msg)) {
    return "Vous n'avez pas les droits nécessaires pour cette action."
  }
  if (/JWT|token/i.test(msg)) {
    return 'Votre session a expiré. Reconnectez-vous.'
  }
  if (/fetch|network/i.test(msg)) {
    return 'Connexion au serveur impossible. Vérifiez votre réseau.'
  }
  return msg
}

export function isPermissionError(error) {
  if (!error) return false
  return error.code === '42501'
    || /row-level security|violates row-level|insufficient/i.test(error.message ?? '')
}
