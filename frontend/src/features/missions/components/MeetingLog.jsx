import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'

export default function MeetingLog({ meetings, onDelete, onCreate, canManage = true }) {
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState({ title: '', date: '', notes: '', attendees: '' })
  const [saving, setSaving] = useState(false)

  function set(key, val) { setFields(prev => ({ ...prev, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fields.title.trim() || !fields.date) return
    setSaving(true)
    try {
      await onCreate({
        title: fields.title.trim(),
        date: fields.date,
        notes: fields.notes.trim(),
        attendees: fields.attendees ? fields.attendees.split(',').map(s => s.trim()).filter(Boolean) : [],
      })
      setFields({ title: '', date: '', notes: '', attendees: '' })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {meetings.length === 0 && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucune réunion enregistrée.</div>
      )}
      {meetings.map(mt => (
        <div key={mt.id} className="card" style={{ padding: 16, position: 'relative' }}>
          {canManage && (
          <button
            onClick={() => onDelete(mt.id)}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)' }}
          >
            <Icon name="trash" size={13} />
          </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Icon name="calendar" size={14} />
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {new Date(mt.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: mt.notes ? 8 : 0 }}>{mt.title}</div>
          {mt.notes && <div style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{mt.notes}</div>}
          {mt.attendees?.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
              Participants : {mt.attendees.join(', ')}
            </div>
          )}
        </div>
      ))}

      {!canManage ? null : !open ? (
        <button className="btn-ghost flex items-center gap-1.5" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
          <Icon name="plus" size={13} /> Ajouter une réunion
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Titre *</label>
              <input className="field" style={{ marginTop: 4, fontSize: 13 }} value={fields.title} onChange={e => set('title', e.target.value)} placeholder="Réunion de suivi" required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Date *</label>
              <input className="field" type="date" style={{ marginTop: 4, fontSize: 13 }} value={fields.date} onChange={e => set('date', e.target.value)} required />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Notes</label>
            <textarea className="field" style={{ marginTop: 4, fontSize: 13, resize: 'vertical', minHeight: 64 }} value={fields.notes} onChange={e => set('notes', e.target.value)} placeholder="Points abordés…" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Participants (séparés par virgule)</label>
            <input className="field" style={{ marginTop: 4, fontSize: 13 }} value={fields.attendees} onChange={e => set('attendees', e.target.value)} placeholder="Jean Dupont, Marie Martin" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
            <button type="submit" className="btn-ember" disabled={saving || !fields.title.trim() || !fields.date} style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? '…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
