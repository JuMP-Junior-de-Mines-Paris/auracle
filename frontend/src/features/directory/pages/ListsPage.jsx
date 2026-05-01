import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faList } from '@fortawesome/free-solid-svg-icons'
import { useProspectingLists } from '../hooks/useProspectingLists'

export default function ListsPage() {
  const { lists, loading, createList } = useProspectingLists()
  const [showInput, setShowInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    await createList(newName.trim())
    setNewName('')
    setShowInput(false)
    setCreating(false)
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Listes de prospection</h1>
        <button
          className="flex items-center gap-2 bg-[#005a9f] text-white px-4 py-2 rounded-lg hover:bg-[#004a8f] transition-colors text-sm"
          onClick={() => setShowInput(true)}
        >
          <FontAwesomeIcon icon={faPlus} />
          Nouvelle liste
        </button>
      </div>

      {showInput && (
        <div className="mb-6 flex gap-3">
          <input
            autoFocus
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005a9f]"
            placeholder="Nom de la liste…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <button
            className="px-4 py-2 bg-[#005a9f] text-white rounded-lg text-sm disabled:opacity-50"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
          >
            {creating ? '…' : 'Créer'}
          </button>
          <button
            className="px-4 py-2 text-slate-500 text-sm"
            onClick={() => { setShowInput(false); setNewName('') }}
          >
            Annuler
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400 text-center py-12">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {lists.map(list => (
            <Link
              key={list.id}
              to={`/annuaire/listes/${list.id}`}
              className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md hover:border-[#005a9f] transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#005a9f]/10 flex items-center justify-center flex-shrink-0">
                  <FontAwesomeIcon icon={faList} className="text-[#005a9f]" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{list.name}</p>
                  <p className="text-sm text-slate-500">
                    {list.prospecting_list_contacts?.[0]?.count ?? 0} contact(s)
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(list.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            </Link>
          ))}
          {lists.length === 0 && (
            <p className="col-span-full text-center text-slate-500 py-12">
              Aucune liste. Créez votre première liste de prospection.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
