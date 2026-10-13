// Modèle du formulaire de convention d'étude.
//
// L'état du formulaire garde tout en chaînes (c'est ce que produisent les
// <input>) ; buildPayload() le convertit dans la forme que l'API attend
// (backend/app/services/ce_schema.py). L'API reste seule juge de la
// validité : ici on ne prévalide que ce qui évite un aller-retour inutile.

export const JEH_MIN = 80
export const JEH_MAX = 450

export const TYPES_CLIENT = [
  { value: 'entreprise', label: 'Entreprise' },
  { value: 'administration_publique', label: 'Administration publique' },
  { value: 'junior_sous_traitance', label: 'Junior-Entreprise (sous-traitance)' },
]

// Les sections rédigées : à la main aujourd'hui, générées puis relues demain.
export const PROSE = [
  { key: 'exemples', label: 'Exemples d’études déjà réalisées', hint: 'Une par ligne. Laisser vide pour retirer la phrase du document.', required: false },
  { key: 'contexte', label: 'Contexte, problématique et objectifs', hint: 'Le cadre de l’étude : entreprise, situation, enjeu, objectif.', required: true },
  { key: 'existant', label: 'Étude de l’existant', hint: 'Ce que fournit le client, ce sur quoi on se fonde.', required: true },
  { key: 'resume_cdc', label: 'Résumé du cahier des charges', hint: 'Bref : le détail suit dans la section suivante.', required: true },
  { key: 'cdc', label: 'Cahier des charges détaillé', hint: 'Livrables précis et formats, contraintes, critères d’acceptation, technologies.', required: true },
]

const personne = (extra = {}) => ({ titre: 'Monsieur', prenom: '', nom: '', fonction: '', email: '', ...extra })

export const newPhase = () => ({ nom: '', jeh: '', duree_semaines: '', debut_semaine: '', prix_jeh: '', description: '' })
export const newPointDeControle = () => ({ nom: '', format: '', requis_avant_phase: '' })
export const newIntervenant = () => ({ titre: 'Monsieur', prenom: '', nom: '', annee: '', qualification: '' })

// `globales` vient de GET /api/ce/globals (backend/app/services/ce_globals.py) :
// les valeurs d'usage de JuMP vivent côté serveur, à un seul endroit. Les
// valeurs ci-dessous ne servent que tant qu'elles ne sont pas arrivées.
// Le président n'est pas dans le formulaire : le serveur le fournit.
export function initialState(today = new Date(), globales = {}) {
  return {
    ref_ce: '',
    reference_etude: '',
    date_redaction: today.toISOString().slice(0, 10),
    validite_mois: String(globales.validite_mois ?? 3),
    client: {
      societe: '', adresse: '', code_postal: '', ville: '', pays: globales.pays ?? 'France', siret: '',
      type_client: 'entreprise',
      representant: personne(),
      interlocuteur: personne({ fonction: undefined }),
    },
    chef_projet: personne({ formation: '', fin_mandat: '' }),
    intervenants: [newIntervenant()],
    exemples: '', contexte: '', existant: '', resume_cdc: '', cdc: '',
    phases: [newPhase()],
    points_controle: [],
    budget: { prix_jeh: String(globales.prix_jeh ?? 300), frais_mode: 'reel', taux_tva: String(globales.taux_tva ?? 20) },
    paiement: { acompte_pct: String(globales.acompte_pct ?? 30), intermediaire_pct: '0', livrable_intermediaire: '' },
    reviews: {},
  }
}

const blank = v => v === '' || v === undefined || v === null
const int = v => (blank(v) ? null : Number(v))
// On écrit « 120,50 » en France : l'API attend un point.
const dec = (v, defaut = '0') => (blank(v) ? defaut : String(v).trim().replace(',', '.'))
const clean = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

function estVide(p) {
  return !p || ['prenom', 'nom', 'email', 'fonction'].every(k => blank(p[k]))
}

