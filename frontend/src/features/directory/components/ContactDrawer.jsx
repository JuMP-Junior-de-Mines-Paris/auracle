import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../shared/lib/icons'
import ContactStatusBadge from './ContactStatusBadge'

function Field({ label, value, icon }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-4)' }}>
        <Icon name={icon} size={11} /> {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || '—'}
      </div>
    </div>
  )
}

function ContactAvatar({ contact, size = 48 }) {
  const initials = `${contact.prenom?.[0] ?? ''}${contact.nom?.[0] ?? ''}`.toUpperCase() || '?'
  const hue = (((contact.id_profil ?? '') + contact.nom).split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360
  return (
    <span className="avatar" style={{
      width: size, height: size,
      background: `oklch(0.88 0.06 ${hue})`,
      color: `oklch(0.32 0.10 ${hue})`,
      fontSize: Math.max(10, size * 0.38),
      border: '1px solid var(--line)',
      flexShrink: 0,
    }}>
      {initials}
    </span>
  )
}

export default function ContactDrawer({ contact: c, lists, onClose, onAddToList, onCreateList, onStatusChange }) {
  const [showListPicker, setShowListPicker] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreateAndAdd() {
    if (!newListName.trim() || creating) return
    setCreating(true)
    const list = await onCreateList(newListName.trim())
    await onAddToList(list.id, c.id)
    setCreating(false)
    setNewListName('')
    setShowListPicker(false)
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end', background: 'rgba(26,22,20,.18)' }}
      onClick={onClose}
    >
      <div
        className="fade-up"
        style={{ height: '100%', width: 440, display: 'flex', flexDirection: 'column', background: '#fffdf8', borderLeft: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ContactAvatar contact={c} size={48} />
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <div style={{ fontWeight: 500, fontSize: 15 }}>{c.prenom} {c.nom?.toUpperCase()}</div>
                <ContactStatusBadge status={c.status} onChange={onStatusChange} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.titre_poste}{c.entreprise_actuelle ? ` · ${c.entreprise_actuelle}` : ''}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ padding: 6, borderRadius: 8, color: 'var(--ink-3)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <Field label="Email" value={c.email} icon="mail" />
            <Field label="Téléphone" value={c.telephone} icon="phone" />
            <Field label="LinkedIn" value={c.linkedin} icon="link" />
            <Field label="Localisation" value={[c.ville, c.pays].filter(Boolean).join(', ')} icon="globe" />
            <Field label="Diplôme" value={c.diplomes} icon="award" />
            <Field label="Promotion" value={c.annee_obtention_diplome} icon="calendar" />
          </div>

          <div className="dotted-x" />

          {c.linkedin && (
            <a
              href={c.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost flex items-center gap-2"
              style={{ justifyContent: 'center', textDecoration: 'none' }}
            >
              <Icon name="link" size={14} /> Voir sur LinkedIn
            </a>
          )}

          {/* List picker */}
          {showListPicker && (
            <div className="card p-3" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Ajouter à une liste</div>
              {lists.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {lists.map(list => (
                    <button
                      key={list.id}
                      className="btn-ghost"
                      style={{ justifyContent: 'flex-start', fontSize: 13 }}
                      onClick={async () => { await onAddToList(list.id, c.id); setShowListPicker(false) }}
                    >
                      {list.name}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  className="field"
                  style={{ fontSize: 13, padding: '7px 10px' }}
                  placeholder="Nouvelle liste…"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateAndAdd()}
                />
                <button
                  className="btn-ember"
                  style={{ whiteSpace: 'nowrap', opacity: (!newListName.trim() || creating) ? 0.5 : 1 }}
                  disabled={!newListName.trim() || creating}
                  onClick={handleCreateAndAdd}
                >
                  {creating ? '…' : 'Créer'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: 16, display: 'flex', gap: 8, borderTop: '1px solid var(--line)' }}>
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              className="btn-ember"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
            >
              <Icon name="send" size={14} /> Envoyer un email
            </a>
          )}
          <button
            className="btn-ghost flex items-center gap-1.5"
            onClick={() => setShowListPicker(v => !v)}
          >
            <Icon name="bookmark" size={14} /> Liste
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
