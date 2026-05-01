import { useState, useCallback, useEffect } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { useContacts } from '../hooks/useContacts'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactDrawer from '../components/ContactDrawer'
import ContactForm from '../components/ContactForm'

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

export default function DirectoryPage() {
  const { contacts, loading, createContact } = useContacts()
  const { lists, createList, addContactToList } = useProspectingLists()

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [openContact, setOpenContact] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const filtered = contacts.filter(c => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      `${c.prenom ?? ''} ${c.nom ?? ''}`.toLowerCase().includes(q) ||
      (c.entreprise_actuelle ?? '').toLowerCase().includes(q) ||
      (c.titre_poste ?? '').toLowerCase().includes(q) ||
      (c.ville ?? '').toLowerCase().includes(q)
    )
  })

  const toggle = id => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(c => c.id)))
  }

  return (
    <div className="px-8 py-6 fade-up">
      {/* Topbar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Annuaire</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
            {contacts.length.toLocaleString('fr-FR')} contacts
          </p>
        </div>
        <button
          className="btn-ember flex items-center gap-2"
          onClick={() => setShowForm(true)}
        >
          <Icon name="plus" size={14} />
          Nouveau contact
        </button>
      </div>

      {/* Filter bar */}
      <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap">
        <div style={{ position: 'relative', flex: 1, minWidth: 280 }}>
          <Icon
            name="search" size={14}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }}
          />
          <input
            className="field ring-ember"
            style={{ paddingLeft: 36 }}
            placeholder="Rechercher : nom, entreprise, poste, ville…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <button className="btn-ghost flex items-center gap-1.5">
          <Icon name="upload" size={14} /> Importer CSV
        </button>
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--ember-soft)', border: '1px solid #c2d9ef' }}>
          <div style={{ fontSize: 13, color: 'var(--ember-2)' }}>
            <strong>{selected.size}</strong> contact{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost flex items-center gap-1.5"><Icon name="bookmark" size={13} /> Ajouter à une liste</button>
            <button className="btn-ghost flex items-center gap-1.5"><Icon name="tag" size={13} /> Tag</button>
            <button
              className="btn-primary flex items-center gap-1.5"
              onClick={() => setSelected(new Set())}
            >
              <Icon name="plus" size={13} /> Créer une liste
            </button>
            <button style={{ padding: 6, color: 'var(--ink-3)', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setSelected(new Set())}>
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Counter */}
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          <strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> résultat{filtered.length !== 1 ? 's' : ''}
          {query && <span> pour « {query} »</span>}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : (
        <div className="card overflow-hidden">
          <div style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>Nom</th>
                  <th>Entreprise / Poste</th>
                  <th>Localisation</th>
                  <th>Diplôme · Année</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr
                    key={c.id}
                    className={selected.has(c.id) ? 'selected' : ''}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td>
                      <div
                        className="flex items-center gap-2.5 cursor-pointer"
                        onClick={() => setOpenContact(c)}
                      >
                        <ContactAvatar contact={c} size={28} />
                        <div style={{ lineHeight: 1.3 }}>
                          <div style={{ fontWeight: 500, fontSize: 13.5 }}>{c.prenom} {c.nom?.toUpperCase()}</div>
                          {c.id_profil && (
                            <div className="font-mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>#{c.id_profil}</div>
                          )}
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
                      {c.ville || '—'}
                      {c.pays && <span style={{ color: 'var(--ink-4)' }}> · {c.pays}</span>}
                    </td>
                    <td>
                      <div style={{ lineHeight: 1.3 }}>
                        {c.diplomes && <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{c.diplomes}</div>}
                        {c.annee_obtention_diplome && (
                          <div className="font-mono" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{c.annee_obtention_diplome}</div>
                        )}
                        {!c.diplomes && !c.annee_obtention_diplome && <span style={{ color: 'var(--ink-4)' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                      {c.email ? (
                        <a href={`mailto:${c.email}`} style={{ color: 'var(--ember)' }} onClick={e => e.stopPropagation()}>
                          {c.email}
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)' }}>
                      Aucun contact trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
        />
      )}

      {/* New contact form */}
      {showForm && (
        <ContactForm onClose={() => setShowForm(false)} onSubmit={createContact} />
      )}
    </div>
  )
}
