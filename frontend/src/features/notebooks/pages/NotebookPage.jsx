import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import NotesPanel from '../../../shared/components/NotesPanel'
import { useAction } from '../../../shared/components/ToastProvider'
import { useAuth } from '../../auth/hooks/useAuth'
import { useMembers } from '../../members/hooks/useMembers'
import { useTasks, taskPriority } from '../../tasks/hooks/useTasks'
import { useNotebook, PORTEES, porteeMeta } from '../hooks/useNotebooks'

/** Les todos du carnet — ce sont des tâches, donc elles remontent ailleurs. */
function Todos({ notebookId }) {
  const { tasks, loading, create, update, remove } = useTasks({ notebookId })
  const { members } = useMembers()
  const run = useAction()
  const [titre, setTitre] = useState('')
  const [qui, setQui] = useState('')
  const [quand, setQuand] = useState('')
  const [voirFaits, setVoirFaits] = useState(false)

  const ouverts = tasks.filter(t => t.status !== 'termine' && t.status !== 'annule')
  const faits = tasks.filter(t => t.status === 'termine' || t.status === 'annule')

  async function ajouter(e) {
    e.preventDefault()
    if (!titre.trim()) return
    const ok = await run(() => create({ title: titre, assignedTo: qui, dueDate: quand, notebookId }),
                         { succes: 'Point ajouté' })
    if (ok) { setTitre(''); setQui(''); setQuand('') }
  }

  function Ligne({ t }) {
    const fait = t.status === 'termine'
    const enRetard = !fait && t.due_date && t.due_date < new Date().toISOString().split('T')[0]
    const pr = taskPriority(t.priority)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
        <input
          type="checkbox"
          checked={fait}
          onChange={e => run(() => update(t.id, { status: e.target.checked ? 'termine' : 'a_faire' }))}
          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--ember)', flexShrink: 0 }}
        />
        <span style={{ flex: 1, fontSize: 13.5, color: fait ? 'var(--ink-4)' : 'var(--ink)', textDecoration: fait ? 'line-through' : 'none' }}>
          {t.title}
        </span>
        {t.priority !== 'normale' && (
          <span style={{ fontSize: 10.5, color: pr.fg, fontWeight: 500 }}>{pr.label}</span>
        )}
        <select
          className="field"
          style={{ fontSize: 11.5, padding: '2px 5px', width: 112 }}
          value={t.assigned_to ?? ''}
          onChange={e => run(() => update(t.id, { assigned_to: e.target.value || null }))}
        >
          <option value="">personne</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
        </select>
        {t.due_date && (
          <span style={{ fontSize: 11.5, color: enRetard ? 'var(--bad)' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>
            {new Date(t.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        )}
        <button onClick={() => run(() => remove(t.id))} title="Supprimer"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 3, flexShrink: 0 }}>
          <Icon name="x" size={12} />
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
        À faire {ouverts.length > 0 && `· ${ouverts.length}`}
      </div>

      <form onSubmit={ajouter} style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input className="field" style={{ flex: 1, minWidth: 170, fontSize: 13 }}
               placeholder="Un point à traiter…" value={titre} onChange={e => setTitre(e.target.value)} />
        <select className="field" style={{ fontSize: 12.5, width: 128 }} value={qui} onChange={e => setQui(e.target.value)}>
          <option value="">personne</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
        </select>
        <input className="field" type="date" style={{ fontSize: 12.5, width: 138 }} value={quand} onChange={e => setQuand(e.target.value)} />
        <button type="submit" className="btn-ember" disabled={!titre.trim()} style={{ fontSize: 13 }}>
          <Icon name="plus" size={12} />
        </button>
      </form>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--ink-4)' }}>Chargement…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {ouverts.map(t => <Ligne key={t.id} t={t} />)}
          {ouverts.length === 0 && faits.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink-4)', textAlign: 'center', padding: '8px 0' }}>
              Rien à faire pour l'instant.
            </div>
          )}
          {faits.length > 0 && (
            <>
              <button className="btn-ghost flex items-center gap-1.5" style={{ fontSize: 12.5, alignSelf: 'flex-start', marginTop: 4 }}
                      onClick={() => setVoirFaits(v => !v)}>
                <Icon name={voirFaits ? 'chevronD' : 'chevronR'} size={12} />
                {faits.length} fait{faits.length > 1 ? 's' : ''}
              </button>
              {voirFaits && faits.map(t => <Ligne key={t.id} t={t} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Partage({ notebook, shares, membres, onUpdate, onInvite, onRevoke, estAuteur }) {
  const [ouvert, setOuvert] = useState(false)
  const run = useAction()
  const p = porteeMeta(notebook.visibility)
  const invites = new Set(shares.map(s => s.profile_id))

  return (
    <div className="card" style={{ padding: 14 }}>
      <button
        onClick={() => setOuvert(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
      >
        <span style={{ background: p.bg, color: p.fg, borderRadius: 99, padding: '2px 9px', fontSize: 11.5, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name={p.icon} size={11} /> {p.label}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)', flex: 1 }}>
          {p.aide}{shares.length > 0 && ` + ${shares.length} invité${shares.length > 1 ? 's' : ''}`}
        </span>
        {estAuteur && <Icon name={ouvert ? 'chevronD' : 'chevronR'} size={13} />}
      </button>

      {ouvert && estAuteur && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>Portée</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PORTEES.map(x => (
                <button key={x.code} type="button" title={x.aide}
                        onClick={() => run(() => onUpdate({ visibility: x.code }), { succes: `Carnet ${x.label.toLowerCase()}` })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '4px 10px',
                          borderRadius: 99, cursor: 'pointer',
                          background: notebook.visibility === x.code ? x.bg : 'transparent',
                          color: notebook.visibility === x.code ? x.fg : 'var(--ink-3)',
                          border: `1px solid ${notebook.visibility === x.code ? x.fg + '55' : 'var(--line)'}`,
                        }}>
                  <Icon name={x.icon} size={11} /> {x.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>
              Inviter quelqu'un en plus de la portée
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {membres.filter(m => m.id !== notebook.created_by).map(m => {
                const dedans = invites.has(m.id)
                return (
                  <button key={m.id} type="button"
                          onClick={() => run(() => dedans ? onRevoke(m.id) : onInvite(m.id),
                                             { succes: dedans ? 'Invitation retirée' : `${m.prenom} invité·e` })}
                          style={{
                            fontSize: 12, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
                            background: dedans ? 'var(--ember-soft)' : 'transparent',
                            color: dedans ? 'var(--ember-2)' : 'var(--ink-3)',
                            border: `1px solid ${dedans ? '#c2d9ef' : 'var(--line)'}`,
                          }}>
                    {dedans && <Icon name="check" size={10} />} {m.prenom} {m.nom}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NotebookPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { members } = useMembers()
  const { notebook, shares, loading, error, update, invite, revoke } = useNotebook(id)
  const run = useAction()

  if (loading) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>

  if (error || !notebook) {
    return (
      <div className="px-8 py-6 fade-up">
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center', maxWidth: 460, margin: '40px auto' }}>
          <div style={{ color: 'var(--ink-3)', marginBottom: 12 }}><Icon name="lock" size={24} /></div>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Carnet introuvable</div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>
            Il n'existe pas, ou sa portée ne vous inclut pas. Demandez à son auteur de vous inviter.
          </div>
          <Link to="/carnets" className="btn-ghost" style={{ display: 'inline-block', marginTop: 18, textDecoration: 'none' }}>
            Retour aux carnets
          </Link>
        </div>
      </div>
    )
  }

  const estAuteur = user?.id === notebook.created_by

  return (
    <div className="px-8 py-6 fade-up">
      <div className="flex items-center gap-3" style={{ marginBottom: 4 }}>
        <Link to="/carnets" style={{ color: 'var(--ink-3)', display: 'flex' }} title="Tous les carnets">
          <Icon name="arrowL" size={16} />
        </Link>
        <span style={{ fontSize: 24, lineHeight: 1 }}>{notebook.icon || '📓'}</span>
        <h1 className="page-title">{notebook.title}</h1>
        {estAuteur && (
          <button
            className="btn-ghost flex items-center gap-1.5"
            style={{ marginLeft: 'auto', fontSize: 12.5 }}
            onClick={() => run(async () => {
              await update({ archived: !notebook.archived })
              navigate('/carnets')
            }, { succes: notebook.archived ? 'Carnet réactivé' : 'Carnet archivé' })}
          >
            <Icon name="inbox" size={12} /> {notebook.archived ? 'Réactiver' : 'Archiver'}
          </button>
        )}
      </div>
      {notebook.description && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>{notebook.description}</p>
      )}

      <div style={{ marginBottom: 20 }}>
        <Partage
          notebook={notebook} shares={shares} membres={members} estAuteur={estAuteur}
          onUpdate={update} onInvite={invite} onRevoke={revoke}
        />
      </div>

      {/* Deux colonnes : ce qu'on écrit, ce qu'on doit faire. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <NotesPanel
          entityType="notebook"
          entityId={id}
          title="Notes"
          placeholder="Compte rendu, décision, idée à garder…"
        />
        <Todos notebookId={id} />
      </div>
    </div>
  )
}
