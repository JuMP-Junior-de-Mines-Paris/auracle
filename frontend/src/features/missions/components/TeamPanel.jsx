import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'

const EMPTY = { prenom: '', nom: '', email: '', telephone: '', annee_promotion: '' }

export default function TeamPanel({ team, onAdd, onRemove, canManage }) {
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  function set(key, val) { setFields(prev => ({ ...prev, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fields.prenom.trim() || !fields.nom.trim()) return
    setSaving(true)
    try {
      await onAdd({
        prenom: fields.prenom.trim(),
        nom: fields.nom.trim(),
        email: fields.email.trim() || null,
        telephone: fields.telephone.trim() || null,
        annee_promotion: fields.annee_promotion ? Number(fields.annee_promotion) : null,
      })
      setFields(EMPTY)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {team.length === 0 && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucun membre dans l'équipe.</div>
      )}

      {team.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{m.prenom} {m.nom}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 2 }}>
              {m.email && <span>{m.email}</span>}
              {m.telephone && <span>{m.telephone}</span>}
              {m.annee_promotion && <span>Promo {m.annee_promotion}</span>}
            </div>
          </div>
          {canManage && (
            <button
              onClick={() => onRemove(m.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 4, flexShrink: 0 }}
            >
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      ))}

      {canManage && (
        !open ? (
          <button className="btn-ghost flex items-center gap-1.5" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => setOpen(true)}>
            <Icon name="plus" size={13} /> Ajouter un membre
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Prénom *</label>
                <input className="field" style={{ marginTop: 4, fontSize: 13 }} value={fields.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Prénom" required />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Nom *</label>
                <input className="field" style={{ marginTop: 4, fontSize: 13 }} value={fields.nom} onChange={e => set('nom', e.target.value)} placeholder="Nom" required />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Email</label>
                <input className="field" type="email" style={{ marginTop: 4, fontSize: 13 }} value={fields.email} onChange={e => set('email', e.target.value)} placeholder="email@exemple.fr" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Téléphone</label>
                <input className="field" style={{ marginTop: 4, fontSize: 13 }} value={fields.telephone} onChange={e => set('telephone', e.target.value)} placeholder="06 12 34 56 78" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Année de promo</label>
                <input className="field" type="number" style={{ marginTop: 4, fontSize: 13 }} value={fields.annee_promotion} onChange={e => set('annee_promotion', e.target.value)} placeholder="2025" min="1900" max="2100" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setFields(EMPTY) }}>Annuler</button>
              <button type="submit" className="btn-ember" disabled={saving || !fields.prenom.trim() || !fields.nom.trim()} style={{ opacity: saving ? 0.6 : 1 }}>
                {saving ? '…' : 'Ajouter'}
              </button>
            </div>
          </form>
        )
      )}
    </div>
  )
}
