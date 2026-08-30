import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { STATUSES, CHANNELS, channelMeta, statusMeta } from '../../../shared/lib/prospect'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { useInteractions, useAssignment } from '../hooks/useInteractions'

function Assignment({ contactId }) {
  const { assignment, loading, claim, release } = useAssignment(contactId)
  const { can } = usePermissions()
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run(fn) {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (loading) return null

  const who = assignment?.assignee
    ? `${assignment.assignee.prenom ?? ''} ${assignment.assignee.nom ?? ''}`.trim() || assignment.assignee.email
    : null

  return (
    <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13 }}>
          {who ? (
            <>Pris en charge par <b>{who}</b>
              <span style={{ color: 'var(--ink-3)' }}>
                {' '}depuis le {new Date(assignment.assigned_at).toLocaleDateString('fr-FR')}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--ink-3)' }}>Personne ne suit ce contact.</span>
          )}
        </div>

        {!assignment ? (
          <button className="btn-ghost" style={{ fontSize: 12.5 }} disabled={busy} onClick={() => run(claim)}>
            Me l'attribuer
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" style={{ fontSize: 12.5 }} disabled={busy} onClick={() => run(release)}>
              Libérer
            </button>
            {can('contacts.assign_others') && (
              <button className="btn-ghost" style={{ fontSize: 12.5 }} disabled={busy} onClick={() => run(() => claim({ force: true }))}>
                Reprendre
              </button>
            )}
          </div>
        )}
      </div>
      {err && <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

function LogForm({ onLog, lists }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    channel: 'email', direction: 'sortant', outcome: 'contacte',
    summary: '', nextActionAt: '', nextAction: '', listId: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setSaving(true); setErr(null)
    try {
      await onLog({ ...f, listId: f.listId || null })
      setF({ channel: 'email', direction: 'sortant', outcome: 'contacte', summary: '', nextActionAt: '', nextAction: '', listId: '' })
      setOpen(false)
    } catch (e2) { setErr(e2.message) } finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button className="btn-ember flex items-center gap-1.5" style={{ justifyContent: 'center' }} onClick={() => setOpen(true)}>
        <Icon name="plus" size={13} /> Enregistrer une démarche
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="card p-3" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          Canal
          <select className="field" style={{ fontSize: 13, marginTop: 3 }} value={f.channel} onChange={e => set('channel', e.target.value)}>
            {CHANNELS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          Sens
          <select className="field" style={{ fontSize: 13, marginTop: 3 }} value={f.direction} onChange={e => set('direction', e.target.value)}>
            <option value="sortant">Nous → lui</option>
            <option value="entrant">Lui → nous</option>
          </select>
        </label>
      </div>

      <label style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        Nouveau statut
        <select className="field" style={{ fontSize: 13, marginTop: 3 }} value={f.outcome} onChange={e => set('outcome', e.target.value)}>
          {STATUSES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
      </label>

      {lists?.length > 0 && (
        <label style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          Campagne (facultatif)
          <select className="field" style={{ fontSize: 13, marginTop: 3 }} value={f.listId} onChange={e => set('listId', e.target.value)}>
            <option value="">Aucune</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}

      <textarea
        className="field"
        style={{ fontSize: 13, minHeight: 64, resize: 'vertical' }}
        placeholder="Ce qui a été dit…"
        value={f.summary}
        onChange={e => set('summary', e.target.value)}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          Relancer le
          <input className="field" type="date" style={{ fontSize: 13, marginTop: 3 }} value={f.nextActionAt} onChange={e => set('nextActionAt', e.target.value)} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          Quoi faire
          <input className="field" style={{ fontSize: 13, marginTop: 3 }} placeholder="Relancer par téléphone" value={f.nextAction} onChange={e => set('nextAction', e.target.value)} />
        </label>
      </div>

      {err && <div style={{ fontSize: 12.5, color: 'var(--bad)' }}>{err}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
        <button type="submit" className="btn-ember" disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

export default function InteractionPanel({ contactId, lists }) {
  const { interactions, loading, log, remove } = useInteractions(contactId)
  const { can } = usePermissions()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        Démarches
      </div>

      <Assignment contactId={contactId} />

      {can('contacts.write') && <LogForm onLog={log} lists={lists} />}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--ink-4)' }}>Chargement…</div>
      ) : interactions.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink-4)', textAlign: 'center', padding: '10px 0' }}>
          Aucune démarche enregistrée. Le statut affiché ne repose donc sur rien.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {interactions.map((i, idx) => {
            const ch = channelMeta(i.channel)
            const st = i.outcome ? statusMeta(i.outcome) : null
            const author = i.author ? `${i.author.prenom ?? ''} ${i.author.nom ?? ''}`.trim() : null
            return (
              <div key={i.id} style={{ display: 'flex', gap: 10 }}>
                {/* Frise : le trait relie les démarches entre elles. */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--paper-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)' }}>
                    <Icon name={ch.icon} size={12} />
                  </span>
                  {idx < interactions.length - 1 && <span style={{ flex: 1, width: 1, background: 'var(--line)', minHeight: 12 }} />}
                </div>

                <div style={{ flex: 1, paddingBottom: 14, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>
                      {ch.label} {i.direction === 'entrant' ? '· reçu' : '· envoyé'}
                    </span>
                    {st && (
                      <span style={{ background: st.bg, color: st.fg, borderRadius: 99, padding: '1px 7px', fontSize: 10.5, fontWeight: 500 }}>
                        {st.label}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                      {new Date(i.occurred_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <button
                      onClick={() => remove(i.id)}
                      title="Supprimer"
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 2 }}
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </div>

                  {i.summary && (
                    <div style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', marginTop: 3 }}>{i.summary}</div>
                  )}

                  {i.next_action_at && (
                    <div style={{ fontSize: 11.5, color: 'var(--warn)', marginTop: 4 }}>
                      <Icon name="bell" size={10} />{' '}
                      Relance le {new Date(i.next_action_at + 'T00:00:00').toLocaleDateString('fr-FR')}
                      {i.next_action ? ` — ${i.next_action}` : ''}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 3 }}>
                    {author}{author && i.list ? ' · ' : ''}{i.list?.name}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
