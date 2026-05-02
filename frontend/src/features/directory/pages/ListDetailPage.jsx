import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactDrawer from '../components/ContactDrawer'

export default function ListDetailPage() {
  const { id } = useParams()
  const { lists, fetchListContacts, removeContactFromList, addContactToList, createList } = useProspectingLists()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [openContact, setOpenContact] = useState(null)

  const list = lists.find(l => l.id === id)

  useEffect(() => {
    setLoading(true)
    fetchListContacts(id).then(data => { setContacts(data); setLoading(false) })
  }, [id])

  async function handleRemove(contactId, e) {
    e.stopPropagation()
    await removeContactFromList(id, contactId)
    setContacts(prev => prev.filter(c => c.id !== contactId))
  }

  return (
    <div className="px-8 py-6 fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/annuaire/listes" style={{ color: 'var(--ink-3)', display: 'flex' }}>
          <Icon name="arrowL" size={16} />
        </Link>
        <div>
          <h1 className="page-title">{list?.name ?? 'Liste'}</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Entreprise / Poste</th>
                <th>Email</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => {
                const initials = `${c.prenom?.[0] ?? ''}${c.nom?.[0] ?? ''}`.toUpperCase() || '?'
                const hue = (((c.id_profil ?? '') + c.nom).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 47) % 360
                return (
                  <tr
                    key={c.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setOpenContact(c)}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="avatar" style={{ width: 28, height: 28, background: `oklch(0.88 0.06 ${hue})`, color: `oklch(0.32 0.10 ${hue})`, fontSize: 11, border: '1px solid var(--line)', flexShrink: 0 }}>
                          {initials}
                        </span>
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
                    <td style={{ fontSize: 13 }}>
                      {c.email ? (
                        <a href={`mailto:${c.email}`} style={{ color: 'var(--ember)' }} onClick={e => e.stopPropagation()}>{c.email}</a>
                      ) : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </td>
                    <td>
                      <button
                        style={{ padding: 4, color: 'var(--bad)', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 6, opacity: 0.6 }}
                        onClick={e => handleRemove(c.id, e)}
                        title="Retirer de la liste"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)' }}>
                    Cette liste est vide. Ajoutez des contacts depuis l'Annuaire.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {openContact && (
        <ContactDrawer
          contact={openContact}
          lists={lists}
          onClose={() => setOpenContact(null)}
          onAddToList={addContactToList}
          onCreateList={createList}
        />
      )}
    </div>
  )
}
