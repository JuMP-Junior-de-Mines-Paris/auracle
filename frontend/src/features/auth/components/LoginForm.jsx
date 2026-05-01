import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function LoginForm({ onSuccess }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(email, password)
      onSuccess?.()
    } catch {
      setError('Email ou mot de passe incorrect.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-slate-600 mb-1">Email</label>
        <input
          type="email"
          required
          autoComplete="email"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#005a9f] focus:border-transparent"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm text-slate-600 mb-1">Mot de passe</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#005a9f] focus:border-transparent"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#005a9f] text-white py-2.5 rounded-lg hover:bg-[#004a8f] disabled:opacity-50 transition-colors font-medium"
      >
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}
