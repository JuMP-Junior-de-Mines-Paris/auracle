import { createContext, useContext, useCallback, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../lib/icons'

const ToastContext = createContext(null)

const TONS = {
  succes: { bg: '#dcfce7', line: '#86efac', fg: '#14532d', icon: 'check' },
  erreur: { bg: '#fee2e2', line: '#fca5a5', fg: '#991b1b', icon: 'x' },
  info:   { bg: 'var(--ember-soft)', line: '#c2d9ef', fg: 'var(--ember-2)', icon: 'zap' },
}

/**
 * Retours d'action, en un seul endroit.
 *
 * Jusqu'ici un état `toast` local vivait dans DirectoryPage et nulle part
 * ailleurs : partout ailleurs, une action réussissait ou échouait sans le
 * moindre signe (F-18). Depuis que les permissions existent, un refus
 * silencieux est indiscernable d'un bug.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const suivant = useRef(0)

  const fermer = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const pousser = useCallback((message, ton = 'info', { duree = 4000 } = {}) => {
    const id = ++suivant.current
    setToasts(prev => [...prev, { id, message, ton }])
    // Une erreur reste jusqu'à ce qu'on la ferme : elle demande une action,
    // pas un clin d'œil.
    if (ton !== 'erreur') setTimeout(() => fermer(id), duree)
    return id
  }, [fermer])

  const api = {
    toast: pousser,
    succes: (m, o) => pousser(m, 'succes', o),
    erreur: (m, o) => pousser(m, 'erreur', o),
    info: (m, o) => pousser(m, 'info', o),
    fermer,
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 100,
            display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400,
          }}
        >
          {toasts.map(t => {
            const s = TONS[t.ton] ?? TONS.info
            return (
              <div
                key={t.id}
                className="fade-up"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  background: s.bg, border: `1px solid ${s.line}`, color: s.fg,
                  borderRadius: 10, padding: '10px 14px', fontSize: 13.5,
                  boxShadow: '0 4px 16px rgba(26,22,20,.12)',
                }}
              >
                <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name={s.icon} size={14} /></span>
                <span style={{ flex: 1, lineHeight: 1.45 }}>{t.message}</span>
                <button
                  onClick={() => fermer(t.id)}
                  aria-label="Fermer"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2, flexShrink: 0, opacity: .6 }}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

/**
 * Exécute une action et annonce son issue.
 *
 *   await run(() => supprimer(id), { succes: 'Contact supprimé' })
 *
 * Renvoie le résultat, ou undefined si ça a échoué — l'appelant n'a donc
 * pas à écrire le try/catch qu'on finit toujours par oublier.
 */
export function useAction() {
  const { succes, erreur } = useToast()
  return useCallback(async (fn, messages = {}) => {
    try {
      const r = await fn()
      if (messages.succes) succes(messages.succes)
      return r
    } catch (e) {
      erreur(messages.erreur ?? e.message ?? 'Une erreur est survenue')
      return undefined
    }
  }, [succes, erreur])
}
