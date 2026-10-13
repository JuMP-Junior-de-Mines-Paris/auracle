import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useArchives, CATEGORIES, categoryLabel } from '../hooks/useArchives'

const TH = { padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }

function normaliser(t) {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function ArchivesPage() {
  const { archives, loading, error } = useArchives()
  const [categorie, setCategorie] = useState('toutes')
  const [recherche, setRecherche] = useState('')
  const navigate = useNavigate()

  const compte = useMemo(() => {
    const c = { toutes: archives.length }
    for (const a of archives) c[a.category] = (c[a.category] ?? 0) + 1
    return c
  }, [archives])

  const visibles = useMemo(() => {
    const q = normaliser(recherche.trim())
    return archives.filter(a =>
      (categorie === 'toutes' || a.category === categorie)
      && (!q || normaliser(`${a.title} ${a.client_name ?? ''}`).includes(q)))
  }, [archives, categorie, recherche])

  const onglets = [{ value: 'toutes', label: 'Toutes' }, ...CATEGORIES]

  return (
    <div className="px-8 py-6 fade-up">
      <h1 className="page-title" style={{ marginBottom: 6 }}>Archives</h1>
      <p style={{ color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 20 }}>
        Missions rangées, par catégorie. Chaque convention d’étude enregistrée depuis le générateur y
        figure comme une mission.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {onglets.map(o => (
          <button key={o.value} type="button" className={categorie === o.value ? 'btn-ember' : 'btn-ghost'}
            style={{ fontSize: 13 }} aria-pressed={categorie === o.value} onClick={() => setCategorie(o.value)}>
            {o.label} <span style={{ opacity: 0.7 }}>({compte[o.value] ?? 0})</span>
          </button>
        ))}
        <input className="field" style={{ marginLeft: 'auto', maxWidth: 260 }} type="search" value={recherche}
          onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un titre ou un client" aria-label="Rechercher dans les archives" />
      </div>

      {loading ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : error ? (
        <div className="card" role="alert" style={{ padding: 40, textAlign: 'center', color: 'var(--bad)', fontSize: 14 }}>{error}</div>
      ) : visibles.length === 0 ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--ink-3)' }}>
          <Icon name="inbox" size={22} />
          <div style={{ marginTop: 8 }}>{archives.length === 0 ? 'Aucune archive pour le moment.' : 'Aucune archive ne correspond.'}</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Titre', 'Client', 'Catégorie', 'Archivée le'].map(h => <th key={h} style={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibles.map(a => (
                <tr key={a.id} onClick={() => navigate(`/missions/${a.id}`)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--paper-2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500 }}>{a.title}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)' }}>{a.client_name || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: 'var(--paper-2)', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      {categoryLabel(a.category)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)' }}>
                    {a.created_at ? new Date(a.created_at).toLocaleDateString('fr-FR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
