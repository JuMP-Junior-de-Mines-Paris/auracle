import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'
import Can from '../../../shared/components/Can'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { useContacts } from '../hooks/useContacts'
import { useContactStats } from '../hooks/useContactStats'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactDrawer from '../components/ContactDrawer'
import ContactForm from '../components/ContactForm'
import ContactStatusBadge from '../components/ContactStatusBadge'
import ImportCsvModal from '../components/ImportCsvModal'

// Les codes suivent prospect_statuses (013). On n'affiche pas les neuf
// statuts en cartes : seuls les jalons que l'équipe regarde au quotidien.
const KPI_CONFIG = [
  { key: '__total__',     label: 'Total',         color: 'var(--ink)', statusValue: undefined },
  { key: 'a_contacter',   label: 'À contacter',   color: '#6b7280',    statusValue: 'a_contacter' },
  { key: 'contacte',      label: 'Contactés',     color: '#1d4ed8',    statusValue: 'contacte' },
  { key: 'en_discussion', label: 'En discussion', color: '#b45309',    statusValue: 'en_discussion' },
  { key: 'converti',      label: 'Convertis',     color: '#15803d',    statusValue: 'converti' },
]

function StatCard({ count, label, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card"
      style={{
        padding: '14px 16px', borderTop: `3px solid ${color}`,
        textAlign: 'left', cursor: 'pointer', width: '100%',
        outline: active ? `2px solid ${color}` : 'none',
        outlineOffset: 2,
        background: active ? '#fffdf8' : undefined,
        transition: 'outline .1s, box-shadow .1s',
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{count.toLocaleString('fr-FR')}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{label}</div>
    </button>
  )
}

function ContactAvatar({ contact, size = 28 }) {
  const initials = `${contact.prenom?.[0] ?? ''}${contact.nom?.[0] ?? ''}`.toUpperCase() || '?'
  const hue = (((contact.id_profil ?? '') + contact.nom).split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360
  return (
    <span className="avatar" style={{
      width: size, height: size,
      background: `oklch(0.88 0.06 ${hue})`,
      color: `oklch(0.32 0.10 ${hue})`,
      fontSize: Math.max(10, size * 0.4),
      border: '1px solid var(--line)',
      flexShrink: 0,
    }}>{initials}</span>
  )
}

function Pagination({ page, total, pageSize, onPage }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  function pages() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const p = [1]
    if (page > 3) p.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) p.push(i)
    if (page < totalPages - 2) p.push('…')
    p.push(totalPages)
    return p
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '16px 0', flexWrap: 'wrap' }}>
      <button
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        className="btn-ghost"
        style={{ padding: '6px 12px', fontSize: 13, opacity: page === 1 ? 0.4 : 1 }}
      >
        ← Précédent
      </button>
      {pages().map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} style={{ padding: '6px 4px', fontSize: 13, color: 'var(--ink-3)' }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={p === page ? 'btn-ember' : 'btn-ghost'}
            style={{ padding: '6px 10px', fontSize: 13, minWidth: 36 }}
          >
            {p}
          </button>
        )
      )}
      <button
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
        className="btn-ghost"
        style={{ padding: '6px 12px', fontSize: 13, opacity: page === totalPages ? 0.4 : 1 }}
      >
        Suivant →
      </button>
    </div>
  )
}

