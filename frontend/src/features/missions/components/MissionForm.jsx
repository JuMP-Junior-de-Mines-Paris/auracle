import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../shared/lib/icons'

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'active', label: 'En cours' },
  { value: 'completed', label: 'Terminée' },
  { value: 'archived', label: 'Archivée' },
]

export default function MissionForm({ mission, members = [], onClose, onSave }) {
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState({
    title: mission?.title ?? '',
    description: mission?.description ?? '',
    client_name: mission?.client_name ?? '',
    client_contact_name: mission?.client_contact_name ?? '',
    client_contact_email: mission?.client_contact_email ?? '',
    chef_de_projet: mission?.chef_de_projet ?? '',
    status: mission?.status ?? 'draft',
    start_date: mission?.start_date ?? '',
    end_date: mission?.end_date ?? '',
    budget: mission?.budget ?? '',
  })

  function set(key, val) { setFields(prev => ({ ...prev, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fields.title.trim()) return
    setSaving(true)
    try {
      const payload = {
        ...fields,
        chef_de_projet: fields.chef_de_projet || null,
        budget: fields.budget ? Number(fields.budget) : null,
        start_date: fields.start_date || null,
        end_date: fields.end_date || null,
      }
      await onSave(payload)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(26,22,20,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        className="card fade-up"
        style={{ width: 520, maxHeight: '90vh', overflow: 'auto', padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{mission ? 'Modifier la mission' : 'Nouvelle mission'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Titre *</label>
            <input className="field" style={{ marginTop: 4 }} value={fields.title} onChange={e => set('title', e.target.value)} required placeholder="Nom de la mission" />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Description</label>
            <textarea className="field" style={{ marginTop: 4, resize: 'vertical', minHeight: 72 }} value={fields.description} onChange={e => set('description', e.target.value)} placeholder="Objectifs et périmètre…" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Client</label>
              <input className="field" style={{ marginTop: 4 }} value={fields.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Nom de l'entreprise" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Statut</label>
              <select className="field" style={{ marginTop: 4 }} value={fields.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Contact client</label>
              <input className="field" style={{ marginTop: 4 }} value={fields.client_contact_name} onChange={e => set('client_contact_name', e.target.value)} placeholder="Prénom Nom" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Email client</label>
              <input className="field" type="email" style={{ marginTop: 4 }} value={fields.client_contact_email} onChange={e => set('client_contact_email', e.target.value)} placeholder="contact@client.fr" />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Chef de Projet</label>
            <select className="field" style={{ marginTop: 4 }} value={fields.chef_de_projet} onChange={e => set('chef_de_projet', e.target.value)}>
              <option value="">— Non assigné —</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Début</label>
              <input className="field" type="date" style={{ marginTop: 4 }} value={fields.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Fin</label>
              <input className="field" type="date" style={{ marginTop: 4 }} value={fields.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Budget (€)</label>
              <input className="field" type="number" style={{ marginTop: 4 }} value={fields.budget} onChange={e => set('budget', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-ember" disabled={saving || !fields.title.trim()} style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? '…' : mission ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
