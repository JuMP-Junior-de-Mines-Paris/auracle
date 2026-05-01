import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { faLinkedinIn } from '@fortawesome/free-brands-svg-icons'

const FIELD_LABELS = [
  { key: 'email',                    label: 'Email' },
  { key: 'telephone',                label: 'Téléphone' },
  { key: 'entreprise_actuelle',      label: 'Entreprise' },
  { key: 'titre_poste',              label: 'Poste' },
  { key: 'ville',                    label: 'Ville' },
  { key: 'pays',                     label: 'Pays' },
  { key: 'diplomes',                 label: 'Diplômes' },
  { key: 'annee_obtention_diplome',  label: 'Année diplôme' },
  { key: 'id_profil',                label: 'ID Profil' },
]

export default function ContactModal({ contact, onClose }) {
  const initials =
    `${contact.prenom?.[0] ?? ''}${contact.nom?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:rounded-xl sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#005a9f] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              {initials}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {contact.prenom} {contact.nom}
              </h2>
              {contact.titre_poste && (
                <p className="text-slate-500 text-sm">{contact.titre_poste}</p>
              )}
              {contact.entreprise_actuelle && (
                <p className="text-slate-500 text-sm">{contact.entreprise_actuelle}</p>
              )}
            </div>
          </div>
          <button
            className="text-slate-400 hover:text-slate-600 p-1 flex-shrink-0"
            onClick={onClose}
            aria-label="Fermer"
          >
            <FontAwesomeIcon icon={faXmark} size="lg" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {FIELD_LABELS.filter(f => contact[f.key] != null && contact[f.key] !== '').map(f => (
            <div key={f.key}>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">{f.label}</p>
              <p className="text-slate-700">{contact[f.key]}</p>
            </div>
          ))}

          {contact.linkedin && (
            <a
              href={contact.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#005a9f] text-white px-4 py-2 rounded-lg hover:bg-[#004a8f] transition-colors text-sm mt-2"
            >
              <FontAwesomeIcon icon={faLinkedinIn} />
              Voir sur LinkedIn
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
