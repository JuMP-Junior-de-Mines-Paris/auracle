import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useProspectingLists } from '../hooks/useProspectingLists'
import { useContacts } from '../hooks/useContacts'

const LIST_COLORS = ['#015d9c', '#3f7a4d', '#b8861a', '#8d2f10', '#5a3873', '#2f6dc4']

export default function ListsPage() {
  const { id: selectedId } = useParams()
  const navigate = useNavigate()
  const { lists, loading: listsLoading, createList, addContactToList, fetchListContacts, removeContactFromList } = useProspectingLists()
  const [showInput, setShowInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [listContacts, setListContacts] = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [prevId, setPrevId] = useState(null)

  // Load contacts when selected list changes
  if (selectedId && selectedId !== prevId) {
    setPrevId(selectedId)
    setLoadingContacts(true)
    fetchListContacts(selectedId).then(data => { setListContacts(data); setLoadingContacts(false) })
  }

  const activeList = lists.find(l => l.id === selectedId)

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    const list = await createList(newName.trim())
    setNewName('')
    setShowInput(false)
    setCreating(false)
    navigate(`/annuaire/listes/${list.id}`)
  }

  async function handleRemove(contactId) {
    await removeContactFromList(selectedId, contactId)
    setListContacts(prev => prev.filter(c => c.id !== contactId))
  }

  return (
    <div className="px-8 py-6 fade-up flex gap-6" style={{ minHeight: 0 }}>
      {/* Left sidebar */}
      <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 className="page-title" style={{ fontSize: 28 }}>Listes</h1>
          <button
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ember)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => setShowInput(true)}
          >
            <Icon name="plus" size={12} /> Nouvelle
          </button>
        </div>

        {showInput && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              className="field"
              style={{ fontSize: 13, padding: '7px 10px' }}
              placeholder="Nom de la liste…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowInput(false); setNewName('') } }}
            />
            <button
              className="btn-ember"
              style={{ whiteSpace: 'nowrap', opacity: (!newName.trim() || creating) ? 0.5 : 1, padding: '7px 12px', fontSize: 13 }}
              disabled={!newName.trim() || creating}
              onClick={handleCreate}
            >
              {creating ? '…' : 'Créer'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {listsLoading ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Chargement…</div>
          ) : lists.length === 0 ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Aucune liste</div>
          ) : lists.map((list, i) => (
            <div
              key={list.id}
              onClick={() => navigate(`/annuaire/listes/${list.id}`)}
              className="card"
              style={{
                padding: 12,
                cursor: 'pointer',
                transition: 'border-color .12s, background .12s',
                borderColor: selectedId === list.id ? 'var(--ember)' : 'var(--line)',
                background: selectedId === list.id ? 'var(--ember-soft)' : '#fffdf8',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: LIST_COLORS[i % LIST_COLORS.length], flexShrink: 0 }} />
                <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{list.name}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-3)' }}>
                <span>{list.prospecting_list_contacts?.[0]?.count ?? 0} contacts</span>
                <span>{new Date(list.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {!selectedId || !activeList ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--ink-3)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--paper-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon name="bookmark" size={22} />
            </div>
            <div style={{ fontWeight: 500, color: 'var(--ink)', fontSize: 15, marginBottom: 4 }}>Sélectionnez une liste</div>
            <div style={{ fontSize: 13, maxWidth: 280 }}>Choisissez une liste dans le panneau de gauche pour voir son contenu.</div>
          </div>
        ) : (
          <>
            {/* List header card */}
            <div className="card p-5">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h2 className="font-serif" style={{ fontSize: 30, lineHeight: 1.05 }}>{activeList.name}</h2>
                  <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--ink-3)' }}>
                    {activeList.prospecting_list_contacts?.[0]?.count ?? 0} contacts · créé le {new Date(activeList.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost flex items-center gap-1.5"><Icon name="download" size={13} /> Export CSV</button>
                  <button className="btn-ember flex items-center gap-1.5"><Icon name="send" size={13} /> Composer email</button>
                </div>
              </div>
            </div>

            {/* Contacts table */}
            <div className="card overflow-hidden">
              {loadingContacts ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
              ) : listContacts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 14 }}>
                  Cette liste est vide. Ajoutez des contacts depuis l'Annuaire.
                </div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th><input type="checkbox" /></th>
                      <th>Contact</th>
                      <th>Entreprise</th>
                      <th>Email</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listContacts.map(c => (
                      <tr key={c.id}>
                        <td><input type="checkbox" /></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              className="avatar"
                              style={{
                                width: 26, height: 26,
                                background: `oklch(0.88 0.06 ${(((c.id_profil ?? '') + c.nom).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 47) % 360})`,
                                color: `oklch(0.32 0.10 ${(((c.id_profil ?? '') + c.nom).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 47) % 360})`,
                                fontSize: 11,
                                border: '1px solid var(--line)',
                              }}
                            >
                              {`${c.prenom?.[0] ?? ''}${c.nom?.[0] ?? ''}`.toUpperCase() || '?'}
                            </span>
                            <div style={{ lineHeight: 1.3 }}>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{c.prenom} {c.nom?.toUpperCase()}</div>
                              {c.titre_poste && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.titre_poste}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.entreprise_actuelle || '—'}</td>
                        <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                          {c.email ? <a href={`mailto:${c.email}`} style={{ color: 'var(--ember)' }}>{c.email}</a> : '—'}
                        </td>
                        <td>
                          <button
                            style={{ padding: 4, color: 'var(--bad)', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 6 }}
                            onClick={() => handleRemove(c.id)}
                            title="Retirer de la liste"
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
