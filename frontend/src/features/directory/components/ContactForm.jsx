import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../shared/lib/icons'
import { useDuplicateCheck } from '../hooks/useDuplicates'

const FIELDS = [
  { name: 'prenom',                  label: 'Prénom',         type: 'text',   required: true },
  { name: 'nom',                     label: 'Nom',            type: 'text',   required: true },
  { name: 'entreprise_actuelle',     label: 'Entreprise',     type: 'text' },
  { name: 'titre_poste',             label: 'Poste',          type: 'text' },
  { name: 'email',                   label: 'Email',          type: 'email' },
  { name: 'telephone',               label: 'Téléphone',      type: 'tel' },
  { name: 'linkedin',                label: 'LinkedIn (URL)',      type: 'url' },
  { name: 'mpa_profile',            label: 'Profil MPA (URL)',    type: 'url' },
  { name: 'ville',                   label: 'Ville',          type: 'text' },
  { name: 'pays',                    label: 'Pays',           type: 'text' },
  { name: 'diplomes',                label: 'Diplômes',       type: 'text' },
  { name: 'annee_obtention_diplome', label: 'Année diplôme',  type: 'number' },
  { name: 'id_profil',               label: 'ID Profil',      type: 'text' },
]

function initForm(contact) {
  return FIELDS.reduce((acc, f) => {
    const val = contact?.[f.name]
    acc[f.name] = val == null ? '' : String(val)
    return acc
  }, {})
}

export default function ContactForm({ contact, onClose, onSubmit }) {
  const editing = Boolean(contact)
  const [form, setForm] = useState(() => initForm(contact))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Prévenir AVANT l'enregistrement : un doublon évité coûte moins cher
  // qu'un doublon fusionné. Les contraintes d'unicité de la migration 012
  // attrapent l'égalité exacte ; ceci attrape les variantes d'orthographe.
  const { candidates, checking } = useDuplicateCheck({ ...form, id: contact?.id })

  function handleChange(e, field) {
    const value = field.type === 'number'
      ? (e.target.value === '' ? '' : e.target.value)
      : e.target.value
    setForm(prev => ({ ...prev, [field.name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const payload = FIELDS.reduce((acc, f) => {
        let val = form[f.name]
        if (f.type === 'number') val = val === '' ? null : parseInt(val, 10)
        else val = val.trim() === '' ? null : val.trim()
        acc[f.name] = val
        return acc
      }, {})
      await onSubmit(payload)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,20,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
      onClick={onClose}
    >
      <div
        className="card fade-up"
        style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 1 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{editing ? 'Modifier le contact' : 'Nouveau contact'}</h2>
          <button onClick={onClose} style={{ color: 'var(--ink-3)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {FIELDS.map(field => (
              <div
                key={field.name}
                style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: ['linkedin', 'mpa_profile', 'diplomes'].includes(field.name) ? 'span 2' : undefined }}
              >
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {field.label}
                  {field.required && <span style={{ color: '#dc2626', marginLeft: 3 }}>*</span>}
                </label>
                <input
                  type={field.type}
                  required={field.required}
                  className="field"
                  style={{ fontSize: 13 }}
                  value={form[field.name]}
                  onChange={e => handleChange(e, field)}
                />
              </div>
            ))}
          </div>

          {candidates.length > 0 && (
            <div style={{ background: 'var(--maj-bg, #f7efdc)', border: '1px solid #e2ce9e', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#8a5d13', marginBottom: 6 }}>
                {candidates.length} contact{candidates.length > 1 ? 's ressemblent' : ' ressemble'} à celui-ci
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {candidates.slice(0, 4).map(c => (
                  <div key={c.id} style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <b>{c.prenom} {c.nom?.toUpperCase()}</b>
                    <span style={{ color: 'var(--ink-3)' }}>{c.entreprise_actuelle || '—'}</span>
                    <span style={{ color: '#8a5d13' }}>· {c.motif}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>
                Vous pouvez enregistrer quand même si c’est bien quelqu’un d’autre.
              </div>
            </div>
          )}
          {checking && candidates.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Recherche de doublons…</div>
          )}

          {error && <p style={{ fontSize: 13, color: '#dc2626' }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-ember" disabled={loading} style={{ opacity: loading ? 0.6 : 1 }}>
              {loading ? '…' : editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
