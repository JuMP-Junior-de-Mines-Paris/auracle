import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Icon } from '../../../shared/lib/icons'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/annuaire')
    } catch {
      setError('Email ou mot de passe incorrect.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 relative overflow-hidden">
      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative">
        <div className="flex items-center gap-3">
          <img src="/jump-logo.png" alt="JuMP" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div>
            <div className="font-medium" style={{ fontSize: 15, letterSpacing: '-0.01em' }}>Oracle</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>JuMP · Mines Paris</div>
          </div>
        </div>

        <div style={{ maxWidth: 460 }}>
          <div className="font-serif" style={{ fontSize: 60, lineHeight: 1.05, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            L'organisation<br />
            de la <em style={{ color: 'var(--ember)' }}>Junior</em>,<br />
            au même endroit.
          </div>
          <p style={{ marginTop: 24, fontSize: 15, color: 'var(--ink-2)', maxWidth: 420, lineHeight: 1.55 }}>
            Annuaire, prospection, missions et planning — un outil interne pour piloter chaque mission de bout en bout.
          </p>
          <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 24, fontSize: 13, color: 'var(--ink-3)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--ok)', display: 'inline-block' }} />
              Accès sécurisé
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--ember)', display: 'inline-block' }} />
              Missions actives
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--jump)', display: 'inline-block' }} />
              Annuaire contacts
            </span>
          </div>
        </div>

        <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--ink-3)' }}>
          <span>© 2026 — Junior de Mines Paris</span>
          <span className="font-mono">v1.0.0-beta</span>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6 lg:p-12 relative">
        <div style={{ width: '100%', maxWidth: 420 }}>
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <img src="/jump-logo.png" alt="JuMP" style={{ width: 32, height: 32, objectFit: 'contain' }} />
            <div className="font-medium">Oracle</div>
          </div>

          <div style={{ marginBottom: 32 }}>
            <h1 className="font-serif" style={{ fontSize: 42, lineHeight: 1.05 }}>Bon retour.</h1>
            <p style={{ marginTop: 8, fontSize: 14, color: 'var(--ink-3)' }}>
              Connectez-vous avec vos identifiants JuMP.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>Email</label>
              <input
                className="field ring-ember"
                type="email"
                required
                autoComplete="email"
                placeholder="prenom.nom@jump.minesparis.psl.eu"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>Mot de passe</label>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  Oublié ? <span style={{ color: 'var(--ember)' }}>contactez l'admin</span>
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  className="field ring-ember"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: 40 }}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: 6, borderRadius: 6, color: 'var(--ink-3)', background: 'transparent', border: 'none' }}
                  aria-label="Afficher le mot de passe"
                >
                  <Icon name={showPw ? 'eyeOff' : 'eye'} size={16} />
                </button>
              </div>
            </div>

            {error && (
              <p style={{ fontSize: 13, color: 'var(--bad)', margin: 0 }}>{error}</p>
            )}

            <button
              type="submit"
              className="btn-ember"
              style={{ marginTop: 8, padding: '11px 16px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} className="spin" />
                  Connexion…
                </>
              ) : (
                <>Se connecter <Icon name="arrowR" size={15} /></>
              )}
            </button>

            <div className="dotted-x" style={{ margin: '4px 0' }} />

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 10, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
              <div style={{ color: 'var(--ember)', marginTop: 1 }}>
                <Icon name="lock" size={15} />
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                Les mots de passe sont générés et distribués par l'administrateur. Vous ne pouvez pas le changer depuis l'interface.
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
