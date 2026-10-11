import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { statusMeta } from '../../../shared/lib/prospect'
import { useAuth } from '../../auth/hooks/useAuth'
import { useDashboard } from '../hooks/useDashboard'
import { StatusBadge } from '../../missions/pages/MissionsPage'

function Bloc({ titre, compte, alerte, lien, lienTexte, vide, children }) {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7 }}>
          {titre}
          {compte > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '1px 7px',
              background: alerte ? '#fee2e2' : 'var(--paper-2)',
              color: alerte ? 'var(--bad)' : 'var(--ink-3)',
            }}>
              {compte}
            </span>
          )}
        </div>
        {lien && <Link to={lien} style={{ fontSize: 12, color: 'var(--ember)', textDecoration: 'none' }}>{lienTexte} →</Link>}
      </div>
      {/* `??` ne retombe que sur null/undefined : un enfant conditionnel
          vaut `false`, et l'état vide n'était alors jamais rendu. */}
      {children || <div style={{ fontSize: 12.5, color: 'var(--ink-4)', padding: '6px 0' }}>{vide}</div>}
    </div>
  )
}

function Ligne({ titre, detail, date, alerte, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '7px 9px', borderRadius: 8, cursor: 'pointer',
        background: 'var(--paper-2)', border: '1px solid var(--line)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</div>
        {detail && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{detail}</div>}
      </div>
      {date && (
        <span style={{ fontSize: 11.5, color: alerte ? 'var(--bad)' : 'var(--ink-3)', flexShrink: 0, fontWeight: alerte ? 600 : 400 }}>
          {new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
      )}
    </button>
  )
}

/** Premier écran d'un membre qui n'a encore rien à faire. */
function Demarrer({ equipe }) {
  const total = equipe?.contacts_total ?? 0
  const etapes = [
    { to: '/annuaire/segments', icon: 'filter', titre: 'Découper l\'annuaire',
      texte: `${total.toLocaleString('fr-FR')} fiches. Choisissez un critère — une promotion, un secteur — pour en tirer une liste de travail d'une trentaine de noms.` },
    { to: '/annuaire/listes', icon: 'bookmark', titre: 'En faire une campagne',
      texte: 'Versez le segment dans une liste : chaque contact y reçoit son propre état, et vous suivez l\'avancement par colonne.' },
    { to: '/annuaire', icon: 'send', titre: 'Démarcher et le noter',
      texte: 'Après chaque prise de contact, enregistrez la démarche. Le statut en découle, et personne ne re-démarche la même personne.' },
  ]

  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Par où commencer</div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 18, maxWidth: '68ch' }}>
        Rien ne vous attend encore. La prospection se déroule en trois temps&nbsp;— le premier
        est de choisir qui contacter, pas de contacter.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        {etapes.map((e, i) => (
          <Link key={e.to} to={e.to} className="card"
                style={{ padding: 14, textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{i + 1}</span>
              <span style={{ color: 'var(--ember)', display: 'flex' }}><Icon name={e.icon} size={14} /></span>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{e.titre}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>{e.texte}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { moi, equipe, enRetard, premierJour, loading, error } = useDashboard()
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]

  if (loading) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>

  const rien = moi.relances.length === 0 && moi.taches.length === 0 && moi.missions.length === 0
  const heure = new Date().getHours()
  const salut = heure < 18 ? 'Bonjour' : 'Bonsoir'
  // « leah.toledano@… » → « Leah » : mieux qu'une adresse entière en titre.
  const brut = user?.email?.split('@')[0]?.split('.')[0] ?? ''
  const prenom = brut ? brut[0].toUpperCase() + brut.slice(1) : ''

  return (
    <div className="px-8 py-6 fade-up">
      <h1 className="page-title" style={{ marginBottom: 4 }}>
        {salut}{prenom ? `, ${prenom}` : ''}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>
        {enRetard.relances + enRetard.taches > 0
          ? <>Vous avez <b style={{ color: 'var(--bad)' }}>{enRetard.relances + enRetard.taches} chose{enRetard.relances + enRetard.taches > 1 ? 's' : ''} en retard</b>.</>
          : rien ? 'Rien ne vous attend aujourd’hui.' : 'Voici ce qui vous attend.'}
      </p>

      {error && (
        <div className="card" style={{ padding: 16, color: 'var(--bad)', fontSize: 13.5, marginBottom: 14 }}>{error}</div>
      )}

      {premierJour && rien && (
        <div style={{ marginBottom: 16 }}><Demarrer equipe={equipe} /></div>
      )}

      {/* Ce qui m'attend, avant ce que fait l'équipe. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 16 }}>
        <Bloc
          titre="Mes relances" compte={moi.relances.length} alerte={enRetard.relances > 0}
          lien="/annuaire/relances" lienTexte="Toutes"
          vide="Aucune relance due. Elles se planifient en enregistrant une démarche."
        >
          {moi.relances.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {moi.relances.map(r => (
                <Ligne key={r.id} titre={`${r.prenom} ${r.nom?.toUpperCase() ?? ''}`}
                       detail={r.entreprise_actuelle} date={r.next_action_at}
                       alerte={r.next_action_at < today}
                       onClick={() => navigate('/annuaire/relances')} />
              ))}
            </div>
          )}
        </Bloc>

        <Bloc
          titre="Mes tâches" compte={moi.taches.length} alerte={enRetard.taches > 0}
          lien="/taches" lienTexte="Toutes"
          vide="Rien à faire. Les points pris en réunion arrivent ici."
        >
          {moi.taches.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {moi.taches.map(t => (
                <Ligne key={t.id} titre={t.title}
                       detail={t.mission?.title ?? t.notebook?.title}
                       date={t.due_date} alerte={t.due_date && t.due_date < today}
                       onClick={() => navigate('/taches')} />
              ))}
            </div>
          )}
        </Bloc>

        <Bloc
          titre="Mes missions" compte={moi.missions.length}
          lien="/missions" lienTexte="Toutes"
          vide="Vous n’êtes chef de projet d’aucune mission."
        >
          {moi.missions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {moi.missions.map(m => (
                <button key={m.id} onClick={() => navigate(`/missions/${m.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                                 padding: '7px 9px', borderRadius: 8, cursor: 'pointer',
                                 background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{m.title}</span>
                  <StatusBadge status={m.status} />
                </button>
              ))}
            </div>
          )}
        </Bloc>
      </div>

      {/* Là où en est l'équipe — après soi, jamais à la place. */}
      {equipe && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>La prospection de l’équipe</div>
            <Link to="/annuaire/progression" style={{ fontSize: 12, color: 'var(--ember)', textDecoration: 'none' }}>
              Progression →
            </Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {(equipe.contacts_touches ?? 0).toLocaleString('fr-FR')}
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              / {(equipe.contacts_total ?? 0).toLocaleString('fr-FR')} contacts démarchés
              {' · '}{equipe.demarches_30j ?? 0} démarche{(equipe.demarches_30j ?? 0) !== 1 ? 's' : ''} sur 30 jours
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--paper-2)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max((equipe.contacts_touches ?? 0) > 0 ? 0.6 : 0,
                                 ((equipe.contacts_touches ?? 0) / Math.max(1, equipe.contacts_total ?? 1)) * 100)}%`,
              height: '100%', background: 'var(--ember)', borderRadius: 99,
            }} />
          </div>

          <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap', fontSize: 12.5 }}>
            <span style={{ color: 'var(--ink-3)' }}>
              <b style={{ color: 'var(--ink)' }}>{equipe.en_discussion ?? 0}</b> en discussion
            </span>
            <span style={{ color: 'var(--ink-3)' }}>
              <span style={{ color: 'var(--ok)' }}><Icon name="check" size={11} /></span>{' '}
              <b style={{ color: 'var(--ink)' }}>{equipe.convertis ?? 0}</b> convertis
            </span>
            {(equipe.relances_en_retard ?? 0) > 0 && (
              <span style={{ color: 'var(--bad)' }}>
                <b>{equipe.relances_en_retard}</b> relance{equipe.relances_en_retard > 1 ? 's' : ''} en retard dans l’équipe
              </span>
            )}
            <span style={{ color: 'var(--ink-4)', marginLeft: 'auto' }}>
              {equipe.membres_actifs_30j ?? 0} membre{(equipe.membres_actifs_30j ?? 0) !== 1 ? 's' : ''} actif{(equipe.membres_actifs_30j ?? 0) !== 1 ? 's' : ''} ce mois
            </span>
          </div>
        </div>
      )}

      {/* Le statut d'un contact n'a de sens qu'ici, en rappel discret. */}
      {!premierJour && rien && (
        <div style={{ fontSize: 12.5, color: 'var(--ink-4)', marginTop: 14, textAlign: 'center' }}>
          Pour reprendre la prospection, ouvrez{' '}
          <Link to="/annuaire/segments" style={{ color: 'var(--ember)' }}>les segments</Link>{' '}
          et tirez-en une liste de travail.
        </div>
      )}
    </div>
  )
}
