import { describe, it, expect } from 'vitest'
import {
  initialState, buildPayload, previewTotals, prixHorsFourchette, markGenerated, onTextEdited,
  setReviewed, aRelire, describeExportError, fusionner, newPhase, newPointDeControle,
  avecGlobales, completerIntervenants,
} from '../../features/ce/lib/ceModel'

function rempli() {
  const s = initialState(new Date('2026-10-12'))
  s.ref_ce = ' CE-2026-014 '
  s.budget.prix_jeh = '120,50'
  s.phases = [
    { ...newPhase(), nom: 'Cadrage', jeh: '3', duree_semaines: '2' },
    { ...newPhase(), nom: 'Modélisation', jeh: '8', duree_semaines: '4' },
    { ...newPhase(), nom: 'Restitution', jeh: '2', duree_semaines: '1', debut_semaine: '7' },
  ]
  return s
}

describe('buildPayload', () => {
  it('convertit les chaînes du formulaire en types attendus par l’API', () => {
    const p = buildPayload(rempli())
    expect(p.ref_ce).toBe('CE-2026-014')
    expect(p.date_redaction).toBe('2026-10-12')
    expect(p.validite_mois).toBe(3)
    expect(p.phases.map(x => x.jeh)).toEqual([3, 8, 2])
    expect(p.phases[2].debut_semaine).toBe(7)
    expect(p.phases[0].debut_semaine).toBeNull()
    expect(p.phases[0].prix_jeh).toBeNull()
  })

  it('accepte la virgule décimale française', () => {
    const p = buildPayload(rempli())
    expect(p.budget.prix_jeh).toBe('120.50')
    const s = rempli()
    s.phases[0].prix_jeh = '99,9'
    s.paiement.acompte_pct = '33,3'
    const q = buildPayload(s)
    expect(q.phases[0].prix_jeh).toBe('99.9')
    expect(q.paiement.acompte_pct).toBe('33.3')
  })

  it('remplace un champ numérique vidé par sa valeur par défaut', () => {
    const s = rempli()
    s.budget.taux_tva = ''
    expect(buildPayload(s).budget).toMatchObject({ taux_tva: '20' })
  })

  it('n’envoie pas d’interlocuteur vide, mais envoie un interlocuteur rempli', () => {
    expect(buildPayload(rempli()).client.interlocuteur).toBeNull()
    const s = rempli()
    s.client.interlocuteur.nom = 'Martin'
    expect(buildPayload(s).client.interlocuteur.nom).toBe('Martin')
  })

  it('écarte les intervenants entièrement vides, garde leurs noms et les points de contrôle', () => {
    const s = rempli()
    s.intervenants = [
      { titre: 'Monsieur', prenom: '', nom: '', annee: '', qualification: 'x' },
      { titre: 'Madame', prenom: 'Camille', nom: 'Durand', annee: 'deuxième', qualification: '' },
    ]
    s.points_controle = [{ ...newPointDeControle(), format: 'Word', requis_avant_phase: '3' }]
    const p = buildPayload(s)
    expect(p.intervenants).toHaveLength(1)
    expect(p.intervenants[0]).toMatchObject({ titre: 'Madame', prenom: 'Camille', nom: 'Durand' })
    expect(p.points_controle[0].requis_avant_phase).toBe(3)
  })
})

describe('previewTotals', () => {
  it('retrouve les montants calculés par le serveur', () => {
    const t = previewTotals(rempli())
    expect(t.jeh).toBe(13)
    expect(t.ht).toBeCloseTo(1566.5, 2)
    expect(t.totalHt).toBeCloseTo(t.ht, 5)          // total HT = somme des budgets de phase
    expect(t.tva).toBeCloseTo(313.3, 2)
    expect(t.ttc).toBeCloseTo(1879.8, 2)
    expect(t.semaines).toBe(7)
  })

  it('enchaîne les phases sans début imposé et tolère un formulaire vide', () => {
    const s = rempli()
    s.phases[2].debut_semaine = ''
    expect(previewTotals(s).semaines).toBe(7)
    expect(previewTotals(initialState())).toMatchObject({ jeh: 0, totalHt: 0, semaines: 0 })
  })

  it('applique le prix propre à une phase', () => {
    const s = rempli()
    s.phases[0].prix_jeh = '200'
    expect(previewTotals(s).ht).toBeCloseTo(600 + 8 * 120.5 + 2 * 120.5, 2)
  })
})

describe('fourchette du JEH', () => {
  it('signale un prix hors de 80–450 € HT, au niveau du budget comme d’une phase', () => {
    const s = rempli()
    expect(prixHorsFourchette(s)).toBe(false)
    s.phases[1].prix_jeh = '30'
    expect(prixHorsFourchette(s)).toBe(true)
    s.phases[1].prix_jeh = ''
    s.budget.prix_jeh = '500'
    expect(prixHorsFourchette(s)).toBe(true)
  })
})

describe('relecture des textes générés', () => {
  it('un texte IA est à relire tant qu’il n’est pas validé', () => {
    let r = markGenerated({}, 'cdc')
    expect(aRelire(r)).toEqual(['cdc'])
    r = setReviewed(r, 'cdc', true)
    expect(aRelire(r)).toEqual([])
  })

  it('modifier un texte déjà relu annule la relecture', () => {
    let r = setReviewed(markGenerated({}, 'cdc'), 'cdc', true)
    r = onTextEdited(r, 'cdc')
    expect(aRelire(r)).toEqual(['cdc'])
  })

  it('un texte écrit à la main n’est jamais à relire', () => {
    expect(aRelire({ contexte: { origin: 'manual', reviewed: false } })).toEqual([])
    expect(onTextEdited({}, 'contexte')).toEqual({})
  })
})

