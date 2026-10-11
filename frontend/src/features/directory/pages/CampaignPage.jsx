import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { OPEN_STATUSES, EXIT_STATUSES, statusMeta } from '../../../shared/lib/prospect'
import { useAction } from '../../../shared/components/ToastProvider'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { useMembers } from '../../members/hooks/useMembers'
import { useCampaign } from '../hooks/useCampaign'
import { useProspectingLists } from '../hooks/useProspectingLists'
import ContactDrawer from '../components/ContactDrawer'

function Carte({ row, onOpen, onMove, onDrag, canWrite }) {
  const c = row.contact
  const st = statusMeta(row.status)
  const enRetard = row.next_action_at && row.next_action_at < new Date().toISOString().split('T')[0]

  return (
    <div
      draggable={canWrite}
      onDragStart={e => { onDrag(row.contact_id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={() => onOpen(c)}
      className="card"
      style={{ padding: '9px 11px', cursor: canWrite ? 'grab' : 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.25 }}>
        {c.prenom} {c.nom?.toUpperCase()}
      </div>
      {c.entreprise_actuelle && (
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.25 }}>
          {c.entreprise_actuelle}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
        {row.assignee && (
          <span style={{ fontSize: 10.5, color: 'var(--ink-3)', background: 'var(--paper-2)', borderRadius: 99, padding: '1px 7px' }}>
            {row.assignee.prenom}
          </span>
        )}
        {row.next_action_at && (
          <span style={{ fontSize: 10.5, color: enRetard ? 'var(--bad)' : 'var(--ink-4)' }}>
            <Icon name="bell" size={9} />{' '}
            {new Date(row.next_action_at + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        )}
        {c.linkedin && (
          <a
            href={c.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Ouvrir le profil LinkedIn"
            style={{ marginLeft: 'auto', color: 'var(--ember)', display: 'flex' }}
          >
            <Icon name="link" size={12} />
          </a>
        )}
      </div>

      {/* Repli quand le glisser-déposer n'est pas praticable (tactile). */}
      {canWrite && (
        <select
          value={row.status ?? ''}
          onClick={e => e.stopPropagation()}
          onChange={e => onMove(row.contact_id, e.target.value)}
          style={{
            marginTop: 3, fontSize: 10.5, padding: '1px 4px', borderRadius: 6,
            border: '1px solid var(--line)', background: st.bg, color: st.fg, cursor: 'pointer',
          }}
        >
          <option value="" disabled>Déplacer…</option>
          {[...OPEN_STATUSES, ...EXIT_STATUSES].map(s => (
            <option key={s.code} value={s.code}>{s.label}</option>
          ))}
        </select>
      )}
    </div>
  )
}

function Colonne({ statut, rows, onOpen, onMove, onDrag, onDrop, canWrite }) {
  const [survol, setSurvol] = useState(false)

  return (
    <div
      onDragOver={e => { if (canWrite) { e.preventDefault(); setSurvol(true) } }}
      onDragLeave={() => setSurvol(false)}
      onDrop={e => { e.preventDefault(); setSurvol(false); onDrop(statut.code) }}
      style={{
        flex: '0 0 232px', display: 'flex', flexDirection: 'column', gap: 8,
        background: survol ? 'var(--ember-soft)' : 'var(--paper-2)',
        border: `1px solid ${survol ? '#c2d9ef' : 'var(--line)'}`,
        borderRadius: 12, padding: 10, minHeight: 140, transition: 'background .12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ background: statut.bg, color: statut.fg, borderRadius: 99, padding: '2px 9px', fontSize: 11, fontWeight: 500 }}>
          {statut.label}
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{rows.length}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => (
          <Carte key={r.contact_id} row={r} onOpen={onOpen} onMove={onMove} onDrag={onDrag} canWrite={canWrite} />
        ))}
        {rows.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', textAlign: 'center', padding: '12px 0' }}>—</div>
        )}
      </div>
    </div>
  )
}

export default function CampaignPage() {
  const { id } = useParams()
  const { list, rows, loading, error, moveTo, assign } = useCampaign(id)
  const { lists, createList, addContactToList } = useProspectingLists()
  const { members } = useMembers()
  const { can } = usePermissions()
  const run = useAction()
  const [ouvert, setOuvert] = useState(null)
  const [glisse, setGlisse] = useState(null)
  const canWrite = can('contacts.write')

  async function deplacer(contactId, statut) {
    if (!statut) return
    const nom = rows.find(r => r.contact_id === contactId)?.contact
    await run(() => moveTo(contactId, statut), {
      succes: `${nom?.prenom ?? 'Contact'} → ${statusMeta(statut).label}`,
    })
  }

  // Les étapes du pipeline, puis les sorties — mais seulement celles où il y
  // a du monde : afficher neuf colonnes vides noierait les trois qui comptent.
  const parStatut = code => rows.filter(r => (r.status ?? 'a_contacter') === code)
  const colonnes = [
    ...OPEN_STATUSES,
    ...EXIT_STATUSES.filter(s => parStatut(s.code).length > 0),
  ]

  if (loading) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>

  return (
    <div className="px-8 py-6 fade-up">
      <div className="flex items-center gap-3" style={{ marginBottom: 4 }}>
        <Link to="/annuaire/listes" style={{ color: 'var(--ink-3)', display: 'flex' }} title="Toutes les listes">
          <Icon name="arrowL" size={16} />
        </Link>
        <h1 className="page-title">{list?.name ?? 'Campagne'}</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>
        {rows.length} contact{rows.length !== 1 ? 's' : ''}.
        {canWrite && ' Déplacez une carte pour enregistrer une démarche — le statut en découle, jamais l’inverse.'}
      </p>

      {error && (
        <div className="card" style={{ padding: 20, color: 'var(--bad)', fontSize: 14, marginBottom: 16 }}>{error}</div>
      )}

      {rows.length === 0 ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Campagne vide</div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', maxWidth: 420, margin: '0 auto' }}>
            Sélectionnez des contacts depuis l'annuaire et ajoutez-les à cette liste.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {colonnes.map(s => (
            <Colonne
              key={s.code}
              statut={s}
              rows={parStatut(s.code)}
              onOpen={setOuvert}
              onMove={deplacer}
              onDrag={setGlisse}
              onDrop={code => glisse && deplacer(glisse, code)}
              canWrite={canWrite}
            />
          ))}
        </div>
      )}

      {rows.length > 0 && canWrite && (
        <div className="card" style={{ marginTop: 18, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-4)', marginBottom: 8 }}>
            Répartition
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {rows.map(r => (
              <div key={r.contact_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                <span>{r.contact.prenom} {r.contact.nom?.toUpperCase()}</span>
                <select
                  className="field"
                  style={{ fontSize: 12, padding: '2px 5px' }}
                  value={r.assigned_to ?? ''}
                  onChange={e => run(() => assign(r.contact_id, e.target.value), { succes: 'Responsable mis à jour' })}
                >
                  <option value="">personne</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {ouvert && (
        <ContactDrawer
          contact={ouvert}
          lists={lists}
          onClose={() => setOuvert(null)}
          onAddToList={addContactToList}
          onCreateList={createList}
        />
      )}
    </div>
  )
}
