import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'

const FIELDS = [
  { name: 'prenom',                   label: 'Prénom',          type: 'text',   required: true },
  { name: 'nom',                      label: 'Nom',             type: 'text',   required: true },
  { name: 'entreprise_actuelle',      label: 'Entreprise',      type: 'text' },
  { name: 'titre_poste',              label: 'Poste',           type: 'text' },
  { name: 'email',                    label: 'Email',           type: 'email' },
  { name: 'telephone',                label: 'Téléphone',       type: 'tel' },
  { name: 'linkedin',                 label: 'LinkedIn (URL)',  type: 'url' },
  { name: 'ville',                    label: 'Ville',           type: 'text' },
  { name: 'pays',                     label: 'Pays',            type: 'text' },
  { name: 'diplomes',                 label: 'Diplômes',        type: 'text' },
  { name: 'annee_obtention_diplome',  label: 'Année diplôme',  type: 'number' },
  { name: 'id_profil',               label: 'ID Profil',       type: 'text' },
]

export default function ContactForm({ onClose, onSubmit }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function handleChange(e, field) {
    const value =
      field.type === 'number'
        ? e.target.value === '' ? null : parseInt(e.target.value, 10)
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
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:rounded-xl sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-slate-800">Nouveau contact</h2>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="Fermer">
            <FontAwesomeIcon icon={faXmark} size="lg" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {FIELDS.map(field => (
            <div key={field.name}>
              <label className="block text-sm text-slate-600 mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <input
                type={field.type}
                required={field.required}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005a9f] focus:border-transparent"
                onChange={e => handleChange(e, field)}
              />
            </div>
          ))}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[#005a9f] text-white rounded-lg text-sm hover:bg-[#004a8f] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
