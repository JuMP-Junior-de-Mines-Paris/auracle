import { useState, Fragment } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { roleMeta, GROUPES } from '../../../shared/lib/roles'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { usePermissionMatrix, useMemberAdmin, useAuditLog } from '../hooks/useAdmin'

const TABS = [
  { id: 'membres',     label: 'Membres',     perm: null },
  { id: 'permissions', label: 'Permissions', perm: 'permissions.manage' },
  { id: 'journal',     label: 'Journal',     perm: 'audit.read' },
]

function Banner({ text, onDismiss }) {
  if (!text) return null
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b',
        borderRadius: 10, padding: '10px 14px', fontSize: 13.5, marginBottom: 16,
      }}
    >
      <span>{text}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}>
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}

function MembersTab({ onError }) {
  const { members, loading, setRole } = useMemberAdmin()
  const { roles } = usePermissionMatrix()
  const { can } = usePermissions()
  const maySetRole = can('members.set_role')
  const [busy, setBusy] = useState(null)

  async function handleRole(memberId, roleCode) {
    setBusy(memberId)
    try { await setRole(memberId, roleCode) }
    catch (e) { onError(e.message) }
    finally { setBusy(null) }
  }

  if (loading) return <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>

  return (
    <div className="card overflow-hidden">
      <table className="tbl">
        <thead>
          <tr><th>Membre</th><th>Email</th><th style={{ width: 230 }}>Rôle</th><th style={{ width: 130 }}>Cercle</th></tr>
        </thead>
        <tbody>
          {members.map(m => {
            const meta = roleMeta(m.role)
            return (
              <tr key={m.id}>
                <td style={{ fontWeight: 500, fontSize: 13.5 }}>
                  {m.prenom || m.nom
                    ? <>{m.prenom} {m.nom?.toUpperCase()}</>
                    : <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>Nom non renseigné</span>}
                </td>
                <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>{m.email ?? '—'}</td>
                <td>
                  {maySetRole ? (
                    <select
                      className="field"
                      style={{ fontSize: 13, padding: '5px 8px' }}
                      value={m.role ?? ''}
                      disabled={busy === m.id}
                      onChange={e => handleRole(m.id, e.target.value)}
                    >
                      {roles.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                  ) : (
                    <span style={{ background: meta.bg, color: meta.fg, borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>
                      {meta.short}
                    </span>
                  )}
                </td>
                <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {GROUPES[meta.groupe]?.label ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PermissionsTab({ onError }) {
  const { roles, permissions, holds, toggle, loading } = usePermissionMatrix()
  const [busy, setBusy] = useState(null)

  async function handleToggle(roleCode, permCode) {
    setBusy(`${roleCode}::${permCode}`)
    try { await toggle(roleCode, permCode) }
    catch (e) { onError(e.message) }
    finally { setBusy(null) }
  }

  if (loading) return <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>

  // Les permissions groupées par catégorie, dans l'ordre renvoyé par la base.
  const categories = []
  for (const p of permissions) {
    let c = categories.find(x => x.name === p.category)
    if (!c) { c = { name: p.category, items: [] }; categories.push(c) }
    c.items.push(p)
  }

  return (
    <>
      <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 16, maxWidth: '70ch' }}>
        Cocher une case change immédiatement ce que les politiques de la base autorisent.
        « Tous les droits » est un joker&nbsp;: le rôle qui le détient a tout le reste,
        même décoché.
      </p>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 14px', position: 'sticky', left: 0, background: 'var(--paper-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', fontWeight: 500 }}>
                Permission
              </th>
              {roles.map(r => (
                <th key={r.code} title={r.label}
                    style={{ padding: '10px 6px', fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 500, minWidth: 62, background: 'var(--paper-2)' }}>
                  {roleMeta(r.code).short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              // Fragment nommé : la syntaxe <> ne peut pas porter de clé, et
              // React en réclame une par élément de liste.
              <Fragment key={cat.name}>
                <tr>
                  <td colSpan={roles.length + 1}
                      className="font-mono"
                      style={{ background: 'var(--paper-3)', padding: '6px 14px', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                    {cat.name}
                  </td>
                </tr>
                {cat.items.map(p => (
                  <tr key={p.code} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 14px', position: 'sticky', left: 0, background: 'var(--paper)' }}>
                      <div>{p.label}</div>
                      <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{p.code}</div>
                    </td>
                    {roles.map(r => {
                      const on = holds(r.code, p.code)
                      const inherited = !on && p.code !== 'admin.full' && holds(r.code, 'admin.full')
                      const k = `${r.code}::${p.code}`
                      return (
                        <td key={k} style={{ textAlign: 'center', padding: '8px 6px' }}>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={busy === k}
                            title={inherited ? 'Hérité de « tous les droits »' : undefined}
                            onChange={() => handleToggle(r.code, p.code)}
                            style={{
                              width: 15, height: 15, cursor: 'pointer',
                              accentColor: 'var(--ember)',
                              opacity: inherited ? 0.35 : 1,
                            }}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const TABLE_LABELS = {
  contacts: 'Contacts', missions: 'Missions', profiles: 'Membres',
  prospecting_lists: 'Listes', role_permissions: 'Permissions',
}
const ACTION_LABELS = { INSERT: 'création', UPDATE: 'modification', DELETE: 'suppression' }

function JournalTab() {
  const { entries, loading, error, table, setTable } = useAuditLog()

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={table === '' ? 'btn-ember' : 'btn-ghost'} style={{ fontSize: 13 }} onClick={() => setTable('')}>Tout</button>
        {Object.entries(TABLE_LABELS).map(([k, label]) => (
          <button key={k} className={table === k ? 'btn-ember' : 'btn-ghost'} style={{ fontSize: 13 }} onClick={() => setTable(k)}>{label}</button>
        ))}
      </div>

      {loading ? <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
       : error ? <div style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</div>
       : entries.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          Aucune activité enregistrée pour ce filtre.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map(e => {
            const who = e.actor_profile
              ? `${e.actor_profile.prenom ?? ''} ${e.actor_profile.nom ?? ''}`.trim() || e.actor_profile.email
              : 'Système'
            const titre = e.changed?.titre
            const champs = Object.keys(e.changed ?? {}).filter(k => k !== 'titre')
            return (
              <div key={e.id} className="card" style={{ padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink-4)', minWidth: 118 }}>
                  {new Date(e.occurred_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontSize: 13 }}>
                  <b>{who}</b>
                  {' — '}{ACTION_LABELS[e.action] ?? e.action}
                  {' · '}<span style={{ color: 'var(--ink-3)' }}>{TABLE_LABELS[e.table_name] ?? e.table_name}</span>
                  {titre ? <> · <i>{titre}</i></> : null}
                </span>
                {champs.length > 0 && (
                  <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    {champs.slice(0, 4).join(', ')}{champs.length > 4 ? ` +${champs.length - 4}` : ''}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function AdminPage() {
  const { can } = usePermissions()
  const visible = TABS.filter(t => !t.perm || can(t.perm))
  const [tab, setTab] = useState(visible[0]?.id ?? 'membres')
  const [err, setErr] = useState(null)

  return (
    <div className="px-8 py-6 fade-up">
      <h1 className="page-title" style={{ marginBottom: 4 }}>Administration</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 22 }}>
        Rôles, permissions et activité de l'outil.
      </p>

      <Banner text={err} onDismiss={() => setErr(null)} />

      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 22 }}>
        {visible.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer',
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-3)',
              borderBottom: tab === t.id ? '2px solid var(--ink)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'membres'     && <MembersTab onError={setErr} />}
      {tab === 'permissions' && <PermissionsTab onError={setErr} />}
      {tab === 'journal'     && <JournalTab />}
    </div>
  )
}
