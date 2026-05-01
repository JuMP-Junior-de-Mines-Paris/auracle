import { useState, useCallback, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { useContacts } from '../hooks/useContacts'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactCard from '../components/ContactCard'
import ContactModal from '../components/ContactModal'
import ContactForm from '../components/ContactForm'
import ContextMenu from '../components/ContextMenu'

export default function DirectoryPage() {
  const { contacts, loading, createContact } = useContacts()
  const { lists, createList, addContactToList } = useProspectingLists()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [focusedContact, setFocusedContact] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const filtered = contacts.filter(c => {
    const q = debouncedSearch.toLowerCase()
    return (
      `${c.prenom ?? ''} ${c.nom ?? ''}`.toLowerCase().includes(q) ||
      (c.entreprise_actuelle ?? '').toLowerCase().includes(q) ||
      (c.titre_poste ?? '').toLowerCase().includes(q)
    )
  })

  const handleContextMenu = useCallback((e, contact) => {
    setContextMenu({ x: e.clientX, y: e.clientY, contact })
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  return (
    <div className="p-4 sm:p-6">
      <div className="relative mb-6">
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005a9f] focus:border-transparent bg-white"
          placeholder="Rechercher par nom, entreprise, poste…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-slate-400 text-center py-12">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(contact => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onClick={setFocusedContact}
              onContextMenu={handleContextMenu}
            />
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-slate-400 text-center py-12">
              Aucun contact trouvé.
            </p>
          )}
        </div>
      )}

      <button
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-[#005a9f] text-white rounded-full shadow-lg hover:bg-[#004a8f] transition-colors flex items-center justify-center text-xl"
        onClick={() => setShowForm(true)}
        aria-label="Ajouter un contact"
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          lists={lists}
          onViewProfile={() => { setFocusedContact(contextMenu.contact); setContextMenu(null) }}
          onCopyEmail={() => {
            navigator.clipboard.writeText(contextMenu.contact.email ?? '')
            setContextMenu(null)
          }}
          onAddToList={async listId => {
            await addContactToList(listId, contextMenu.contact.id)
            setContextMenu(null)
          }}
          onCreateList={async name => {
            const list = await createList(name)
            await addContactToList(list.id, contextMenu.contact.id)
            setContextMenu(null)
          }}
        />
      )}

      {focusedContact && (
        <ContactModal contact={focusedContact} onClose={() => setFocusedContact(null)} />
      )}
      {showForm && (
        <ContactForm onClose={() => setShowForm(false)} onSubmit={createContact} />
      )}
    </div>
  )
}
