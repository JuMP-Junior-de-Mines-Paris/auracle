import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const session = { data: { session: { access_token: 'jeton-test' } } }
vi.mock('../../shared/lib/supabase', () => ({
  supabase: { auth: { getSession: () => Promise.resolve(session) } },
}))

import { ToastProvider } from '../../shared/components/ToastProvider'
import CePage from '../../features/ce/pages/CePage'
import { initialState, markGenerated, sauverBrouillon } from '../../features/ce/lib/ceModel'

function monter() {
  return render(<ToastProvider><CePage /></ToastProvider>)
}

const bouton = nom => screen.getByRole('button', { name: nom })
// La page lit aussi /api/ce/globals au chargement : on ne compte que les exports.
const exports = fetchMock => fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/ce/export-docx'))

beforeEach(() => {
  localStorage.clear()
  global.URL.createObjectURL = vi.fn(() => 'blob:x')
  global.URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('Page convention d’étude', () => {
  it('envoie le formulaire à l’API avec le jeton, puis télécharge le document', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'attachment; filename="Convention-d-Etude_CE-1.docx"' },
      blob: () => Promise.resolve(new Blob(['x'])),
    })
    vi.stubGlobal('fetch', fetchMock)
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    monter()
    await userEvent.type(screen.getByLabelText(/Référence de la convention/), 'CE-1')
    await userEvent.click(bouton(/Générer la convention/))

    await waitFor(() => expect(clic).toHaveBeenCalled())
    const [url, init] = exports(fetchMock)[0]
    expect(url).toBe('/api/ce/export-docx')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer jeton-test')
    expect(JSON.parse(init.body).ref_ce).toBe('CE-1')
  })

  it('affiche les sections vides renvoyées par l’API et propose le brouillon', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 422,
      text: () => Promise.resolve(JSON.stringify({ detail: { code: 'incomplete', missing: ['Contexte et problématique'] } })),
    })
    vi.stubGlobal('fetch', fetchMock)

    monter()
    await userEvent.click(bouton(/Générer la convention/))

    expect(await screen.findByText('Des sections obligatoires sont vides.')).toBeInTheDocument()
    expect(screen.getByText('Contexte et problématique')).toBeInTheDocument()

    await userEvent.click(bouton(/Télécharger quand même en brouillon/))
    await waitFor(() => expect(exports(fetchMock)).toHaveLength(2))
    expect(exports(fetchMock)[1][0]).toBe('/api/ce/export-docx?brouillon=true')
  })

  it('bloque la génération tant qu’un texte produit par l’IA n’est pas relu', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const s = initialState()
    s.cdc = 'Texte proposé par le modèle'
    s.reviews = markGenerated({}, 'cdc')
    sauverBrouillon(s)

    monter()
    expect(bouton(/Générer la convention/)).toBeDisabled()
    expect(bouton('Brouillon')).toBeDisabled()
    expect(screen.getByText(/1 texte généré par l’IA à relire/)).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText(/je l’ai relu et je le valide/))
    expect(bouton(/Générer la convention/)).toBeEnabled()
    expect(exports(fetchMock)).toHaveLength(0)
  })

  it('modifier un texte IA déjà relu exige une nouvelle relecture', async () => {
    const s = initialState()
    s.cdc = 'Texte proposé'
    s.reviews = { cdc: { origin: 'ai', reviewed: true } }
    sauverBrouillon(s)

    monter()
    expect(bouton(/Générer la convention/)).toBeEnabled()
    await userEvent.type(screen.getByLabelText(/Cahier des charges détaillé/), ' et un ajout')
    expect(bouton(/Générer la convention/)).toBeDisabled()
  })

  it('reprend le brouillon enregistré dans le navigateur', () => {
    const s = initialState()
    s.reference_etude = 'Étude des batteries'
    sauverBrouillon(s)
    monter()
    expect(screen.getByLabelText(/Titre de l’étude/)).toHaveValue('Étude des batteries')
  })

  it('affiche le budget en direct et alerte sur un JEH hors fourchette', async () => {
    monter()
    const prix = screen.getByLabelText(/Prix du JEH \(€ HT\)/)
    expect(prix).toHaveValue('300')                  // prérempli par les variables globales
    await userEvent.clear(prix)
    await userEvent.type(prix, '500')
    expect(screen.getByRole('alert')).toHaveTextContent('hors de la fourchette')
  })

  it('ajoute et retire des phases', async () => {
    monter()
    await userEvent.click(bouton(/Phase$/))
    expect(screen.getByLabelText(/Phase 2/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Retirer la phase' })[1])
    expect(screen.queryByLabelText(/Phase 2/)).not.toBeInTheDocument()
  })

  it('« Nouvelle convention » vide le formulaire', async () => {
    const s = initialState()
    s.ref_ce = 'CE-9'
    sauverBrouillon(s)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('hors ligne')))

    monter()
    expect(screen.getByLabelText(/Référence de la convention/)).toHaveValue('CE-9')
    await userEvent.click(bouton('Nouvelle convention'))
    expect(screen.getByLabelText(/Référence de la convention/)).toHaveValue('')
  })

  it('affiche le président global et ne l’envoie pas dans le formulaire', async () => {
    const fetchMock = vi.fn(async url => url === '/api/ce/globals'
      ? { ok: true, json: async () => ({ president: { prenom: 'César', nom: 'Colombo' }, taux_tva: '20', validite_mois: 3, acompte_pct: '30', pays: 'France' }) }
      : { ok: true, headers: { get: () => null }, blob: async () => new Blob(['x']) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    monter()
    expect(await screen.findByText('César Colombo')).toBeInTheDocument()
    await userEvent.click(bouton(/Générer la convention/))
    await waitFor(() => expect(exports(fetchMock)).toHaveLength(1))
    expect(JSON.parse(exports(fetchMock)[0][1].body)).not.toHaveProperty('president')
  })

  it('demande le prénom et le nom de chaque intervenant', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('hors ligne')))
    monter()
    expect(screen.getByLabelText('Prénom *')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom *')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Prénom *'), 'Camille')
    expect(screen.getByLabelText('Prénom *')).toHaveValue('Camille')
  })

  it('distingue un backend éteint (500 sans corps) d’un plantage du serveur', async () => {
    const reponse = texte => vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve(texte) })
    vi.stubGlobal('fetch', reponse(''))
    const { unmount } = monter()
    await userEvent.click(bouton(/Générer la convention/))
    expect(await screen.findByText(/Le backend est-il lancé/)).toBeInTheDocument()
    unmount()

    vi.stubGlobal('fetch', reponse('Internal Server Error'))
    monter()
    await userEvent.click(bouton(/Générer la convention/))
    expect(await screen.findByText(/n’a pas pu générer le document/)).toBeInTheDocument()
  })

  it('signale une panne réseau sans planter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    monter()
    await userEvent.click(bouton(/Générer la convention/))
    expect(await screen.findByText(/Connexion au serveur impossible/)).toBeInTheDocument()
  })
})

