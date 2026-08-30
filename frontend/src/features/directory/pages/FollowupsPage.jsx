import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { statusMeta } from '../../../shared/lib/prospect'
import { useFollowups } from '../hooks/useFollowups'
import ContactDrawer from '../components/ContactDrawer'
import { useProspectingLists } from '../hooks/useProspectingLists'

function Row({ row, urgent, onOpen }) {
  const st = statusMeta(row.status)
  return (
    <div
      className="card"
      onClick={() => onOpen(row)}
      style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flexWrap: 'wrap' }}
    >
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{row.prenom} {row.nom?.toUpperCase()}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{row.entreprise_actuelle || '—'}</div>
      </div>

      <span style={{ background: st.bg, color: st.fg, borderRadius: 99, padding: '2px 9px', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>
        {st.label}
      </span>

      <span style={{ fontSize: 12.5, color: urgent ? 'var(--bad)' : 'var(--ink-3)', whiteSpace: 'nowrap', minWidth: 92, textAlign: 'right' }}>
        {new Date(row.next_action_at + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
      </span>

      {row.email && (
        <a
          href={`mailto:${row.email}`}
          onClick={e => e.stopPropagation()}
          className="btn-ghost flex items-center gap-1.5"
          style={{ fontSize: 12.5, textDecoration: 'none', flexShrink: 0 }}
        >
          <Icon name="send" size={12} /> Écrire
        </a>
      )}
    </div>
  )
}

export default function FollowupsPage() {
  const [mine, setMine] = useState(true)
  const { buckets, rows, enRetard, loading, error } = useFollowups({ mine })
  const { lists, createList, addContactToList } = useProspectingLists()
  const [open, setOpen] = useState(null)

  return (
    <div className="px-8 py-6 fade-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 className="page-title">Relances</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={mine ? 'btn-ember' : 'btn-ghost'} style={{ fontSize: 13 }} onClick={() => setMine(true)}>Les miennes</button>
          <button className={!mine ? 'btn-ember' : 'btn-ghost'} style={{ fontSize: 13 }} onClick={() => setMine(false)}>Toutes</button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 22 }}>
        Les contacts dont une relance est prévue, toutes campagnes confondues.
        {enRetard > 0 && <> <b style={{ color: 'var(--bad)' }}>{enRetard} en retard.</b></>}
      </p>

      {loading ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : error ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--bad)', fontSize: 14 }}>{error}</div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ color: 'var(--ok)', marginBottom: 10 }}><Icon name="check" size={26} /></div>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Rien à relancer</div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', maxWidth: 400, margin: '0 auto' }}>
            Une relance se planifie en enregistrant une démarche depuis la fiche d'un
            contact, avec une date de rappel.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {buckets.map(b => (
            <div key={b.key}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: b.urgent ? 'var(--bad)' : 'var(--ink-4)', marginBottom: 8, fontWeight: 500 }}>
                {b.label} · {b.rows.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {b.rows.map(r => <Row key={r.id} row={r} urgent={b.urgent} onOpen={setOpen} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <ContactDrawer
          contact={open}
          lists={lists}
          onClose={() => setOpen(null)}
          onAddToList={addContactToList}
          onCreateList={createList}
        />
      )}
    </div>
  )
}