describe('describeExportError', () => {
  it('relit les champs IA non relus', () => {
    const e = describeExportError(422, { detail: { code: 'ai_not_reviewed', fields: ['cdc'] } })
    expect(e.items).toEqual(['cdc'])
    expect(e.kind).toBe('review')
  })

  it('liste les sections obligatoires vides et propose le brouillon', () => {
    const e = describeExportError(422, { detail: { code: 'incomplete', missing: ['Contexte et problématique'] } })
    expect(e.kind).toBe('incomplete')
    expect(e.items).toEqual(['Contexte et problématique'])
  })

  it('traduit les erreurs de validation en emplacements lisibles, phases numérotées à partir de 1', () => {
    const e = describeExportError(422, {
      detail: [{ loc: ['body', 'phases', 1, 'jeh'], msg: 'Input should be a valid integer' }],
    })
    expect(e.items[0]).toBe('Phase › 2 › JEH : Input should be a valid integer')
  })

  it('rédige en français les erreurs de validation courantes', () => {
    const items = describeExportError(422, {
      detail: [
        { loc: ['body', 'client', 'societe'], type: 'string_too_short', msg: 'String should have at least 1 character' },
        { loc: ['body', 'phases', 0, 'jeh'], type: 'int_parsing', msg: 'Input should be a valid integer' },
        { loc: ['body', 'phases', 0, 'duree_semaines'], type: 'greater_than_equal', msg: 'x', ctx: { ge: 1 } },
        { loc: ['body', 'phases'], type: 'too_short', msg: 'List should have at least 1 item' },
        { loc: ['body', 'budget', 'prix_jeh'], type: 'decimal_parsing', msg: 'Input should be a valid decimal' },
      ],
    }).items
    expect(items).toEqual([
      'Client › Société : champ obligatoire',
      'Phase › 1 › JEH : nombre entier attendu',
      'Phase › 1 › Durée : doit être au moins 1',
      'Phase : au moins un élément est requis',
      'Budget › Prix du JEH : nombre attendu',
    ])
  })

  it('retire le préfixe technique « Value error, »', () => {
    const e = describeExportError(422, {
      detail: [{ loc: ['body', 'budget', 'prix_jeh'], msg: 'Value error, le prix d\'un JEH doit être compris entre 80 et 450 € HT' }],
    })
    expect(e.items[0]).toBe('Budget › Prix du JEH : le prix d\'un JEH doit être compris entre 80 et 450 € HT')
  })

  it('distingue session expirée, droits manquants et panne serveur', () => {
    expect(describeExportError(401).title).toMatch(/session/)
    expect(describeExportError(403).title).toMatch(/droit/)
    expect(describeExportError(500).title).toMatch(/serveur/)
  })
})

describe('fusionner', () => {
  it('complète un ancien brouillon avec les champs ajoutés depuis', () => {
    const base = initialState()
    const vieux = { ref_ce: 'CE-1', client: { societe: 'Acme' } }
    const f = fusionner(base, vieux)
    expect(f.ref_ce).toBe('CE-1')
    expect(f.client.societe).toBe('Acme')
    expect(f.client.pays).toBe('France')
    expect(f.phases).toHaveLength(1)
  })

  it('reprend les listes du brouillon telles quelles', () => {
    const f = fusionner(initialState(), { phases: [{ nom: 'A' }, { nom: 'B' }] })
    expect(f.phases.map(p => p.nom)).toEqual(['A', 'B'])
  })

  it('sans brouillon, rend l’état initial', () => {
    expect(fusionner(initialState(), null)).toEqual(initialState())
  })
})

describe('variables globales', () => {
  it('n’envoie pas le président : le serveur le fournit', () => {
    expect(buildPayload(rempli())).not.toHaveProperty('president')
    expect(initialState()).not.toHaveProperty('president')
  })

  it('applique les valeurs d’usage du serveur aux seuls champs encore intacts', () => {
    const g = { validite_mois: 6, taux_tva: '5.5', acompte_pct: '40' }
    const intact = avecGlobales(initialState(), g)
    expect(intact.validite_mois).toBe('6')
    expect(intact.budget.taux_tva).toBe('5.5')
    expect(intact.paiement.acompte_pct).toBe('40')

    const touche = initialState()
    touche.validite_mois = '12'
    expect(avecGlobales(touche, g).validite_mois).toBe('12')
  })

  it('un brouillon d’avant les noms d’intervenant reste utilisable', () => {
    const vieux = { ...initialState(), intervenants: [{ annee: 'deuxième', qualification: '' }] }
    expect(completerIntervenants(vieux).intervenants[0]).toMatchObject({ prenom: '', nom: '', titre: 'Monsieur', annee: 'deuxième' })
  })
})

describe('prix d’usage du JEH', () => {
  it('est prérempli à 300 € puis suit les variables globales du serveur', () => {
    expect(initialState().budget.prix_jeh).toBe('300')
    expect(initialState(new Date(), { prix_jeh: '320' }).budget.prix_jeh).toBe('320')
    expect(avecGlobales(initialState(), { prix_jeh: '320' }).budget.prix_jeh).toBe('320')
  })
  it('ne remplace jamais un prix saisi par le rédacteur', () => {
    const s = initialState(); s.budget.prix_jeh = '250'
    expect(avecGlobales(s, { prix_jeh: '320' }).budget.prix_jeh).toBe('250')
  })
  it('complète un ancien brouillon resté sans prix', () => {
    const s = initialState(); s.budget.prix_jeh = ''
    expect(avecGlobales(s, { prix_jeh: '300' }).budget.prix_jeh).toBe('300')
  })
})
