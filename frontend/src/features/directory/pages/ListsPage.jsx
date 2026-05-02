import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useAuth } from '../../auth/hooks/useAuth'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactDrawer from '../components/ContactDrawer'
import { supabase } from '../../../shared/lib/supabase'

const LIST_COLORS = ['#015d9c', '#3f7a4d', '#b8861a', '#8d2f10', '#5a3873', '#2f6dc4']

// ── Share modal ────────────────────────────────────────────────────────────────

function ShareModal({ list, onClose, shareList, revokeShare, fetchListShares }) {
  const [members, setMembers] = useState([])
  const [existing, setExisting] = useState([])  // users who already have access
  const [search, setSearch] = useState('')
  const [toAdd, setToAdd] = useState(new Set())
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [profilesRes, sharesData] = await Promise.all([
        supabase.from('profiles').select('id, prenom, nom, email').order('nom'),
        fetchListShares(list.id),
      ])
      setMembers(profilesRes.data ?? [])
      setExisting(sharesData)
      setLoadingData(false)
    }
    load()
  }, [list.id])

  const existingIds = new Set(existing.map(m => m.id))
  const filtered = members.filter(m => {
    if (existingIds.has(m.id)) return false
    const q = search.toLowerCase()
    return !q || `${m.prenom} ${m.nom}`.toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q)
  })

  async function handleShare() {
    if (toAdd.size === 0 || saving) return
    setSaving(true)
    try {
      await shareList(list.id, [...toAdd])
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(userId) {
    await revokeShare(list.id, userId)
    setExisting(prev => prev.filter(m => m.id !== userId))
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,22,20,.28)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fffdf8', border: '1px solid var(--line)', borderRadius: 16, padding: 0, width: 440, maxWidth: '92vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid var(--line)' }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 15 }}>Partager la liste</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>« {list.name} »</div>
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, color: 'var(--ink-3)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {loadingData ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Chargement…</div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Existing shares */}
            {existing.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-4)', marginBottom: 8 }}>
                  Accès actuel
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {existing.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: 'var(--ember-soft)', border: '1px solid #c2d9ef' }}>
                      <span className="avatar" style={{ width: 26, height: 26, background: 'var(--ember)', color: '#fff', fontSize: 10, flexShrink: 0 }}>
                        {`${m.prenom?.[0] ?? ''}${m.nom?.[0] ?? ''}`.toUpperCase() || '?'}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{m.prenom} {m.nom}</span>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{m.email}</span>
                      <button
                        onClick={() => handleRevoke(m.id)}
                        style={{ fontSize: 11, color: 'var(--bad)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
                        title="Révoquer l'accès"
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new members */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-4)', marginBottom: 8 }}>
                Ajouter des membres
              </div>
              <input
                autoFocus
                className="field"
                style={{ width: '100%', marginBottom: 8 }}
                placeholder="Rechercher par nom ou email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {/* Selected chips */}
              {toAdd.size > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {[...toAdd].map(uid => {
                    const m = members.find(x => x.id === uid)
                    return (
                      <span key={uid} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--ember-soft)', border: '1px solid #c2d9ef', borderRadius: 99, padding: '3px 10px', fontSize: 12 }}>
                        {m?.prenom} {m?.nom}
                        <button onClick={() => setToAdd(s => { const n = new Set(s); n.delete(uid); return n })} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--ink-3)' }}>
                          <Icon name="x" size={10} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflow: 'auto' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Aucun membre trouvé</div>
                ) : filtered.map(m => {
                  const selected = toAdd.has(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => setToAdd(s => { const n = new Set(s); selected ? n.delete(m.id) : n.add(m.id); return n })}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: selected ? 'var(--ember-soft)' : 'transparent', border: selected ? '1px solid #c2d9ef' : '1px solid transparent', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span className="avatar" style={{ width: 26, height: 26, background: selected ? 'var(--ember)' : 'var(--paper-2)', color: selected ? '#fff' : 'var(--ink-3)', fontSize: 10, border: '1px solid var(--line)', flexShrink: 0 }}>
                        {`${m.prenom?.[0] ?? ''}${m.nom?.[0] ?? ''}`.toUpperCase() || '?'}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{m.prenom} {m.nom}</span>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{m.email}</span>
                      {selected && <Icon name="check" size={14} style={{ color: 'var(--ember)', flexShrink: 0 }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
          <button
            className="btn-ember"
            style={{ flex: 1, opacity: (toAdd.size === 0 || saving) ? 0.5 : 1 }}
            disabled={toAdd.size === 0 || saving}
            onClick={handleShare}
          >
            {saving ? '…' : `Partager avec ${toAdd.size} membre${toAdd.size > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ListsPage() {
  const { id: selectedId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    lists, sharedLists, loading: listsLoading,
    createList, addContactToList, fetchListContacts, removeContactFromList,
    shareList, revokeShare, fetchListShares,
  } = useProspectingLists()

  const [showInput, setShowInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [listContacts, setListContacts] = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [prevId, setPrevId] = useState(null)
  const [openContact, setOpenContact] = useState(null)
  const [showShareModal, setShowShareModal] = useState(false)

  if (selectedId && selectedId !== prevId) {
    setPrevId(selectedId)
    setLoadingContacts(true)
    fetchListContacts(selectedId).then(data => { setListContacts(data); setLoadingContacts(false) })
  }

  const allLists = [...lists, ...sharedLists]
  const activeList = allLists.find(l => l.id === selectedId)
  const isOwner = user && activeList?.created_by === user.id

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

  function renderListCard(list, i, isShared = false) {
    return (
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
          {isShared
            ? <Icon name="users" size={11} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
            : <span style={{ width: 8, height: 8, borderRadius: 99, background: LIST_COLORS[i % LIST_COLORS.length], flexShrink: 0 }} />
          }
          <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{list.name}</div>
        </div>
        {isShared && list.sharedBy && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>
            Partagé par {list.sharedBy.prenom} {list.sharedBy.nom}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, fontFamily: 'monospace', color: 'var(--ink-3)' }}>
          <span>{list.prospecting_list_contacts?.[0]?.count ?? 0} contacts</span>
          <span>{new Date(list.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        </div>
      </div>
    )
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

        {/* Mes listes */}
        {lists.length > 0 && (
          <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--ink-4)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Mes listes
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {listsLoading ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Chargement…</div>
          ) : lists.length === 0 && sharedLists.length === 0 ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Aucune liste</div>
          ) : lists.map((list, i) => renderListCard(list, i, false))}
        </div>

        {/* Partagées avec moi */}
        {sharedLists.length > 0 && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--ink-4)', letterSpacing: '.08em', textTransform: 'uppercase', paddingTop: 4 }}>
              Partagées avec moi
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sharedLists.map((list, i) => renderListCard(list, i, true))}
            </div>
          </>
        )}
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
            {/* List header */}
            <div className="card p-5">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 className="font-serif" style={{ fontSize: 30, lineHeight: 1.05 }}>{activeList.name}</h2>
                    {!isOwner && activeList.sharedBy && (
                      <span style={{ fontSize: 11, background: 'var(--ember-soft)', color: 'var(--ember-2)', border: '1px solid #c2d9ef', borderRadius: 99, padding: '2px 9px' }}>
                        Partagé par {activeList.sharedBy.prenom} {activeList.sharedBy.nom}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--ink-3)' }}>
                    {activeList.prospecting_list_contacts?.[0]?.count ?? 0} contacts · créé le {new Date(activeList.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost flex items-center gap-1.5"><Icon name="download" size={13} /> Export CSV</button>
                  {isOwner && (
                    <button className="btn-ghost flex items-center gap-1.5" onClick={() => setShowShareModal(true)}>
                      <Icon name="users" size={13} /> Partager
                    </button>
                  )}
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
                      <th><input type="checkbox" onClick={e => e.stopPropagation()} /></th>
                      <th>Contact</th>
                      <th>Entreprise</th>
                      <th>Email</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listContacts.map(c => (
                      <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setOpenContact(c)}>
                        <td><input type="checkbox" onClick={e => e.stopPropagation()} /></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              className="avatar"
                              style={{
                                width: 26, height: 26,
                                background: `oklch(0.88 0.06 ${(((c.id_profil ?? '') + c.nom).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 47) % 360})`,
                                color: `oklch(0.32 0.10 ${(((c.id_profil ?? '') + c.nom).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 47) % 360})`,
                                fontSize: 11, border: '1px solid var(--line)',
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
                          {c.email ? <a href={`mailto:${c.email}`} style={{ color: 'var(--ember)' }} onClick={e => e.stopPropagation()}>{c.email}</a> : '—'}
                        </td>
                        <td>
                          {isOwner && (
                            <button
                              style={{ padding: 4, color: 'var(--bad)', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 6 }}
                              onClick={e => { e.stopPropagation(); handleRemove(c.id) }}
                              title="Retirer de la liste"
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          )}
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

      {openContact && (
        <ContactDrawer
          contact={openContact}
          lists={lists}
          onClose={() => setOpenContact(null)}
          onAddToList={addContactToList}
          onCreateList={createList}
        />
      )}

      {showShareModal && activeList && (
        <ShareModal
          list={activeList}
          onClose={() => setShowShareModal(false)}
          shareList={shareList}
          revokeShare={revokeShare}
          fetchListShares={fetchListShares}
        />
      )}
    </div>
  )
}
