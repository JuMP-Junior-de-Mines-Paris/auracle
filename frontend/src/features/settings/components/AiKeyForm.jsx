import { useState } from 'react'
import { useAction, useToast } from '../../../shared/components/ToastProvider'
import { useAiKey } from '../hooks/useAiKey'

const LIEN = 'https://aistudio.google.com/apikey'

/**
 * Saisie de la clé Gemini du membre. Elle sert à rédiger les textes d'une
 * convention d'étude : chacun consomme son propre quota Google.
 */
export default function AiKeyForm() {
  const { chargement, configured, hint, model, erreur, enregistrer, supprimer } = useAiKey()
  const run = useAction()
  const { succes } = useToast()
  const [saisie, setSaisie] = useState('')
  const [edition, setEdition] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [refus, setRefus] = useState(null)
  const [modeleFerme, setModeleFerme] = useState(false)

  if (chargement) return <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Chargement…</div>

  const montrerSaisie = !configured || edition

  async function valider(e) {
    e.preventDefault()
    setEnvoi(true)
    setRefus(null)
    const r = await enregistrer(saisie.trim())
    setEnvoi(false)
    if (!r.ok) { setRefus(r.message); return }
    setSaisie('')
    setEdition(false)
    setModeleFerme(r.modelOk === false)
    succes('Clé Gemini enregistrée')
  }

  async function retirer() {
    await run(async () => {
      const r = await supprimer()
      if (!r.ok) throw new Error(r.message)
      setEdition(false)
      setModeleFerme(false)
    }, { succes: 'Clé supprimée' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {erreur && <div style={{ fontSize: 13, color: 'var(--bad)' }}>{erreur}</div>}

      {configured && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={{ background: '#dcfce7', color: '#14532d', borderRadius: 99, padding: '2px 9px', fontSize: 12, fontWeight: 500 }}>
            Clé enregistrée
          </span>
          <span className="font-mono" style={{ color: 'var(--ink-2)' }}>•••• {hint}</span>
          {!edition && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button type="button" className="btn-ghost" onClick={() => setEdition(true)}>Remplacer</button>
              <button type="button" className="btn-ghost" onClick={retirer}>Supprimer</button>
            </span>
          )}
        </div>
      )}

      {modeleFerme && (
        <div role="alert" style={{ fontSize: 12.5, color: 'var(--bad)' }}>
          Clé valide, mais le modèle «&nbsp;{model}&nbsp;» n’est pas ouvert à votre compte&nbsp;: la rédaction
          échouera. Prévenez le bureau.
        </div>
      )}

      {montrerSaisie && (
        <form onSubmit={valider} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            Clé d’API Gemini
            <input
              className="field font-mono" style={{ marginTop: 4, fontSize: 13 }}
              type="password" autoComplete="off" spellCheck={false}
              placeholder="AIza…"
              value={saisie} onChange={e => { setSaisie(e.target.value); setRefus(null) }}
            />
          </label>
          {refus && <div role="alert" style={{ fontSize: 12.5, color: 'var(--bad)' }}>{refus}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            {configured && (
              <button type="button" className="btn-ghost" onClick={() => { setEdition(false); setSaisie(''); setRefus(null) }}>
                Annuler
              </button>
            )}
            <button type="submit" className="btn-ember" disabled={!saisie.trim() || envoi}>
              {envoi ? 'Vérification…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
        <div>
          <strong style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Où la trouver&nbsp;?</strong> Sur{' '}
          <a href={LIEN} target="_blank" rel="noreferrer" style={{ color: 'var(--ember-2)' }}>aistudio.google.com/apikey</a>,
          avec votre compte Google, puis «&nbsp;Créer une clé API&nbsp;».
        </div>
        <div style={{ marginTop: 6 }}>
          Un abonnement Gemini Pro n’inclut pas de clé d’API&nbsp;: la clé est gratuite mais à part, avec ses propres
          limites. Elle est chiffrée sur le serveur et n’est jamais réaffichée.
        </div>
        <div style={{ marginTop: 6 }}>
          Vos notes sont envoyées à Google sans le nom du client ni ses coordonnées.
        </div>
      </div>
    </div>
  )
}
