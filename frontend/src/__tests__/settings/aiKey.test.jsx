import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const session = { data: { session: { access_token: 'jeton-test' } } }
vi.mock('../../shared/lib/supabase', () => ({
  supabase: { auth: { getSession: () => Promise.resolve(session) } },
}))

import { ToastProvider } from '../../shared/components/ToastProvider'
import AiKeyForm from '../../features/settings/components/AiKeyForm'

const CLE = 'AIzaSyD-exemple-de-cle-gemini-0123456789'

function reponse(status, corps) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(corps === undefined ? '' : JSON.stringify(corps)),
  }
}

/** Serveur factice : `routes` associe « METHODE /url » à une réponse. */
function serveur(routes) {
  const fetchMock = vi.fn((url, init = {}) => {
    const cle = `${init.method ?? 'GET'} ${url}`
    if (!(cle in routes)) throw new Error(`appel inattendu : ${cle}`)
    const r = routes[cle]
    return Promise.resolve(typeof r === 'function' ? r(init) : r)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const monter = () => render(<ToastProvider><AiKeyForm /></ToastProvider>)

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.restoreAllMocks())

describe('Clé Gemini dans les paramètres', () => {
  it('propose la saisie quand aucune clé n’est enregistrée, et rappelle que Gemini Pro ne suffit pas', async () => {
    serveur({ 'GET /api/ai-key': reponse(200, { configured: false, hint: null, model: 'm' }) })
    monter()
    expect(await screen.findByLabelText(/Clé d’API Gemini/)).toHaveAttribute('type', 'password')
    expect(screen.getByText(/abonnement Gemini Pro n’inclut pas/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  it('envoie la clé avec le jeton, puis n’en montre que les quatre derniers caractères', async () => {
    const fetchMock = serveur({
      'GET /api/ai-key': reponse(200, { configured: false, hint: null, model: 'm' }),
      'PUT /api/ai-key': reponse(200, { configured: true, hint: CLE.slice(-4), model: 'm', model_ok: true }),
    })
    monter()
    await userEvent.type(await screen.findByLabelText(/Clé d’API Gemini/), `  ${CLE}  `)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Clé enregistrée')).toBeInTheDocument()
    expect(screen.getByText(`•••• ${CLE.slice(-4)}`)).toBeInTheDocument()
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT')
    expect(init.headers.Authorization).toBe('Bearer jeton-test')
    expect(JSON.parse(init.body)).toEqual({ key: CLE })
    // Une fois enregistrée, la clé n'est plus nulle part dans la page.
    expect(document.body.textContent).not.toContain(CLE)
    expect(screen.queryByLabelText(/Clé d’API Gemini/)).not.toBeInTheDocument()
  })

  it('affiche le refus de Google sans effacer ce qui a été saisi', async () => {
    serveur({
      'GET /api/ai-key': reponse(200, { configured: false, hint: null, model: 'm' }),
      'PUT /api/ai-key': reponse(422, { detail: { code: 'ai_key_rejected', message: 'Google refuse cette clé d’API.' } }),
    })
    monter()
    const champ = await screen.findByLabelText(/Clé d’API Gemini/)
    await userEvent.type(champ, CLE)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Google refuse cette clé')
    expect(champ).toHaveValue(CLE)
    expect(screen.queryByText('Clé enregistrée')).not.toBeInTheDocument()
  })

  it('prévient quand le modèle n’est pas ouvert à la clé', async () => {
    serveur({
      'GET /api/ai-key': reponse(200, { configured: false, hint: null, model: 'gemini-x' }),
      'PUT /api/ai-key': reponse(200, { configured: true, hint: 'abcd', model: 'gemini-x', model_ok: false }),
    })
    monter()
    await userEvent.type(await screen.findByLabelText(/Clé d’API Gemini/), CLE)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('gemini-x')
  })

  it('permet de supprimer une clé existante', async () => {
    const fetchMock = serveur({
      'GET /api/ai-key': reponse(200, { configured: true, hint: 'wxyz', model: 'm' }),
      'DELETE /api/ai-key': reponse(204),
    })
    monter()
    expect(await screen.findByText('•••• wxyz')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => expect(screen.queryByText('Clé enregistrée')).not.toBeInTheDocument())
    expect(screen.getByLabelText(/Clé d’API Gemini/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(true)
  })

  it('remplacer une clé garde l’ancienne tant que la nouvelle n’est pas validée', async () => {
    serveur({ 'GET /api/ai-key': reponse(200, { configured: true, hint: 'wxyz', model: 'm' }) })
    monter()
    await userEvent.click(await screen.findByRole('button', { name: 'Remplacer' }))
    expect(screen.getByText('•••• wxyz')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByLabelText(/Clé d’API Gemini/)).not.toBeInTheDocument()
  })

  it('dit que le backend est éteint plutôt que de rester muet', async () => {
    serveur({ 'GET /api/ai-key': reponse(500) })
    monter()
    expect(await screen.findByText(/backend est-il lancé/)).toBeInTheDocument()
  })
})