describe('Archivage de la convention', () => {
  const json = (status, corps) => ({ ok: status < 400, status, text: async () => JSON.stringify(corps) })
  const exportOk = { ok: true, status: 200, headers: { get: () => null }, blob: async () => new Blob(['x']) }
  const sauvegardes = fetchMock => fetchMock.mock.calls.filter(([url]) => url === '/api/ce/save')

  // Un faux backend : chaque route répond à sa façon, tout le reste est une panne.
  function backend({ save = json(200, { ce_id: 'c1', mission_id: 'm1', created: true }) } = {}) {
    const fetchMock = vi.fn(async url => {
      if (url.startsWith('/api/ce/export-docx')) return exportOk
      if (url === '/api/ce/save') return save
      return json(200, {})
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    return fetchMock
  }

  it('« Enregistrer » range la convention dans les archives sans télécharger de document', async () => {
    const fetchMock = backend()
    monter()
    await userEvent.type(screen.getByLabelText(/Référence de la convention/), 'CE-7')
    await userEvent.click(bouton(/Enregistrer/))

    expect(await screen.findByText('Convention enregistrée dans les archives.')).toBeInTheDocument()
    const [url, init] = sauvegardes(fetchMock)[0]
    expect(url).toBe('/api/ce/save')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer jeton-test')
    expect(JSON.parse(init.body).ref_ce).toBe('CE-7')
    expect(exports(fetchMock)).toHaveLength(0)
  })

  it('enregistrer deux fois annonce une mise à jour, pas une nouvelle archive', async () => {
    backend({ save: json(200, { ce_id: 'c1', mission_id: 'm1', created: false }) })
    monter()
    await userEvent.click(bouton(/Enregistrer/))
    expect(await screen.findByText('Convention mise à jour dans les archives.')).toBeInTheDocument()
  })

  it('exporter archive aussi la convention', async () => {
    const fetchMock = backend()
    monter()
    await userEvent.type(screen.getByLabelText(/Référence de la convention/), 'CE-8')
    await userEvent.click(bouton(/Générer la convention/))

    expect(await screen.findByText('Convention générée et téléchargée.')).toBeInTheDocument()
    await waitFor(() => expect(sauvegardes(fetchMock)).toHaveLength(1))
    expect(JSON.parse(sauvegardes(fetchMock)[0][1].body).ref_ce).toBe('CE-8')
    expect(await screen.findByText('Convention enregistrée dans les archives.')).toBeInTheDocument()
  })

  it('un export échoué n’archive rien', async () => {
    const fetchMock = backend()
    fetchMock.mockImplementation(async url => url === '/api/ce/save' ? json(200, {}) : json(422, { detail: { code: 'incomplete', missing: ['Contexte'] } }))
    monter()
    await userEvent.click(bouton(/Générer la convention/))
    await screen.findByText('Des sections obligatoires sont vides.')
    expect(sauvegardes(fetchMock)).toHaveLength(0)
  })

  it('sans le droit de rédiger, l’export reste possible et ne crie pas au refus', async () => {
    backend({ save: json(403, { detail: 'Permission requise : ce.write' }) })
    monter()
    await userEvent.click(bouton(/Générer la convention/))
    expect(await screen.findByText('Convention générée et téléchargée.')).toBeInTheDocument()
    await waitFor(() => expect(bouton(/Enregistrer/)).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/non archivé/)).not.toBeInTheDocument()
  })

  it('« Enregistrer » explique le refus quand le droit manque', async () => {
    backend({ save: json(403, { detail: 'Permission requise : ce.write' }) })
    monter()
    await userEvent.click(bouton(/Enregistrer/))
    expect(await screen.findByRole('alert')).toHaveTextContent('ce.write')
  })

  it('« Enregistrer » liste les champs invalides renvoyés par l’API', async () => {
    backend({ save: json(422, { detail: [{ loc: ['body', 'ref_ce'], type: 'string_too_short', msg: 'x' }] }) })
    monter()
    await userEvent.click(bouton(/Enregistrer/))
    expect(await screen.findByText('Certains champs sont invalides.')).toBeInTheDocument()
    expect(screen.getByText(/Référence : champ obligatoire/)).toBeInTheDocument()
  })

  it('un échec d’archivage après l’export prévient sans retirer le téléchargement', async () => {
    backend({ save: json(503, { detail: { code: 'archive_unavailable', message: 'L’enregistrement dans les archives a échoué.' } }) })
    monter()
    await userEvent.click(bouton(/Générer la convention/))
    expect(await screen.findByText('Convention générée et téléchargée.')).toBeInTheDocument()
    expect(await screen.findByText(/Document téléchargé, mais non archivé/)).toBeInTheDocument()
  })
})