export function buildPayload(s) {
  return {
    ref_ce: s.ref_ce.trim(),
    reference_etude: s.reference_etude.trim(),
    date_redaction: s.date_redaction,
    validite_mois: int(s.validite_mois) ?? 3,
    client: {
      ...clean(s.client),
      representant: clean(s.client.representant),
      // Sans interlocuteur distinct, le serveur retombe sur le représentant.
      interlocuteur: estVide(s.client.interlocuteur) ? null : clean(s.client.interlocuteur),
    },
    chef_projet: clean(s.chef_projet),
    intervenants: s.intervenants.filter(i => ['prenom', 'nom', 'annee'].some(k => !blank(i[k]))),
    exemples: s.exemples, contexte: s.contexte, existant: s.existant,
    resume_cdc: s.resume_cdc, cdc: s.cdc,
    phases: s.phases.map(p => ({
      nom: p.nom.trim(),
      jeh: int(p.jeh),
      duree_semaines: int(p.duree_semaines),
      debut_semaine: int(p.debut_semaine),
      prix_jeh: blank(p.prix_jeh) ? null : dec(p.prix_jeh),
      description: p.description,
    })),
    points_controle: s.points_controle.map(pc => ({
      nom: pc.nom.trim(), format: pc.format.trim(), requis_avant_phase: int(pc.requis_avant_phase),
    })),
    budget: {
      frais_mode: s.budget.frais_mode,
      prix_jeh: dec(s.budget.prix_jeh, ''),
      taux_tva: dec(s.budget.taux_tva, '20'),
    },
    paiement: {
      ...s.paiement,
      acompte_pct: dec(s.paiement.acompte_pct),
      intermediaire_pct: dec(s.paiement.intermediaire_pct),
    },
    reviews: s.reviews,
  }
}

/**
 * Aperçu du budget et du planning pendant la saisie.
 *
 * Calcul en nombres flottants, donc indicatif : le document, lui, est
 * calculé côté serveur en Decimal. Les deux doivent concorder au centime
 * près, et c'est le serveur qui fait foi.
 */
export function previewTotals(s) {
  const num = v => {
    const n = Number(String(v ?? '').replace(',', '.'))
    return blank(v) || Number.isNaN(n) ? 0 : n
  }
  const prixDefaut = num(s.budget.prix_jeh)

  let jeh = 0, ht = 0, curseur = 1, fin = 0
  for (const p of s.phases) {
    const n = num(p.jeh)
    jeh += n
    ht += n * (blank(p.prix_jeh) ? prixDefaut : num(p.prix_jeh))
    const debut = blank(p.debut_semaine) ? curseur : num(p.debut_semaine)
    const duree = num(p.duree_semaines)
    curseur = debut + duree
    fin = Math.max(fin, debut + duree - 1)
  }
  // Le total HT est la somme des budgets de phase : rien ne s'y ajoute.
  const tva = ht * num(s.budget.taux_tva) / 100
  return { jeh, ht, totalHt: ht, tva, ttc: ht + tva, semaines: Math.max(fin, 0) }
}

export function prixHorsFourchette(s) {
  const prix = [s.budget.prix_jeh, ...s.phases.map(p => p.prix_jeh)]
    .filter(v => !blank(v)).map(v => Number(String(v).replace(',', '.')))
  return prix.some(p => p < JEH_MIN || p > JEH_MAX)
}

export const eur = n =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

// ─── Relecture des textes générés ────────────────────────────────────────

/** Marque un champ comme rédigé par l'IA : il devra être relu avant l'export. */
export function markGenerated(reviews, path) {
  return { ...reviews, [path]: { origin: 'ai', reviewed: false } }
}

/** Modifier un texte produit par l'IA annule la relecture : il faut relire ce qu'on a changé. */
export function onTextEdited(reviews, path) {
  const r = reviews[path]
  return r?.origin === 'ai' && r.reviewed ? { ...reviews, [path]: { ...r, reviewed: false } } : reviews
}

export function setReviewed(reviews, path, reviewed) {
  return reviews[path] ? { ...reviews, [path]: { ...reviews[path], reviewed } } : reviews
}

export const aRelire = reviews =>
  Object.entries(reviews).filter(([, r]) => r.origin === 'ai' && !r.reviewed).map(([k]) => k)

// ─── Messages d'erreur de l'API ──────────────────────────────────────────

const SEGMENTS = {
  ref_ce: 'Référence', reference_etude: 'Titre de l’étude', date_redaction: 'Date de rédaction',
  client: 'Client', societe: 'Société', representant: 'Représentant', interlocuteur: 'Interlocuteur',
  president: 'Président', chef_projet: 'Chef de projet', intervenants: 'Intervenant',
  phases: 'Phase', points_controle: 'Point de contrôle', budget: 'Budget', paiement: 'Paiement',
  prix_jeh: 'Prix du JEH', jeh: 'JEH', nom: 'Nom', prenom: 'Prénom', duree_semaines: 'Durée',
  format: 'Format', annee: 'Année', email: 'Email',
}

function emplacement(loc) {
  return loc
    .filter(seg => seg !== 'body')
    .map(seg => (typeof seg === 'number' ? String(seg + 1) : SEGMENTS[seg] ?? seg))
    .join(' › ')
}

