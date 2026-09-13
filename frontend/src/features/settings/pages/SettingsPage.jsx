import { useState, useEffect } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'
import { roleMeta, GROUPES } from '../../../shared/lib/roles'
import { useAction } from '../../../shared/components/ToastProvider'
import { useAuth } from '../../auth/hooks/useAuth'
import { usePermissions } from '../../auth/hooks/usePermissions'

function Bloc({ titre, children, aide }) {
  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{titre}</div>
        {aide && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3 }}>{aide}</div>}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const { user, role } = useAuth()
  const { permissions } = usePermissions()
  const run = useAction()

  const [form, setForm] = useState({ prenom: '', nom: '' })
  const [initial, setInitial] = useState({ prenom: '', nom: '' })
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('prenom, nom').eq('id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) setErreur(describeError(error))
        const v = { prenom: data?.prenom ?? '', nom: data?.nom ?? '' }
        setForm(v); setInitial(v); setChargement(false)
      })
  }, [user])

  const modifie = form.prenom !== initial.prenom || form.nom !== initial.nom

  async function enregistrer(e) {
    e.preventDefault()
    setEnvoi(true)
    const ok = await run(async () => {
      const { error } = await supabase.from('profiles')
        .update({ prenom: form.prenom.trim(), nom: form.nom.trim() })
        .eq('id', user.id)
      if (error) throw new Error(describeError(error))
      return true
    }, { succes: 'Profil enregistré' })
    if (ok) setInitial({ prenom: form.prenom.trim(), nom: form.nom.trim() })
    setEnvoi(false)
  }

  const meta = roleMeta(role)
  const detenues = [...permissions].sort()

  return (
    <div className="px-8 py-6 fade-up" style={{ maxWidth: 640 }}>
      <h1 className="page-title" style={{ marginBottom: 4 }}>Paramètres</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 22 }}>
        Votre fiche et vos droits.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Bloc titre="Identité" aide="Ce que les autres membres voient de vous dans l'application.">
          {chargement ? (
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Chargement…</div>
          ) : (
            <form onSubmit={enregistrer} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {erreur && <div style={{ fontSize: 13, color: 'var(--bad)' }}>{erreur}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  Prénom
                  <input className="field" style={{ marginTop: 4, fontSize: 13 }}
                         value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  Nom
                  <input className="field" style={{ marginTop: 4, fontSize: 13 }}
                         value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn-ember" disabled={!modifie || envoi}
                        style={{ opacity: (!modifie || envoi) ? 0.5 : 1 }}>
                  {envoi ? '…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          )}
        </Bloc>

        <Bloc titre="Compte">
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 13 }}>
            <span style={{ color: 'var(--ink-3)' }}>Adresse</span>
            <span>{user?.email}</span>
            <span style={{ color: 'var(--ink-3)' }}>Rôle</span>
            <span>
              <span style={{ background: meta.bg, color: meta.fg, borderRadius: 99, padding: '2px 9px', fontSize: 12, fontWeight: 500 }}>
                {meta.label}
              </span>
            </span>
            <span style={{ color: 'var(--ink-3)' }}>Cercle</span>
            <span>{GROUPES[meta.groupe]?.label ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: 'var(--ink-3)' }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="lock" size={13} /></span>
            <span>
              Le rôle et le mot de passe sont gérés par le bureau&nbsp;: vous ne pouvez pas les
              changer ici, et la base le refuserait de toute façon.
            </span>
          </div>
        </Bloc>

        <Bloc titre="Vos droits" aide={`${detenues.length} permission${detenues.length !== 1 ? 's' : ''} attachée${detenues.length !== 1 ? 's' : ''} à votre rôle.`}>
          {detenues.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--bad)' }}>
              Aucune permission. Signalez-le au bureau&nbsp;: votre compte est probablement
              incomplet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detenues.map(p => (
                <span key={p} className="font-mono"
                      style={{ fontSize: 11, background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 7px', color: 'var(--ink-2)' }}>
                  {p}
                </span>
              ))}
            </div>
          )}
        </Bloc>
      </div>
    </div>
  )
}
