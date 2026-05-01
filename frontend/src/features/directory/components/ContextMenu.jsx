import { useState } from 'react'

export default function ContextMenu({
  x, y, lists,
  onViewProfile, onCopyEmail, onAddToList, onCreateList,
}) {
  const [showSub, setShowSub] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    await onCreateList(newName.trim())
    setCreating(false)
    setNewName('')
  }

  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[190px]"
      style={{ top: y, left: x }}
      onClick={e => e.stopPropagation()}
    >
      <button
        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        onClick={onViewProfile}
      >
        Voir le profil
      </button>

      <button
        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex justify-between items-center"
        onClick={() => setShowSub(v => !v)}
      >
        Ajouter à une liste…
        <span className="text-slate-400">›</span>
      </button>

      {showSub && (
        <div className="border-t border-slate-100">
          {lists.map(list => (
            <button
              key={list.id}
              className="w-full text-left px-6 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => onAddToList(list.id)}
            >
              {list.name}
            </button>
          ))}
          <div className="px-4 py-2 flex gap-2 border-t border-slate-100">
            <input
              autoFocus
              className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#005a9f]"
              placeholder="Nouvelle liste…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <button
              className="text-xs bg-[#005a9f] text-white px-2 py-1 rounded disabled:opacity-40"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? '…' : '+'}
            </button>
          </div>
        </div>
      )}

      <button
        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        onClick={onCopyEmail}
      >
        Copier l'email
      </button>
    </div>
  )
}
