import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { STATUSES, statusMeta } from '../../../shared/lib/prospect'
import { useAction } from '../../../shared/components/ToastProvider'
import { useMembers } from '../../members/hooks/useMembers'
import { useProspectingLists } from '../hooks/useProspectingLists'
import {
  useSegments, useSegmentPreview, useFacets,
  CRITERES_VIDES, resumer, estVide,
} from '../hooks/useSegments'

/** Une valeur cliquable, avec son poids réel en base. */
function Puce({ valeur, n, actif, onToggle }) {
  return (
    <button
      onClick={() => onToggle(valeur)}
      title={`${n} fiche${n > 1 ? 's' : ''}`}
      style={{
        fontSize: 12, padding: '3px 9px', borderRadius: 99, cursor: 'pointer', whiteSpace: 'nowrap',
        background: actif ? 'var(--ember-soft)' : 'transparent',
        color: actif ? 'var(--ember-2)' : 'var(--ink-3)',
        border: `1px solid ${actif ? '#c2d9ef' : 'var(--line)'}`,
      }}
    >
      {actif && <Icon name="check" size={9} />} {valeur}
      <span style={{ color: 'var(--ink-4)', fontSize: 10.5 }}> {n}</span>
    </button>
  )
}

function Groupe({ titre, valeurs, choisis, onToggle, libre, onLibre }) {
  const [texte, setTexte] = useState('')
  if (!valeurs?.length && !libre) return null

  // Ce qui a été saisi à la main n'est pas dans les facettes : on l'affiche
  // quand même, sinon un critère actif deviendrait invisible.
  const hors = choisis.filter(c => !valeurs?.some(v => v.valeur === c))

  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-4)', marginBottom: 6 }}>
        {titre}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: libre ? 6 : 0 }}>
        {hors.map(v => <Puce key={v} valeur={v} n={0} actif onToggle={onToggle} />)}
        {(valeurs ?? []).map(v => (
          <Puce key={v.valeur} valeur={v.valeur} n={v.n} actif={choisis.includes(v.valeur)} onToggle={onToggle} />
        ))}
      </div>
      {libre && (
        <form
          onSubmit={e => { e.preventDefault(); if (texte.trim()) { onLibre(texte.trim()); setTexte('') } }}
          style={{ display: 'flex', gap: 5 }}
        >
          <input
            className="field"
            style={{ fontSize: 12, padding: '4px 8px', flex: 1 }}
            placeholder={`Autre ${titre.toLowerCase()}… (contient)`}
            value={texte}
            onChange={e => setTexte(e.target.value)}
          />
        </form>
      )}
    </div>
  )
}

function Enregistrer({ criteria, count, onSave, onClose }) {
  const [f, setF] = useState({ name: '', description: '', partage: true })
  const [envoi, setEnvoi] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!f.name.trim() || envoi) return
    setEnvoi(true)
    await onSave({ ...f, criteria })
    setEnvoi(false)
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
      <input className="field" style={{ fontSize: 13.5 }} autoFocus
             placeholder="Nom du segment — « Énergie, promos récentes, Paris »…"
             value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} />
      <input className="field" style={{ fontSize: 12.5 }}
             placeholder="À quoi sert ce segment ? (facultatif)"
             value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-3)' }}>
        <input type="checkbox" checked={f.partage} onChange={e => setF(p => ({ ...p, partage: e.target.checked }))}
               style={{ accentColor: 'var(--ember)', cursor: 'pointer' }} />
        Visible par tous les membres
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn-ember" disabled={!f.name.trim() || envoi}>
          Enregistrer {count !== null && `(${count.toLocaleString('fr-FR')})`}
        </button>
      </div>
    </form>
  )
}

