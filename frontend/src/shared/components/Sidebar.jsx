import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faAddressBook,
  faBriefcase,
  faChartBar,
  faGear,
  faList,
  faRightFromBracket,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
import { useAuth } from '../../features/auth/hooks/useAuth'

const NAV_ITEMS = [
  { to: '/annuaire', icon: faAddressBook, label: 'Annuaire', enabled: true },
  { to: '/annuaire/listes', icon: faList, label: 'Listes', enabled: true },
  { to: '/missions', icon: faBriefcase, label: 'Missions', enabled: false },
  { to: '/dashboard', icon: faChartBar, label: 'Dashboard', enabled: false },
  { to: '/settings', icon: faGear, label: 'Paramètres', enabled: false },
]

export default function Sidebar() {
  const [expanded, setExpanded] = useState(() => window.innerWidth >= 1024)
  const { user, role, logout } = useAuth()
  const initials = (user?.email?.[0] ?? 'U').toUpperCase()

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col h-screen bg-white border-r border-slate-200 transition-all duration-200 flex-shrink-0 ${
          expanded ? 'w-56' : 'w-12'
        }`}
      >
        {/* Logo + toggle */}
        <div
          className={`flex items-center h-14 border-b border-slate-100 px-3 ${
            expanded ? 'justify-between' : 'justify-center'
          }`}
        >
          {expanded && (
            <span className="font-bold text-[#005a9f] text-sm tracking-wide select-none">
              JUMP ORACLE
            </span>
          )}
          <button
            className="text-slate-400 hover:text-[#005a9f] transition-colors p-1"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Réduire le menu' : 'Agrandir le menu'}
          >
            <FontAwesomeIcon
              icon={expanded ? faChevronLeft : faChevronRight}
              size="sm"
            />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 overflow-hidden">
          {NAV_ITEMS.map(item =>
            item.enabled ? (
              <NavLink
                key={item.to}
                to={item.to}
                title={!expanded ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg transition-colors text-sm ${
                    isActive
                      ? 'bg-[#005a9f] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  } ${!expanded ? 'justify-center' : ''}`
                }
              >
                <FontAwesomeIcon icon={item.icon} className="w-4 h-4 flex-shrink-0" />
                {expanded && <span>{item.label}</span>}
              </NavLink>
            ) : (
              <div
                key={item.to}
                title={!expanded ? `${item.label} (bientôt)` : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg text-slate-300 cursor-not-allowed text-sm select-none ${
                  !expanded ? 'justify-center' : ''
                }`}
              >
                <FontAwesomeIcon icon={item.icon} className="w-4 h-4 flex-shrink-0" />
                {expanded && (
                  <span className="flex items-center gap-2">
                    {item.label}
                    <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">
                      Bientôt
                    </span>
                  </span>
                )}
              </div>
            )
          )}
        </nav>

        {/* User + logout */}
        <div
          className={`border-t border-slate-100 p-3 flex items-center gap-3 ${
            !expanded ? 'justify-center' : ''
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-[#005a9f] text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {initials}
          </div>
          {expanded && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 truncate">{user?.email}</p>
              <p className="text-xs text-slate-400 capitalize">
                {role?.replace('_', ' ')}
              </p>
            </div>
          )}
          {expanded && (
            <button
              className="text-slate-400 hover:text-red-500 transition-colors"
              onClick={logout}
              title="Déconnexion"
            >
              <FontAwesomeIcon icon={faRightFromBracket} size="sm" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex z-40 safe-area-inset-bottom">
        {NAV_ITEMS.filter(i => i.enabled).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-xs gap-1 ${
                isActive ? 'text-[#005a9f]' : 'text-slate-400'
              }`
            }
          >
            <FontAwesomeIcon icon={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          className="flex-1 flex flex-col items-center py-2 text-xs gap-1 text-slate-400"
          onClick={logout}
        >
          <FontAwesomeIcon icon={faRightFromBracket} />
          <span>Déco.</span>
        </button>
      </nav>
    </>
  )
}
