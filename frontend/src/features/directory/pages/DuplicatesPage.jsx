import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { useDuplicates } from '../hooks/useDuplicates'

const CLE_LABELS = {
  email:     'Même adresse e-mail',
  linkedin:  'Même profil LinkedIn',
  id_profil: 'Même identifiant annuaire',
}

// Nombre de champs renseignés — sert à proposer la fiche la plus complète
// comme maître par défaut.
const CHAMPS = [
  'id_profil', 'prenom', 'nom', 'pays', 'ville', 'annee_obtention_diplome',
  'diplomes', 'entreprise_actuelle', 'titre_poste', 'email', 'telephone',
  'linkedin', 'mpa_profile',
]
const richesse = c => CHAMPS.filter(f => c[f] !== null && c[f] !== undefined && c[f] !== '').length

function Cluster({ cluster, onMerge, canMerge }) {
  const best = [...cluster.contacts].sort((a, b) => richesse(b) - richesse(a))[0]
  const [masterId, setMasterId] = useState(best.id)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function handleMerge() {
    const others = cluster.contacts.filter(c => c.id !== masterId).map(c => c.id)
    if (!others.length) return
    setBusy(true); setErr(null)
    try { await onMerge(masterId, others) }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', background: 'var(--paper-2)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{CLE_LABELS[cluster.cle] ?? cluster.cle}</div>
          <div className="font-mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{cluster.valeur}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{cluster.contacts.length} fiches</span>
          {canMerge && (
            <button className="btn-ember flex items-center gap-1.5" onClick={handleMerge} disabled={busy} style={{ fontSize: 13, opacity: busy ? 0.6 : 1 }}>
              <Icon name="check" size={13} /> {busy ? 'Fusion…' : 'Fusionner'}
            </button>
          )}
        </div>
      </div>

      {err && <div style={{ padding: '8px 16px', background: '#fee2e2', color: '#991b1b', fontSize: 13 }}>{err}</div>}

      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 90 }}>Maître</th>
            <th>Nom</th><th>Entreprise / Poste</th><th>Email</th><th>Téléphone</th>
            <th style={{ width: 80 }}>Champs</th>
          </tr>
        </thead>
        <tbody>
          {cluster.contacts.map(c => (
            <tr key={c.id} style={{ background: c.id === masterId ? 'var(--ember-soft)' : undefined }}>
              <td>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                  <input
                    type="radio"
                    name={`master-${cluster.cle}-${cluster.valeur}`}
                    checked={c.id === masterId}
                    onChange={() => setMasterId(c.id)}
                    style={{ accentColor: 'var(--ember)', cursor: 'pointer' }}
                  />
                  {c.id === masterId ? 'Garder' : ''}
                </label>
              </td>
              <td style={{ fontSize: 13.5, fontWeight: 500 }}>{c.prenom} {c.nom?.toUpperCase()}</td>
              <td style={{ fontSize: 13 }}>
                <div>{c.entreprise_actuelle || '—'}</div>
                {c.titre_poste && <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{c.titre_poste}</div>}
              </td>
              <td style={{ fontSize: 13 }}>{c.email || '—'}</td>
              <td style={{ fontSize: 13 }}>{c.telephone || '—'}</td>
              <td className="font-mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{richesse(c)}/{CHAMPS.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DuplicatesPage() {
  const { clusters, loading, error, merge } = useDuplicates()
  const { can } = usePermissions()
  const canMerge = can('contacts.merge')

  return (
    <div className="px-8 py-6 fade-up">
      <h1 className="page-title" style={{ marginBottom: 4 }}>Doublons</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 22, maxWidth: '72ch' }}>
        Fiches qui partagent une clé forte — même e-mail, même profil LinkedIn ou
        même identifiant annuaire. Ce sont des doublons certains, pas des suspicions.
        La fiche gardée récupère les champs vides, les notes et les appartenances aux
        listes des autres&nbsp;; celles-ci sont ensuite supprimées.
      </p>

      {!canMerge && (
        <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--ink-3)', marginBottom: 18 }}>
          Vous pouvez consulter les doublons, mais la fusion demande la permission
          «&nbsp;Fusionner des doublons&nbsp;».
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Analyse de l'annuaire…</div>
      ) : error ? (
        <div style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</div>
      ) : clusters.length === 0 ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ color: 'var(--ok)', marginBottom: 10 }}><Icon name="check" size={26} /></div>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Aucun doublon</div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', maxWidth: 420, margin: '0 auto' }}>
            L'annuaire est propre sur les trois clés. C'est le moment d'appliquer la
            migration 012, qui pose les contraintes d'unicité et rend le doublon
            impossible.
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 }}>
            {clusters.length} grappe{clusters.length > 1 ? 's' : ''} ·{' '}
            {clusters.reduce((n, c) => n + c.contacts.length - 1, 0)} fiches en trop
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {clusters.map(c => (
              <Cluster key={`${c.cle}-${c.valeur}`} cluster={c} onMerge={merge} canMerge={canMerge} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
