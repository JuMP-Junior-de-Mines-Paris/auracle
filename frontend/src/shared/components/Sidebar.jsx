import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Icon } from '../../shared/lib/icons'
import { roleMeta } from '../../shared/lib/roles'
import { useAuth } from '../../features/auth/hooks/useAuth'
import { usePermissions } from '../../features/auth/hooks/usePermissions'

// Treize entrées au lieu de quatorze : « Mes missions » n'était qu'un filtre
// de Missions et le duplique — Tâches fait déjà cela avec un bouton. La
// liste des membres, elle, existait aussi comme onglet d'Administration ;
// c'est désormais un seul écran, qui laisse éditer le rôle à qui en a le
// droit plutôt que d'avoir deux pages pour vingt-et-une personnes.
const NAV_SECTIONS = [
  {
    title: 'Pilotage',
    items: [
      { to: '/dashboard', icon: 'home',      label: 'Accueil' },
      { to: '/taches',    icon: 'check',     label: 'Tâches' },
      { to: '/missions',  icon: 'briefcase', label: 'Missions' },
      { to: '/archives',  icon: 'inbox',     label: 'Archives' },
      { to: '/carnets',   icon: 'book',      label: 'Carnets' },
      { to: '/conventions', icon: 'edit',   label: 'Conventions' },
    ],
  },
  {
    title: 'Prospection',
    items: [
      { to: '/annuaire',             icon: 'users',    label: 'Annuaire' },
      { to: '/annuaire/segments',    icon: 'filter',   label: 'Segments' },
      { to: '/annuaire/listes',      icon: 'bookmark', label: 'Campagnes' },
      { to: '/annuaire/relances',    icon: 'bell',     label: 'Relances' },
      { to: '/annuaire/progression', icon: 'trending', label: 'Progression' },
    ],
  },
  {
    title: 'Réglages',
    items: [
      { to: '/membres',  icon: 'user',     label: 'Membres' },
      { to: '/settings', icon: 'settings', label: 'Mon profil' },
      { to: '/admin',    icon: 'lock',     label: 'Administration', perm: ['members.set_role', 'permissions.manage', 'audit.read'] },
    ],
  },
]

export default function Sidebar() {
  const [narrow, setNarrow] = useState(false)
  const { user, role, logout } = useAuth()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const initials = (user?.email?.[0] ?? 'U').toUpperCase()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col h-screen sticky top-0 flex-shrink-0 ${narrow ? 'sb-narrow' : ''}`}
        style={{
          width: narrow ? 64 : 240,
          borderRight: '1px solid var(--line)',
          background: 'var(--paper)',
          transition: 'width .2s ease',
        }}
      >
        {/* Brand */}
        <div
          className="flex items-center gap-2.5 px-3 py-3.5 cursor-pointer"
          style={{ borderBottom: '1px solid var(--line)' }}
          onClick={() => setNarrow(v => !v)}
          title={narrow ? 'Agrandir le menu' : 'Réduire le menu'}
        >
          <img src="/jump-logo.png" alt="JuMP" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
          <div className="sb-label flex flex-col leading-tight">
            <span style={{ fontWeight: 500, fontSize: 14, letterSpacing: '-0.01em' }}>Oracle</span>
            <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>JuMP · Mines Paris</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto py-3 px-2" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {NAV_SECTIONS.map(section => (
            <div key={section.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div
                className="sb-section-title px-2 mb-1"
                style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--ink-4)', letterSpacing: '.08em', textTransform: 'uppercase' }}
              >
                {section.title}
              </div>
              {section.items.filter(item => can(item.perm)).map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/annuaire'}
                  title={narrow ? item.label : undefined}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon name={item.icon} size={16} />
                  <span className="sb-label flex-1">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-2 py-2" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="nav-item" style={{ padding: '6px 8px' }}>
            <span
              className="avatar"
              style={{ width: 26, height: 26, background: 'var(--ember)', color: '#fff', fontSize: 11, flexShrink: 0 }}
            >
              {initials}
            </span>
            <div className="sb-footer-text flex-1 flex flex-col leading-tight min-w-0">
              <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                {roleMeta(role).short}
              </span>
            </div>
            <button
              className="sb-footer-text"
              onClick={handleLogout}
              title="Déconnexion"
              style={{ color: 'var(--ink-3)', background: 'transparent', border: 'none', padding: 4, borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
            >
              <Icon name="logout" size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex" style={{ background: '#fffdf8', borderTop: '1px solid var(--line)' }}>
        {NAV_SECTIONS.flatMap(s => s.items).slice(0, 4).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/annuaire'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 gap-1 text-xs ${isActive ? '' : ''}`
            }
            style={({ isActive }) => ({ color: isActive ? 'var(--ember)' : 'var(--ink-3)' })}
          >
            <Icon name={item.icon} size={18} />
            <span style={{ fontSize: 10 }}>{item.label}</span>
          </NavLink>
        ))}
        <button
          className="flex-1 flex flex-col items-center py-2 gap-1"
          style={{ color: 'var(--ink-3)', fontSize: 10, background: 'transparent', border: 'none', cursor: 'pointer' }}
          onClick={handleLogout}
        >
          <Icon name="logout" size={18} />
          <span>Déco.</span>
        </button>
      </nav>
    </>
  )
}