export default function DirectoryPage() {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(undefined)
  const [selected, setSelected] = useState(new Set())
  const [openContact, setOpenContact] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [showImport, setShowImport] = useState(false)

  // Bulk action state
  const [showListDropdown, setShowListDropdown] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [toast, setToast] = useState(null)

  const { contacts, total, loading, createContact, updateContact, updateStatus, refetch } = useContacts({ page, pageSize: 50, query, statusFilter })
  const { stats, refetch: refetchStats } = useContactStats()
  const { can } = usePermissions()
  const canWrite = can('contacts.write')

  function handleKpiClick(statusValue) {
    const next = statusFilter === statusValue ? undefined : statusValue
    setStatusFilter(next)
    setPage(1)
    setSelected(new Set())
  }

  async function handleStatusChange(id, status) {
    await updateStatus(id, status)
    setOpenContact(prev => prev?.id === id ? { ...prev, status: status ?? null } : prev)
    refetchStats()
  }

  async function handleCreate(form) {
    await createContact(form)
    refetchStats()
  }

  async function handleEdit(form) {
    const updated = await updateContact(editingContact.id, form)
    setOpenContact(prev => prev?.id === editingContact.id ? updated : prev)
    refetchStats()
  }
  const { lists, createList, addContactToList, addContactsToList } = useProspectingLists()

  function handleSearch(val) {
    setQuery(val)
    setPage(1)
    setSelected(new Set())
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const toggle = id => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }
  const toggleAll = () => {
    if (selected.size === contacts.length) setSelected(new Set())
    else setSelected(new Set(contacts.map(c => c.id)))
  }

  async function handleAddToList(listId) {
    setBulkLoading(true)
    try {
      const ids = [...selected]
      if (ids.length === 1) {
        await addContactToList(listId, ids[0])
      } else {
        await addContactsToList(listId, ids)
      }
      const listName = lists.find(l => l.id === listId)?.name ?? ''
      setSelected(new Set())
      setShowListDropdown(false)
      showToast(`${ids.length} contact${ids.length > 1 ? 's' : ''} ajouté${ids.length > 1 ? 's' : ''} à « ${listName} »`)
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleCreateList() {
    if (!newListName.trim() || bulkLoading) return
    setBulkLoading(true)
    const ids = [...selected]
    try {
      const list = await createList(newListName.trim())
      if (ids.length === 1) {
        await addContactToList(list.id, ids[0])
      } else {
        await addContactsToList(list.id, ids)
      }
      setSelected(new Set())
      setShowCreateModal(false)
      setNewListName('')
      showToast(`Liste « ${list.name} » créée avec ${ids.length} contact${ids.length > 1 ? 's' : ''}`)
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="px-8 py-6 fade-up">
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1a1614', color: '#fff', borderRadius: 10, padding: '10px 20px', fontSize: 13, zIndex: 100, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {toast}
        </div>
      )}

      {/* Topbar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Annuaire</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
            {total.toLocaleString('fr-FR')} contacts
          </p>
        </div>
        <Can perm="contacts.write">
          <button className="btn-ember flex items-center gap-2" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Nouveau contact
          </button>
        </Can>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        {KPI_CONFIG.map(k => (
          <StatCard
            key={k.key}
            count={stats[k.key] ?? 0}
            label={k.label}
            color={k.color}
            active={statusFilter === k.statusValue && k.statusValue !== undefined}
            onClick={() => handleKpiClick(k.statusValue)}
          />
        ))}
      </div>

      {/* Filter bar — sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--paper)', paddingBottom: 8 }}>
        <div className="card p-3 mb-3 flex items-center gap-2 flex-wrap">
          <div style={{ position: 'relative', flex: 1, minWidth: 280 }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }} />
            <input
              className="field ring-ember"
              style={{ paddingLeft: 36 }}
              placeholder="Rechercher : nom, entreprise, poste, ville…"
              value={query}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>
          <Can perm="contacts.import">
            <button className="btn-ghost flex items-center gap-1.5" onClick={() => setShowImport(true)}>
              <Icon name="upload" size={14} /> Importer CSV
            </button>
          </Can>
        </div>

        {/* Selection bar */}
        {selected.size > 0 && (
          <div className="mb-3 flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--ember-soft)', border: '1px solid #c2d9ef', position: 'relative' }}>
            <div style={{ fontSize: 13, color: 'var(--ember-2)' }}>
              <strong>{selected.size}</strong> contact{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-2">
              {/* Add to existing list */}
              <div style={{ position: 'relative' }}>
                <button
                  className="btn-ghost flex items-center gap-1.5"
                  onClick={() => { setShowListDropdown(v => !v); setShowCreateModal(false) }}
                >
                  <Icon name="bookmark" size={13} /> Ajouter à une liste
                </button>
                {showListDropdown && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fffdf8', border: '1px solid var(--line)', borderRadius: 10, padding: 6, minWidth: 200, zIndex: 20, boxShadow: '0 4px 16px rgba(0,0,0,.08)' }}>
                    {lists.length === 0 ? (
                      <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-3)' }}>Aucune liste existante</div>
                    ) : lists.map(list => (
                      <button
                        key={list.id}
                        className="btn-ghost"
                        style={{ width: '100%', justifyContent: 'flex-start', fontSize: 13 }}
                        onClick={() => handleAddToList(list.id)}
                        disabled={bulkLoading}
                      >
                        {list.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Create list from selection */}
              <button
                className="btn-primary flex items-center gap-1.5"
                onClick={() => { setShowCreateModal(true); setShowListDropdown(false) }}
              >
                <Icon name="plus" size={13} /> Créer une liste
              </button>
              <button style={{ padding: 6, color: 'var(--ink-3)', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setSelected(new Set())}>
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Counter */}
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          <strong style={{ color: 'var(--ink)' }}>{total.toLocaleString('fr-FR')}</strong> résultat{total !== 1 ? 's' : ''}
          {query && <span> pour « {query} »</span>}
        </div>
      </div>

      {/* Table — no fixed height, whole page scrolls */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === contacts.length && contacts.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th>Nom</th>
                <th>Entreprise / Poste</th>
                <th>Localisation</th>
                <th>Diplôme · Année</th>
                <th>Email</th>
                <th>Téléphone</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} className={selected.has(c.id) ? 'selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setOpenContact(c)}>
                      <ContactAvatar contact={c} size={28} />
                      <div style={{ lineHeight: 1.3 }}>
                        <div style={{ fontWeight: 500, fontSize: 13.5 }}>{c.prenom} {c.nom?.toUpperCase()}</div>
                        {c.id_profil && <div className="font-mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>#{c.id_profil}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ lineHeight: 1.3 }}>
                      <div style={{ fontSize: 13 }}>{c.entreprise_actuelle || '—'}</div>
                      {c.titre_poste && <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{c.titre_poste}</div>}
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {c.ville || '—'}{c.pays && <span style={{ color: 'var(--ink-4)' }}> · {c.pays}</span>}
                  </td>
                  <td>
                    <div style={{ lineHeight: 1.3 }}>
                      {c.diplomes && <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{c.diplomes}</div>}
                      {c.annee_obtention_diplome && <div className="font-mono" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{c.annee_obtention_diplome}</div>}
                      {!c.diplomes && !c.annee_obtention_diplome && <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} style={{ color: 'var(--ember)' }} onClick={e => e.stopPropagation()}>{c.email}</a>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {c.telephone ? (
                      <a href={`tel:${c.telephone}`} style={{ color: 'var(--ink-2)' }} onClick={e => e.stopPropagation()}>{c.telephone}</a>
                    ) : '—'}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <ContactStatusBadge status={c.status} onChange={canWrite ? status => handleStatusChange(c.id, status) : undefined} />
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)' }}>
                    Aucun contact trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <Pagination page={page} total={total} pageSize={50} onPage={p => { setPage(p); window.scrollTo(0, 0) }} />

      {/* Create list modal */}
      {showCreateModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,22,20,.25)' }}
          onClick={() => { setShowCreateModal(false); setNewListName('') }}
        >
          <div style={{ background: '#fffdf8', border: '1px solid var(--line)', borderRadius: 16, padding: 24, width: 360, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Nouvelle liste</h3>
            <input
              autoFocus
              className="field"
              style={{ width: '100%', marginBottom: 12 }}
              placeholder="Nom de la liste…"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateList()}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setShowCreateModal(false); setNewListName('') }}>Annuler</button>
              <button
                className="btn-ember"
                style={{ flex: 1, opacity: (!newListName.trim() || bulkLoading) ? 0.5 : 1 }}
                disabled={!newListName.trim() || bulkLoading}
                onClick={handleCreateList}
              >
                {bulkLoading ? '…' : `Créer avec ${selected.size} contact${selected.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact drawer */}
      {openContact && (
        <ContactDrawer
          contact={openContact}
          lists={lists}
          onClose={() => setOpenContact(null)}
          onAddToList={addContactToList}
          onCreateList={createList}
          onStatusChange={canWrite ? status => handleStatusChange(openContact.id, status) : undefined}
          onEdit={canWrite ? () => { setEditingContact(openContact); setOpenContact(null) } : undefined}
        />
      )}

      {showImport && (
        <ImportCsvModal
          onClose={() => setShowImport(false)}
          onDone={() => { refetch(); refetchStats() }}
        />
      )}

      {/* New contact form */}
      {showForm && (
        <ContactForm onClose={() => setShowForm(false)} onSubmit={handleCreate} />
      )}

      {/* Edit contact form */}
      {editingContact && (
        <ContactForm
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onSubmit={handleEdit}
        />
      )}
    </div>
  )
}
