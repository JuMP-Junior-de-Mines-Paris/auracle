import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { roleMeta } from '../../../shared/lib/roles'
import { statusMeta } from '../../../shared/lib/prospect'
import { useProspectionStats, tauxConversion, trier } from '../hooks/useProspectionStats'

// Une seule teinte pour tout le pipeline : la POSITION encode déjà l'ordre
// des étapes, une rampe de couleurs n'y ajouterait rien. Seules les deux
// issues portent une couleur, parce qu'elle dit quelque chose — et elles
// portent aussi une icône et un mot, car vert et rouge se confondent en
// deutéranopie (ΔE 6,7 : mesuré, pas supposé).
const TEINTE = 'var(--ember)'
const ISSUES = {
  converti:     { fg: 'var(--ok)',    icon: 'check',  mot: 'gagné' },
  refuse:       { fg: 'var(--bad)',   icon: 'x',      mot: 'perdu' },
  sans_reponse: { fg: 'var(--ink-3)', icon: 'inbox',  mot: 'sans suite' },
  a_recontacter:{ fg: 'var(--warn)',  icon: 'bell',   mot: 'plus tard' },
}

function Tuile({ valeur, label, detail, accent, alerte }) {
  return (
    <div className="card" style={{ padding: '14px 16px', borderTop: `3px solid ${accent ?? 'var(--line-2)'}` }}>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: alerte ? 'var(--bad)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
        {valeur}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{label}</div>
      {detail && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{detail}</div>}
    </div>
  )
}

