import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLinkedinIn } from '@fortawesome/free-brands-svg-icons'

export default function ContactCard({ contact, onClick, onContextMenu }) {
  const initials =
    `${contact.prenom?.[0] ?? ''}${contact.nom?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <div
      className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:shadow-md hover:border-[#005a9f] transition-all select-none"
      onClick={() => onClick(contact)}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, contact) }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-[#005a9f] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 truncate">
            {contact.prenom} {contact.nom}
          </p>
          {contact.titre_poste && (
            <p className="text-xs text-slate-500 truncate">{contact.titre_poste}</p>
          )}
        </div>
      </div>

      {contact.entreprise_actuelle && (
        <p className="text-sm text-slate-600 mb-2 truncate">{contact.entreprise_actuelle}</p>
      )}

      <div className="space-y-0.5 mb-3">
        {contact.email && (
          <p className="text-xs text-[#005a9f] truncate">{contact.email}</p>
        )}
        {contact.telephone && (
          <p className="text-xs text-slate-500">{contact.telephone}</p>
        )}
      </div>

      {contact.linkedin && (
        <a
          href={contact.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs bg-[#005a9f] text-white px-2.5 py-1 rounded hover:bg-[#004a8f] transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <FontAwesomeIcon icon={faLinkedinIn} />
          LinkedIn
        </a>
      )}
    </div>
  )
}
