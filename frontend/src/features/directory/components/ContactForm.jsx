import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'

const FIELDS = [
  { name: 'prenom',                  label: 'Prénom',         type: 'text',   required: true },
  { name: 'nom',                     label: 'Nom',            type: 'text',   required: true },
  { name: 'entreprise_actuelle',     label: 'Entreprise',     type: 'text' },
  { name: 'titre_poste',             label: 'Poste',          type: 'text' },
  { name: 'email',                   label: 'Email',          type: 'email' },
  { name: 'telephone',               label: 'Téléphone',      type: 'tel' },
  { name: 'linkedin',                label: 'LinkedIn (URL)', type: 'url' },
  { name: 'ville',                   label: 'Ville',          type: 'text' },
  { name: 'pays',                    label: 'Pays',           type: 'text' },
  { name: 'diplomes',                label: 'Diplômes',       type: 'text' },
  { name: 'annee_obtention_diplome', label: 'Année diplôme',  type: 'number' },
  { name: 'id_profil',               label: 'ID Profil',      type: 'text' },
]

export default function ContactForm({ onClose, onSubmit }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function handleChange(e, field) {
    const value = field.type === 'number'
      ? (e.target.value === '' ? null : parseInt(e.target.value, 10))
      : e.target.value
    setForm(prev => ({ ...prev, [field.name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await onSubmit(form)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,20,.35)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: 0 }}
      className="sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        style={{ background: '#fffdf8', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column' }}
        className="sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fffdf8', zIndex: 1 }}>
          <h2 className="font-serif" style={{ fontSize: 26 }}>Nouveau contact</h2>
          <button onClick={onClose} style={{ color: 'var(--ink-3)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {FIELDS.map(field => (
              <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: ['linkedin', 'diplomes'].includes(field.name) ? 'span 2' : undefined }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>
                  {field.label}
                  {field.required && <span style={{ color: 'var(--bad)', marginLeft: 4 }}>*</span>}
                </label>
                <input
                  type={field.type}
                  required={field.required}
                  className="field ring-ember"
                  style={{ fontSize: 13 }}
                  onChange={e => handleChange(e, field)}
                />
              </div>
            ))}
          </div>

          {error && <p style={{ fontSize: 13, color: 'var(--bad)' }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-ember" disabled={loading}>
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