// Pydantic répond en anglais ; un chef de projet doit pouvoir agir sur le message.
function messageFrancais(d) {
  const ctx = d.ctx ?? {}
  switch (d.type) {
    case 'missing':
    case 'string_too_short': return 'champ obligatoire'
    case 'too_short': return 'au moins un élément est requis'
    case 'int_parsing':
    case 'int_from_float':
    case 'int_type': return 'nombre entier attendu'
    case 'decimal_parsing':
    case 'decimal_type':
    case 'decimal_syntax': return 'nombre attendu'
    case 'greater_than_equal': return `doit être au moins ${ctx.ge}`
    case 'less_than_equal': return `ne peut dépasser ${ctx.le}`
    case 'date_parsing':
    case 'date_from_datetime_parsing':
    case 'date_type': return 'date invalide'
    case 'literal_error': return 'valeur non reconnue'
    default: return String(d.msg).replace(/^Value error, /, '')
  }
}

/** Transforme la réponse d'erreur de l'API en un titre et une liste de points. */
export function describeExportError(status, body, { injoignable = false } = {}) {
  const detail = body?.detail
  if (status === 401) return { title: 'Votre session a expiré. Reconnectez-vous.', items: [] }
  if (status === 403) return { title: 'Vous n’avez pas le droit de rédiger des conventions.', items: [] }
  if (status === 422 && detail?.code === 'ai_not_reviewed') {
    return { title: 'Des textes générés par l’IA n’ont pas été relus.', items: detail.fields, kind: 'review' }
  }
  if (status === 422 && detail?.code === 'incomplete') {
    return { title: 'Des sections obligatoires sont vides.', items: detail.missing, kind: 'incomplete' }
  }
  if (status === 422 && Array.isArray(detail)) {
    return {
      title: 'Certains champs sont invalides.',
      items: detail.map(d => `${emplacement(d.loc)} : ${messageFrancais(d)}`),
      kind: 'invalid',
    }
  }
  // Le proxy de développement répond 500 sans corps quand rien n'écoute sur le
  // port du backend ; un vrai plantage du serveur, lui, a toujours un corps.
  if (status >= 500 && injoignable) {
    return { title: 'Le serveur de génération ne répond pas. Le backend est-il lancé ?', items: [] }
  }
  if (status >= 500) return { title: 'Le serveur n’a pas pu générer le document. Réessayez.', items: [] }
  return { title: typeof detail === 'string' ? detail : 'La génération a échoué.', items: [] }
}

// ─── Brouillon local ─────────────────────────────────────────────────────

const CLE = 'jump.ce.brouillon.v1'

export function chargerBrouillon() {
  try {
    const brut = localStorage.getItem(CLE)
    return brut ? JSON.parse(brut) : null
  } catch {
    return null
  }
}

export function sauverBrouillon(state) {
  try { localStorage.setItem(CLE, JSON.stringify(state)) } catch { /* quota ou mode privé : pas bloquant */ }
}

export function effacerBrouillon() {
  try { localStorage.removeItem(CLE) } catch { /* idem */ }
}

/** Applique les valeurs d'usage du serveur aux champs encore sur leur valeur de départ. */
export function avecGlobales(s, g) {
  const depart = initialState()
  const si = (actuel, defaut, nouveau) => (actuel === defaut && nouveau !== undefined ? String(nouveau) : actuel)
  return {
    ...s,
    validite_mois: si(s.validite_mois, depart.validite_mois, g.validite_mois),
    budget: {
      ...s.budget,
      // Un ancien brouillon avec le prix vide reçoit aussi le prix d'usage.
      prix_jeh: s.budget.prix_jeh === '' ? String(g.prix_jeh ?? depart.budget.prix_jeh) : si(s.budget.prix_jeh, depart.budget.prix_jeh, g.prix_jeh),
      taux_tva: si(s.budget.taux_tva, depart.budget.taux_tva, g.taux_tva),
    },
    paiement: { ...s.paiement, acompte_pct: si(s.paiement.acompte_pct, depart.paiement.acompte_pct, g.acompte_pct) },
  }
}

/** Un brouillon d'avant les noms d'intervenant n'en a pas : on complète les lignes. */
export function completerIntervenants(s) {
  return { ...s, intervenants: s.intervenants.map(iv => ({ ...newIntervenant(), ...iv })) }
}

/** Fusionne un brouillon ancien dans la forme actuelle : un champ ajouté depuis ne le casse pas. */
export function fusionner(base, brouillon) {
  if (Array.isArray(base)) return Array.isArray(brouillon) ? brouillon : base
  if (base && typeof base === 'object') {
    const out = {}
    for (const k of new Set([...Object.keys(base), ...Object.keys(brouillon ?? {})])) {
      out[k] = k in base ? fusionner(base[k], brouillon?.[k]) : brouillon[k]
    }
    return out
  }
  return brouillon === undefined || brouillon === null ? base : brouillon
}
