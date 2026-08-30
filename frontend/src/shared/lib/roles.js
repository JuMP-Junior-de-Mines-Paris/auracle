// Présentation des rôles du bureau.
//
// La table `roles` en base fait foi pour la liste des rôles et la matrice des
// permissions ; ce fichier ne porte que l'habillage (libellé court, couleur).
// Un code inconnu retombe sur un rendu neutre, donc l'ajout d'un rôle en base
// n'affiche jamais de page cassée — seulement un badge gris à styler ici.

// Trois groupes, calqués sur l'organisation de la JuMP. Le bureau détient
// tous les droits ; le bureau étendu a des droits ciblés sur son domaine.
// Le groupe ne confère rien par lui-même — c'est `role_permissions` en base
// qui fait foi — il sert à l'affichage et au tri.
export const GROUPES = {
  bureau:        { label: 'Bureau',        rank: 1 },
  bureau_etendu: { label: 'Bureau étendu', rank: 2 },
  membre:        { label: 'Membres',       rank: 3 },
}

export const ROLE_META = {
  president:          { label: 'Président·e',                          short: 'Président',       groupe: 'bureau',        rank: 10, bg: '#dbeafe', fg: '#1d4ed8' },
  vice_president:     { label: 'Vice-président·e',                     short: 'Vice-président',  groupe: 'bureau',        rank: 20, bg: '#dbeafe', fg: '#1d4ed8' },
  secretaire_general: { label: 'Secrétaire général·e',                 short: 'Secrétaire',      groupe: 'bureau',        rank: 30, bg: '#ede9fe', fg: '#6d28d9' },
  tresorier:          { label: 'Trésorier·ère',                        short: 'Trésorier',       groupe: 'bureau',        rank: 40, bg: '#dcfce7', fg: '#15803d' },
  vice_tresorier:     { label: 'Vice-trésorier·ère',                   short: 'Vice-trésorier',  groupe: 'bureau_etendu', rank: 50, bg: '#dcfce7', fg: '#15803d' },
  respo_dev_co:       { label: 'Responsable développement commercial', short: 'Dév. commercial', groupe: 'bureau_etendu', rank: 60, bg: '#fef3c7', fg: '#b45309' },
  respo_qualite:      { label: 'Responsable qualité',                  short: 'Qualité',         groupe: 'bureau_etendu', rank: 70, bg: '#ccfbf1', fg: '#0f766e' },
  respo_info:         { label: 'Responsable informatique',             short: 'Informatique',    groupe: 'bureau_etendu', rank: 80, bg: '#e2e8f0', fg: '#334155' },
  chef_de_projet:     { label: 'Chef·fe de projet',                    short: 'Chef de projet',  groupe: 'membre',        rank: 90, bg: '#f3f4f6', fg: '#374151' },

  // Anciens codes — le temps que la migration 008 soit appliquée.
  admin:           { label: 'Admin',          short: 'Admin',          groupe: 'bureau', rank: 10, bg: '#dbeafe', fg: '#1d4ed8' },
  project_manager: { label: 'Chef de projet', short: 'Chef de projet', groupe: 'membre', rank: 90, bg: '#dcfce7', fg: '#15803d' },
  consultant:      { label: 'Consultant',     short: 'Consultant',     groupe: 'membre', rank: 95, bg: '#f3f4f6', fg: '#374151' },
}

// Volontairement en hexadécimal : les appelants concatènent l'opacité
// (`fg + '1a'`), ce qu'une var() CSS ne supporte pas.
const FALLBACK = { label: '—', short: '—', groupe: 'membre', rank: 999, bg: '#f3f4f6', fg: '#6b7280' }

export function roleMeta(code) {
  return ROLE_META[code] ?? (code ? { ...FALLBACK, label: code, short: code } : FALLBACK)
}

export function roleLabel(code) {
  return roleMeta(code).label
}

// Tri des membres par place dans le bureau, puis par nom.
export function compareByRole(a, b) {
  const d = roleMeta(a.role).rank - roleMeta(b.role).rank
  return d !== 0 ? d : (a.nom ?? '').localeCompare(b.nom ?? '', 'fr')
}

// Membres triés puis découpés en [{ groupe, label, members }], sans groupe vide.
export function groupMembers(members) {
  const buckets = new Map()
  for (const m of [...members].sort(compareByRole)) {
    const g = roleMeta(m.role).groupe
    if (!buckets.has(g)) buckets.set(g, [])
    buckets.get(g).push(m)
  }
  return [...buckets.entries()]
    .map(([groupe, list]) => ({
      groupe,
      label: GROUPES[groupe]?.label ?? groupe,
      rank: GROUPES[groupe]?.rank ?? 99,
      members: list,
    }))
    .sort((a, b) => a.rank - b.rank)
}
