// Pipeline de prospection — miroir de la table prospect_statuses (013).
//
// La base fait foi pour les codes valides (contacts.status y a une clé
// étrangère) ; ce fichier ne porte que l'habillage et l'ordre d'affichage.

export const STATUSES = [
  { code: 'a_contacter',   label: 'À contacter',   rank: 10, open: true,  bg: '#f3f4f6', fg: '#4b5563' },
  { code: 'contacte',      label: 'Contacté',      rank: 20, open: true,  bg: '#dbeafe', fg: '#1d4ed8' },
  { code: 'relance',       label: 'Relancé',       rank: 30, open: true,  bg: '#e0e7ff', fg: '#4338ca' },
  { code: 'en_discussion', label: 'En discussion', rank: 40, open: true,  bg: '#fef3c7', fg: '#b45309' },
  { code: 'rdv_planifie',  label: 'RDV planifié',  rank: 50, open: true,  bg: '#ffedd5', fg: '#c2410c' },
  { code: 'converti',      label: 'Converti',      rank: 60, open: false, bg: '#dcfce7', fg: '#15803d' },
  { code: 'sans_reponse',  label: 'Sans réponse',  rank: 70, open: false, bg: '#f3f4f6', fg: '#6b7280' },
  { code: 'refuse',        label: 'Refusé',        rank: 80, open: false, bg: '#fee2e2', fg: '#b91c1c' },
  { code: 'a_recontacter', label: 'À recontacter', rank: 90, open: false, bg: '#f5f3ff', fg: '#7c3aed' },
]

const NONE = { code: null, label: '—', rank: 0, open: true, bg: '#f9fafb', fg: '#9ca3af' }

export function statusMeta(code) {
  return STATUSES.find(s => s.code === code) ?? (code ? { ...NONE, label: code } : NONE)
}

// Les étapes du pipeline (colonnes du kanban), puis les voies de sortie.
export const OPEN_STATUSES = STATUSES.filter(s => s.open)
export const EXIT_STATUSES = STATUSES.filter(s => !s.open)

export const CHANNELS = [
  { code: 'email',     label: 'E-mail',      icon: 'mail' },
  { code: 'linkedin',  label: 'LinkedIn',    icon: 'link' },
  { code: 'telephone', label: 'Téléphone',   icon: 'phone' },
  { code: 'evenement', label: 'Événement',   icon: 'calendar' },
  { code: 'autre',     label: 'Autre',       icon: 'inbox' },
]

export function channelMeta(code) {
  return CHANNELS.find(c => c.code === code) ?? CHANNELS[4]
}

// Anciennes valeurs françaises, au cas où une fiche n'aurait pas été reprise
// par la migration 013. Évite d'afficher un libellé brut accentué.
export const LEGACY_STATUS_MAP = {
  'à contacter': 'a_contacter',
  'contacté': 'contacte',
  'répondu': 'en_discussion',
  'travaillé': 'converti',
}

export function normalizeStatus(code) {
  return LEGACY_STATUS_MAP[code] ?? code
}