/** Entonnoir : barres horizontales, valeur écrite sur chaque barre. */
function Entonnoir({ funnel }) {
  const max = Math.max(1, ...funnel.map(f => Number(f.n)))
  const total = funnel.reduce((s, f) => s + Number(f.n), 0)

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>Entonnoir</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>
        Où en sont les {total.toLocaleString('fr-FR')} fiche{total !== 1 ? 's' : ''} engagée{total !== 1 ? 's' : ''}.
      </div>

      {total === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink-4)', padding: '20px 0', textAlign: 'center' }}>
          Aucune fiche n'a encore de statut. Il se renseigne en enregistrant une démarche.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {funnel.map(f => {
            const n = Number(f.n)
            const issue = ISSUES[f.code]
            const st = statusMeta(f.code)
            return (
              <div key={f.code} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 116, fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  {issue && <span style={{ color: issue.fg, display: 'flex' }}><Icon name={issue.icon} size={11} /></span>}
                  {st.label}
                </div>
                <div style={{ flex: 1, height: 20, position: 'relative', background: 'var(--paper-2)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(n > 0 ? 2 : 0, (n / max) * 100)}%`, height: '100%',
                    background: issue ? issue.fg : TEINTE,
                    borderRadius: 5, opacity: issue ? 0.85 : 1,
                  }} />
                </div>
                {/* Valeur écrite : le contraste des barres claires ne suffit
                    pas seul, l'étiquette est obligatoire, pas décorative. */}
                <div style={{ width: 58, textAlign: 'right', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)', flexShrink: 0 }}>
                  {n.toLocaleString('fr-FR')}
                  {issue && <span style={{ color: 'var(--ink-4)', fontSize: 10.5 }}> {issue.mot}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Rythme hebdomadaire — une seule série, donc pas de légende. */
function Rythme({ activity }) {
  const max = Math.max(1, ...activity.map(a => a.demarches))
  const total = activity.reduce((s, a) => s + a.demarches, 0)
  const [survol, setSurvol] = useState(null)

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>Rythme</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>
        {total} démarche{total !== 1 ? 's' : ''} sur {activity.length} semaines.
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 96 }}>
        {activity.map(a => {
          const h = a.demarches === 0 ? 2 : Math.max(4, (a.demarches / max) * 88)
          const actif = survol === a.semaine
          return (
            <div
              key={a.semaine}
              onMouseEnter={() => setSurvol(a.semaine)}
              onMouseLeave={() => setSurvol(null)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4, cursor: 'default', position: 'relative' }}
            >
              {actif && (
                <div style={{
                  position: 'absolute', bottom: '100%', marginBottom: 6, whiteSpace: 'nowrap', zIndex: 5,
                  background: 'var(--ink)', color: 'var(--paper)', fontSize: 11, padding: '4px 8px', borderRadius: 6,
                }}>
                  {new Date(a.semaine + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ·{' '}
                  {a.demarches} démarche{a.demarches !== 1 ? 's' : ''}
                  {Number(a.membres_actifs) > 0 && ` · ${a.membres_actifs} membre${Number(a.membres_actifs) > 1 ? 's' : ''}`}
                </div>
              )}
              <div style={{
                width: '100%', height: h, borderRadius: '4px 4px 0 0',
                background: a.demarches === 0 ? 'var(--line)' : TEINTE,
                opacity: survol && !actif ? 0.55 : 1, transition: 'opacity .12s',
              }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-4)', marginTop: 6 }}>
        <span>{activity[0] && new Date(activity[0].semaine + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
        <span>cette semaine</span>
      </div>
    </div>
  )
}

const COLONNES = [
  { cle: 'demarches',          label: 'Démarches',  aide: 'Actions enregistrées' },
  { cle: 'contacts_touches',   label: 'Contacts',   aide: 'Fiches dont ce membre porte la dernière démarche' },
  { cle: 'en_cours',           label: 'En cours',   aide: 'Contactés ou relancés' },
  { cle: 'en_discussion',      label: 'Discussion', aide: 'En discussion ou RDV planifié' },
  { cle: 'convertis',          label: 'Convertis',  aide: 'Aboutis' },
  { cle: 'relances_en_retard', label: 'En retard',  aide: 'Relances dépassées', alerte: true },
]

function ParMembre({ members, onVoir }) {
  const [tri, setTri] = useState('demarches')
  const [tous, setTous] = useState(false)

  const actifs = members.filter(m => m.demarches > 0)
  const visibles = trier(tous ? members : actifs, tri)
  const maxDemarches = Math.max(1, ...members.map(m => m.demarches))

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Par membre</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
            Un contact est rattaché à l'auteur de sa dernière démarche.
          </div>
        </div>
        <button className="btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setTous(v => !v)}>
          {tous ? `Masquer les inactifs` : `Voir les ${members.length - actifs.length} inactifs`}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ background: 'var(--paper-2)' }}>
              <th style={{ textAlign: 'left', padding: '8px 18px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', fontWeight: 500 }}>
                <button onClick={() => setTri('nom')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}>
                  Membre
                </button>
              </th>
              {COLONNES.map(c => (
                <th key={c.cle} title={c.aide}
                    style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  <button onClick={() => setTri(c.cle)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit',
                                   color: tri === c.cle ? 'var(--ink)' : 'inherit', fontWeight: tri === c.cle ? 600 : 500 }}>
                    {c.label}
                  </button>
                </th>
              ))}
              <th style={{ textAlign: 'right', padding: '8px 18px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                Dernière
              </th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(m => {
              const taux = tauxConversion(m)
              const meta = roleMeta(m.role_code)
              return (
                <tr key={m.membre_id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '9px 18px' }}>
                    <button
                      onClick={() => onVoir(m.membre_id)}
                      title="Voir ses contacts dans l'annuaire"
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ember)' }}>
                        {m.membre_nom ?? 'Sans nom'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{meta.short}</div>
                    </button>
                    {/* Barre proportionnelle : lit d'un coup qui porte l'effort. */}
                    <div style={{ height: 3, marginTop: 4, background: 'var(--paper-2)', borderRadius: 99, overflow: 'hidden', maxWidth: 150 }}>
                      <div style={{ width: `${(m.demarches / maxDemarches) * 100}%`, height: '100%', background: TEINTE, borderRadius: 99 }} />
                    </div>
                  </td>

                  {COLONNES.map(c => {
                    const v = m[c.cle]
                    return (
                      <td key={c.cle} style={{
                        padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        color: v === 0 ? 'var(--ink-4)' : (c.alerte && v > 0 ? 'var(--bad)' : 'var(--ink)'),
                        fontWeight: c.alerte && v > 0 ? 600 : 400,
                      }}>
                        {c.cle === 'convertis' && v > 0 && (
                          <span style={{ color: 'var(--ok)', marginRight: 3 }}><Icon name="check" size={10} /></span>
                        )}
                        {v}
                        {c.cle === 'convertis' && taux !== null && v > 0 && (
                          <span style={{ fontSize: 10.5, color: 'var(--ink-4)' }}> {Math.round(taux * 100)}%</span>
                        )}
                      </td>
                    )
                  })}

                  <td style={{ padding: '9px 18px', textAlign: 'right', fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                    {m.derniere_activite
                      ? new Date(m.derniere_activite).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                      : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                  </td>
                </tr>
              )
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={COLONNES.length + 2} style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
                  Personne n'a encore enregistré de démarche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ProgressionPage() {
  const { overview, funnel, activity, members, loading, error } = useProspectionStats()
  const navigate = useNavigate()

  if (loading) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
  if (error) return <div className="px-8 py-6" style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</div>

  const o = overview ?? {}
  const total = o.contacts_total ?? 0
  const touches = o.contacts_touches ?? 0
  const couverture = total ? (touches / total) * 100 : 0

  return (
    <div className="px-8 py-6 fade-up">
      <h1 className="page-title" style={{ marginBottom: 4 }}>Progression</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>
        Où en est la prospection, et qui porte l'effort.
      </p>

      {/* Couverture : la seule mesure qui situe tout le reste. */}
      <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {touches.toLocaleString('fr-FR')}
            </span>
            <span style={{ fontSize: 15, color: 'var(--ink-3)' }}> / {total.toLocaleString('fr-FR')} contacts démarchés</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {couverture < 1 && touches > 0 ? '< 1' : Math.round(couverture)} % de l'annuaire ·{' '}
            {(total - touches).toLocaleString('fr-FR')} jamais démarchés
          </div>
        </div>
        <div style={{ height: 8, background: 'var(--paper-2)', borderRadius: 99, overflow: 'hidden', marginTop: 10 }}>
          <div style={{ width: `${Math.max(touches > 0 ? 0.6 : 0, couverture)}%`, height: '100%', background: TEINTE, borderRadius: 99 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Tuile valeur={(o.demarches ?? 0).toLocaleString('fr-FR')} label="Démarches"
               detail={`${o.demarches_30j ?? 0} sur 30 jours`} accent={TEINTE} />
        <Tuile valeur={o.en_discussion ?? 0} label="En discussion" detail="ou RDV planifié" accent="#b45309" />
        <Tuile valeur={o.convertis ?? 0} label="Convertis" accent="var(--ok)" />
        <Tuile valeur={o.relances_en_retard ?? 0} label="Relances en retard"
               accent="var(--bad)" alerte={(o.relances_en_retard ?? 0) > 0} />
        <Tuile valeur={o.membres_actifs_30j ?? 0} label="Membres actifs" detail="sur 30 jours" accent="var(--line-2)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, marginBottom: 18 }}>
        <Entonnoir funnel={funnel} />
        <Rythme activity={activity} />
      </div>

      <ParMembre members={members} onVoir={id => navigate(`/annuaire?demarche_par=${id}`)} />
    </div>
  )
}