export default function SegmentsPage() {
  const [criteria, setCriteria] = useState(CRITERES_VIDES)
  const [nommer, setNommer] = useState(false)
  const [actif, setActif] = useState(null)

  const facets = useFacets()
  const { count, rows, page, setPage, loading } = useSegmentPreview(criteria)
  const { segments, save, remove, verser } = useSegments()
  const { lists } = useProspectingLists()
  const { members } = useMembers()
  const run = useAction()

  const set = (k, v) => setCriteria(c => ({ ...c, [k]: v }))
  const toggle = (k, v) => setCriteria(c => ({
    ...c, [k]: c[k].includes(v) ? c[k].filter(x => x !== v) : [...c[k], v],
  }))

  async function enregistrer(champs) {
    const s = await run(() => save(champs), { succes: `Segment « ${champs.name.trim()} » enregistré` })
    if (s) { setNommer(false); setActif(s.id) }
  }

  async function charger(s) {
    setCriteria({ ...CRITERES_VIDES, ...s.criteria })
    setActif(s.id)
    setPage(1)
  }

  async function versement(segmentId, listId) {
    const nom = lists.find(l => l.id === listId)?.name ?? ''
    await run(async () => {
      const n = await verser(segmentId, listId)
      // Zéro ajouté n'est pas une erreur : c'est que la campagne les a déjà.
      // On le dit, plutôt que d'afficher un succès qui ne s'est rien passé.
      if (n === 0) throw new Error(`Ces contacts sont déjà tous dans « ${nom} »`)
      return n
    }, { succes: `Versé dans « ${nom} »` })
  }

  const totalPages = count ? Math.ceil(count / 50) : 1

  return (
    <div className="px-8 py-6 fade-up">
      <h1 className="page-title" style={{ marginBottom: 4 }}>Segments</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20, maxWidth: '74ch' }}>
        Découper l'annuaire en listes de travail. Un segment garde ses critères, pas ses
        fiches&nbsp;: il se recalcule à chaque ouverture, donc un contact enrichi demain y entre
        tout seul. Pour le travailler, versez-le dans une campagne.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>

        {/* Constructeur */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              className="field" style={{ fontSize: 13 }}
              placeholder="Nom, entreprise, poste, ville…"
              value={criteria.q} onChange={e => set('q', e.target.value)}
            />

            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-4)', marginBottom: 6 }}>
                Promotion
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input className="field" type="number" style={{ fontSize: 13, width: 88 }}
                       placeholder={facets?.promo?.min ?? 'de'} value={criteria.promo_min ?? ''}
                       onChange={e => set('promo_min', e.target.value ? Number(e.target.value) : null)} />
                <span style={{ color: 'var(--ink-4)' }}>→</span>
                <input className="field" type="number" style={{ fontSize: 13, width: 88 }}
                       placeholder={facets?.promo?.max ?? 'à'} value={criteria.promo_max ?? ''}
                       onChange={e => set('promo_max', e.target.value ? Number(e.target.value) : null)} />
              </div>
            </div>

            <Groupe titre="Entreprise" valeurs={facets?.entreprises} choisis={criteria.entreprises}
                    onToggle={v => toggle('entreprises', v)} libre onLibre={v => toggle('entreprises', v)} />
            <Groupe titre="Diplôme" valeurs={facets?.diplomes} choisis={criteria.diplomes}
                    onToggle={v => toggle('diplomes', v)} />
            <Groupe titre="Ville" valeurs={facets?.villes} choisis={criteria.villes}
                    onToggle={v => toggle('villes', v)} libre onLibre={v => toggle('villes', v)} />

            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-4)', marginBottom: 6 }}>
                Statut
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {STATUSES.map(s => {
                  const on = criteria.statuts.includes(s.code)
                  return (
                    <button key={s.code} onClick={() => toggle('statuts', s.code)}
                            style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
                                     background: on ? s.bg : 'transparent', color: on ? s.fg : 'var(--ink-3)',
                                     border: `1px solid ${on ? s.fg + '55' : 'var(--line)'}` }}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['jamais_demarche', 'Jamais démarchés'],
                ['avec_linkedin', 'Avec un profil LinkedIn'],
                ['avec_email', 'Avec un e-mail'],
                ['sans_statut', 'Sans statut'],
              ].map(([cle, label]) => (
                <label key={cle} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={criteria[cle]} onChange={e => set(cle, e.target.checked)}
                         style={{ accentColor: 'var(--ember)', cursor: 'pointer' }} />
                  {label}
                </label>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-4)', marginBottom: 6 }}>
                Démarché par
              </div>
              <select className="field" style={{ fontSize: 12.5, width: '100%' }}
                      value={criteria.demarche_par ?? ''} onChange={e => set('demarche_par', e.target.value || null)}>
                <option value="">n'importe qui</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <button className="btn-ghost" style={{ fontSize: 12.5 }}
                      onClick={() => { setCriteria(CRITERES_VIDES); setActif(null); setPage(1) }}>
                Réinitialiser
              </button>
              <button className="btn-ember" style={{ fontSize: 12.5, marginLeft: 'auto' }}
                      disabled={estVide(criteria)} onClick={() => setNommer(true)}>
                Enregistrer
              </button>
            </div>
          </div>

          {nommer && <Enregistrer criteria={criteria} count={count} onSave={enregistrer} onClose={() => setNommer(false)} />}

          {/* Segments enregistrés */}
          {segments.length > 0 && (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-4)', marginBottom: 8 }}>
                Segments enregistrés
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {segments.map(s => (
                  <div key={s.id} style={{ padding: '8px 10px', borderRadius: 8,
                                           background: actif === s.id ? 'var(--ember-soft)' : 'var(--paper-2)',
                                           border: `1px solid ${actif === s.id ? '#c2d9ef' : 'var(--line)'}` }}>
                    <button onClick={() => charger(s)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.35 }}>{resumer(s.criteria)}</div>
                    </button>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                      <select
                        className="field" style={{ fontSize: 11.5, padding: '2px 5px', flex: 1 }}
                        value="" onChange={e => e.target.value && versement(s.id, e.target.value)}
                      >
                        <option value="">Verser dans…</option>
                        {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                      <button onClick={() => run(() => remove(s.id), { succes: 'Segment supprimé' })}
                              title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 3 }}>
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Aperçu */}
        <div>
          <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {loading && count === null ? '…' : (count ?? 0).toLocaleString('fr-FR')}
            </span>
            <span style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>
              fiche{(count ?? 0) !== 1 ? 's' : ''} · {resumer(criteria)}
            </span>
            {loading && <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 'auto' }}>calcul…</span>}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tbl">
              <thead>
                <tr><th>Contact</th><th>Entreprise / Poste</th><th>Promo</th><th>Ville</th><th>Démarché</th></tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontSize: 13.5, fontWeight: 500 }}>
                      {c.prenom} {c.nom?.toUpperCase()}
                      {c.linkedin && (
                        <a href={c.linkedin} target="_blank" rel="noopener noreferrer"
                           style={{ color: 'var(--ember)', marginLeft: 6 }}><Icon name="link" size={10} /></a>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      <div>{c.entreprise_actuelle || '—'}</div>
                      {c.titre_poste && <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{c.titre_poste}</div>}
                    </td>
                    <td className="font-mono" style={{ fontSize: 12 }}>{c.annee_obtention_diplome ?? '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{c.ville || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {c.last_contact_nom
                        ? <span style={{ color: 'var(--ink-2)' }}>{c.last_contact_nom}</span>
                        : <span style={{ color: 'var(--ink-4)' }}>jamais</span>}
                      {c.status && (
                        <span style={{ marginLeft: 6, background: statusMeta(c.status).bg, color: statusMeta(c.status).fg,
                                       borderRadius: 99, padding: '1px 6px', fontSize: 10 }}>
                          {statusMeta(c.status).label}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 13.5 }}>
                    Aucune fiche ne correspond. Relâchez un critère.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '14px 0' }}>
              <button className="btn-ghost" style={{ fontSize: 13 }} disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
              <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>page {page} / {totalPages}</span>
              <button className="btn-ghost" style={{ fontSize: 13 }} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
