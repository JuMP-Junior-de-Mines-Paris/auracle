import { Component } from 'react'

/**
 * Filet de dernier recours : une exception dans un composant vidait l'écran
 * sans rien dire. On garde au moins de quoi comprendre et repartir.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Erreur non rattrapée :', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="px-8 py-6">
        <div className="card" style={{ padding: '40px', maxWidth: 560, margin: '40px auto' }}>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
            Cette page n'a pas pu s'afficher
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 20 }}>
            Une erreur inattendue est survenue. Recharger suffit le plus souvent&nbsp;;
            si elle revient, signalez-la au responsable informatique.
          </div>
          <pre
            className="font-mono"
            style={{
              fontSize: 12, color: 'var(--ink-3)', background: 'var(--paper-2)',
              border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px',
              overflowX: 'auto', marginBottom: 20, whiteSpace: 'pre-wrap',
            }}
          >
            {this.state.error?.message ?? String(this.state.error)}
          </pre>
          <button className="btn-ember" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        </div>
      </div>
    )
  }
}
