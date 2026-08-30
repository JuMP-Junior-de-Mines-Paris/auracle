import { describe, it, expect } from 'vitest'
import { describeError, isPermissionError } from '../../shared/lib/errors'
import { roleMeta, groupMembers, compareByRole } from '../../shared/lib/roles'
import { statusMeta, normalizeStatus, OPEN_STATUSES, EXIT_STATUSES } from '../../shared/lib/prospect'
import { groupByDue, taskStatus, taskPriority } from '../../features/tasks/hooks/useTasks'

describe('describeError', () => {
  it('traduit un refus de permission en phrase compréhensible', () => {
    expect(describeError({ code: '42501' })).toMatch(/droits/i)
    expect(describeError({ message: 'new row violates row-level security policy' })).toMatch(/droits/i)
  })

  it('distingue le doublon des autres erreurs', () => {
    expect(describeError({ code: '23505' })).toMatch(/existe déjà/i)
  })

  it('laisse passer un message inconnu plutôt que de l\'avaler', () => {
    expect(describeError({ message: 'boom' })).toBe('boom')
    expect(describeError(null)).toBeNull()
  })

  it('isPermissionError ne se déclenche que sur un vrai refus', () => {
    expect(isPermissionError({ code: '42501' })).toBe(true)
    expect(isPermissionError({ code: '23505' })).toBe(false)
    expect(isPermissionError(null)).toBe(false)
  })
})

describe('roles', () => {
  it('rend un code inconnu sans casser la page', () => {
    const m = roleMeta('respo_licornes')
    expect(m.label).toBe('respo_licornes')
    // Hexadécimal obligatoire : les appelants concatènent l'opacité.
    expect(m.fg).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('connaît encore les anciens codes, avant la migration 008', () => {
    expect(roleMeta('admin').groupe).toBe('bureau')
    expect(roleMeta('project_manager').groupe).toBe('membre')
  })

  it('trie par place dans le bureau, puis par nom', () => {
    const membres = [
      { role: 'chef_de_projet', nom: 'Zoe' },
      { role: 'president', nom: 'Bob' },
      { role: 'chef_de_projet', nom: 'Alice' },
    ]
    const tries = [...membres].sort(compareByRole).map(m => m.nom)
    expect(tries).toEqual(['Bob', 'Alice', 'Zoe'])
  })

  it('groupe par cercle, sans produire de groupe vide', () => {
    const groupes = groupMembers([
      { id: 1, role: 'president', nom: 'A' },
      { id: 2, role: 'respo_qualite', nom: 'B' },
      { id: 3, role: 'tresorier', nom: 'C' },
    ])
    expect(groupes.map(g => g.groupe)).toEqual(['bureau', 'bureau_etendu'])
    expect(groupes[0].members).toHaveLength(2)
    expect(groupes.every(g => g.members.length > 0)).toBe(true)
  })
})

describe('pipeline de prospection', () => {
  it('sépare les étapes ouvertes des voies de sortie', () => {
    expect(OPEN_STATUSES.map(s => s.code)).toContain('en_discussion')
    expect(EXIT_STATUSES.map(s => s.code)).toEqual(
      expect.arrayContaining(['converti', 'refuse', 'sans_reponse', 'a_recontacter'])
    )
    expect(OPEN_STATUSES.some(s => s.code === 'refuse')).toBe(false)
  })

  it('convertit les anciens libellés français en codes', () => {
    expect(normalizeStatus('à contacter')).toBe('a_contacter')
    expect(normalizeStatus('travaillé')).toBe('converti')
    expect(normalizeStatus('répondu')).toBe('en_discussion')
    expect(normalizeStatus('en_discussion')).toBe('en_discussion')
    expect(normalizeStatus(null)).toBeNull()
  })

  it('rend un statut absent sans planter', () => {
    expect(statusMeta(null).label).toBe('—')
    expect(statusMeta('converti').label).toBe('Converti')
  })
})

describe('groupByDue', () => {
  const jour = n => new Date(Date.now() + n * 864e5).toISOString().split('T')[0]

  it('range par urgence et ignore ce qui est clos', () => {
    const groupes = groupByDue([
      { id: 1, due_date: jour(-3), status: 'a_faire' },
      { id: 2, due_date: jour(0),  status: 'en_cours' },
      { id: 3, due_date: jour(3),  status: 'a_faire' },
      { id: 4, due_date: jour(60), status: 'a_faire' },
      { id: 5, due_date: null,     status: 'a_faire' },
      { id: 6, due_date: jour(-9), status: 'termine' },
      { id: 7, due_date: jour(-9), status: 'annule' },
    ])

    expect(groupes.map(g => g.key)).toEqual([
      'en_retard', 'aujourdhui', 'cette_semaine', 'plus_tard', 'sans_echeance',
    ])
    // Les tâches closes ne réapparaissent jamais dans « en retard ».
    expect(groupes[0].tasks.map(t => t.id)).toEqual([1])
    expect(groupes.flatMap(g => g.tasks).map(t => t.id)).not.toContain(6)
  })

  it('ne renvoie que les groupes non vides', () => {
    const groupes = groupByDue([{ id: 1, due_date: null, status: 'a_faire' }])
    expect(groupes).toHaveLength(1)
    expect(groupes[0].key).toBe('sans_echeance')
  })

  it('marque comme urgents le retard et le jour même', () => {
    const groupes = groupByDue([
      { id: 1, due_date: jour(-1), status: 'a_faire' },
      { id: 2, due_date: jour(30), status: 'a_faire' },
    ])
    expect(groupes.find(g => g.key === 'en_retard').urgent).toBe(true)
    expect(groupes.find(g => g.key === 'plus_tard').urgent).toBe(false)
  })

  it('retombe sur une valeur sûre pour un statut ou une priorité inconnus', () => {
    expect(taskStatus('inconnu').code).toBe('a_faire')
    expect(taskPriority('inconnue').code).toBe('normale')
  })
})
