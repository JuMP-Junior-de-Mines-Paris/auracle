import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useAction } from '../../../shared/components/ToastProvider'
import { useNotebooks, PORTEES, porteeMeta } from '../hooks/useNotebooks'

function Badge({ visibility }) {
  const p = porteeMeta(visibility)
  return (
    <span style={{ background: p.bg, color: p.fg, borderRadius: 99, padding: '2px 9px', fontSize: 11, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      <Icon name={p.icon} size={10} /> {p.label}
    </span>
  )
}

function Carte({ nb, onOpen }) {
  const auteur = [nb.auteur_prenom, nb.auteur_nom].filter(Boolean).join(' ')
  return (
    <button
      onClick={() => onOpen(nb.id)}
      className="card"
      style={{ padding: 16, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{nb.icon || '📓'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>{nb.title}</div>
          {nb.description && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.4 }}>{nb.description}</div>
          )}
        </div>
        <Badge visibility={nb.visibility} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, color: 'var(--ink-3)', marginTop: 'auto' }}>
        <span><Icon name="edit" size={10} /> {nb.nb_notes} note{nb.nb_notes !== 1 ? 's' : ''}</span>
        <span style={{ color: nb.nb_todos_ouverts > 0 ? 'var(--warn)' : 'var(--ink-3)' }}>
          <Icon name="check" size={10} /> {nb.nb_todos_ouverts} / {nb.nb_todos} à faire
        </span>
        <span style={{ marginLeft: 'auto' }}>
          {auteur && `${auteur} · `}
          {new Date(nb.derniere_activite).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
      </div>
    </button>
  )
}

function Formulaire({ onCreate, onClose }) {
  const [f, setF] = useState({ title: '', description: '', visibility: 'bureau', icon: '📓' })
  const [envoi, setEnvoi] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    if (!f.title.trim() || envoi) return
    setEnvoi(true)
    await onCreate(f)
    setEnvoi(false)
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="field"
          style={{ width: 56, fontSize: 20, textAlign: 'center', padding: '6px 4px' }}
          value={f.icon}
          onChange={e => set('icon', e.target.value.slice(0, 2))}
          aria-label="Emoji"
        />
        <input
          className="field"
          style={{ flex: 1, fontSize: 14 }}
          placeholder="Titre du carnet — « Réunions de bureau », « Passation »…"
          value={f.title}
          onChange={e => set('title', e.target.value)}
          autoFocus
        />
      </div>

      <input
        className="field"
        style={{ fontSize: 13 }}
        placeholder="À quoi sert ce carnet ? (facultatif)"
        value={f.description}
        onChange={e => set('description', e.target.value)}
      />

      <div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>Qui peut le voir</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PORTEES.map(p => (
            <button
              key={p.code}
              type="button"
              onClick={() => set('visibility', p.code)}
              title={p.aide}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5,
                padding: '5px 11px', borderRadius: 99, cursor: 'pointer',
                background: f.visibility === p.code ? p.bg : 'transparent',
                color: f.visibility === p.code ? p.fg : 'var(--ink-3)',
                border: `1px solid ${f.visibility === p.code ? p.fg + '55' : 'var(--line)'}`,
              }}
            >
              <Icon name={p.icon} size={11} /> {p.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6 }}>
          {porteeMeta(f.visibility).aide}. Vous pourrez inviter quelqu'un en plus, carnet par carnet.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn-ember" disabled={!f.title.trim() || envoi}>
          {envoi ? '…' : 'Créer le carnet'}
        </button>
      </div>
    </form>
  )
}

export default function NotebooksPage() {
  const [archives, setArchives] = useState(false)
  const { notebooks, loading, error, create } = useNotebooks({ archived: archives })
  const [nouveau, setNouveau] = useState(false)
  const navigate = useNavigate()
  const run = useAction()

  async function creer(f) {
    const nb = await run(() => create(f), { succes: `Carnet « ${f.title.trim()} » créé` })
    if (nb) { setNouveau(false); navigate(`/carnets/${nb.id}`) }
  }

  return (
    <div className="px-8 py-6 fade-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 className="page-title">Carnets</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={!archives ? 'btn-ember' : 'btn-ghost'} style={{ fontSize: 13 }} onClick={() => setArchives(false)}>Actifs</button>
          <button className={archives ? 'btn-ember' : 'btn-ghost'} style={{ fontSize: 13 }} onClick={() => setArchives(true)}>Archivés</button>
          {!archives && (
            <button className="btn-ember flex items-center gap-1.5" onClick={() => setNouveau(v => !v)}>
              <Icon name="plus" size={13} /> Nouveau carnet
            </button>
          )}
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20, maxWidth: '70ch' }}>
        Des espaces partagés pour les notes et les points à traiter. Ce que vous cochez ici
        remonte dans « Mes tâches » de la personne concernée — un point noté en réunion ne
        dort pas dans un compte rendu.
      </p>

      {nouveau && <Formulaire onCreate={creer} onClose={() => setNouveau(false)} />}

      {loading ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : error ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--bad)', fontSize: 14 }}>{error}</div>
      ) : notebooks.length === 0 ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>📓</div>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>
            {archives ? 'Aucun carnet archivé' : 'Aucun carnet'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', maxWidth: 420, margin: '0 auto' }}>
            {archives
              ? 'Les carnets que vous archivez apparaîtront ici.'
              : 'Créez-en un pour les réunions de bureau, la passation, ou tout sujet qui se suit à plusieurs.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
          {notebooks.map(nb => <Carte key={nb.id} nb={nb} onOpen={id => navigate(`/carnets/${id}`)} />)}
        </div>
      )}
    </div>
  )
}
