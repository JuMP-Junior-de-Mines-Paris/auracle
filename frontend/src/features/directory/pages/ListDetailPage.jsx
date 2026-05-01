import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactCard from '../components/ContactCard'
import ContactModal from '../components/ContactModal'

export default function ListDetailPage() {
  const { id } = useParams()
  const { lists, fetchListContacts, removeContactFromList } = useProspectingLists()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [focusedContact, setFocusedContact] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)

  const list = lists.find(l => l.id === id)

  useEffect(() => {
    fetchListContacts(id).then(data => { setContacts(data); setLoading(false) })
  }, [id, fetchListContacts])

  const handleContextMenu = useCallback((e, contact) => {
    setContextMenu({ x: e.clientX, y: e.clientY, contact })
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  async function handleRemove(contactId) {
    await removeContactFromList(id, contactId)
    setContacts(prev => prev.filter(c => c.id !== contactId))
    setContextMenu(null)
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/annuaire/listes"
          className="text-slate-400 hover:text-[#005a9f] transition-colors"
          aria-label="Retour aux listes"
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">{list?.name ?? 'Liste'}</h1>
        <span className="text-slate-400 text-sm">{contacts.length} contact(s)</span>
      </div>

      {loading ? (
        <p className="text-slate-400 text-center py-12">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {contacts.map(contact => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onClick={setFocusedContact}
              onContextMenu={handleContextMenu}
            />
          ))}
          {contacts.length === 0 && (
            <p className="col-span-full text-center text-slate-500 py-12">
              Cette liste est vide. Ajoutez des contacts depuis l'Annuaire.
            </p>
          )}
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => { setFocusedContact(contextMenu.contact); setContextMenu(null) }}
          >
            Voir le profil
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
            onClick={() => handleRemove(contextMenu.contact.id)}
          >
            Retirer de la liste
          </button>
        </div>
      )}

      {focusedContact && (
        <ContactModal contact={focusedContact} onClose={() => setFocusedContact(null)} />
      )}
    </div>
  )
}
