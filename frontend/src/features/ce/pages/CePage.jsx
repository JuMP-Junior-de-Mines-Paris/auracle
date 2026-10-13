import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { useToast } from '../../../shared/components/ToastProvider'
import { Section, Row, Text, Select, Person, Prose, Remove } from '../components/Fields'
import { useCeExport } from '../hooks/useCeExport'
import { useCeGlobals } from '../hooks/useCeGlobals'
import {
  PROSE, TYPES_CLIENT, JEH_MIN, JEH_MAX, aRelire, chargerBrouillon, avecGlobales, completerIntervenants, effacerBrouillon, eur, fusionner,
  initialState, newIntervenant, newPhase, newPointDeControle, onTextEdited, prixHorsFourchette,
  previewTotals, sauverBrouillon, setReviewed,
} from '../lib/ceModel'

export default function CePage() {
  const toast = useToast()
  const globales = useCeGlobals()
  const [s, setS] = useState(() => completerIntervenants(fusionner(initialState(), chargerBrouillon())))
  const { exporting, error, exportDocx, clearError } = useCeExport()

  useEffect(() => { sauverBrouillon(s) }, [s])
  // Les valeurs d'usage du serveur remplacent celles que personne n'a touchées.
  useEffect(() => { if (globales) setS(prev => avecGlobales(prev, globales)) }, [globales])

  const totals = useMemo(() => previewTotals(s), [s])
  const aRevoir = aRelire(s.reviews)

  const set = (key, value) => setS(prev => ({ ...prev, [key]: value }))
  const setIn = (group, key, value) => setS(prev => ({ ...prev, [group]: { ...prev[group], [key]: value } }))
  const setClient = (key, value) => setIn('client', key, value)
  const setList = (key, i, patch) =>
    setS(prev => ({ ...prev, [key]: prev[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
  const addTo = (key, item) => setS(prev => ({ ...prev, [key]: [...prev[key], item] }))
  const removeFrom = (key, i) => setS(prev => ({ ...prev, [key]: prev[key].filter((_, j) => j !== i) }))

  function editProse(path, setter) {
    return value => {
      setter(value)
      setS(prev => ({ ...prev, reviews: onTextEdited(prev.reviews, path) }))
    }
  }
  const review = path => ({
    review: s.reviews[path],
    onReview: ok => setS(prev => ({ ...prev, reviews: setReviewed(prev.reviews, path, ok) })),
  })

  async function generer(brouillon) {
    if (await exportDocx(s, { brouillon })) {
      toast.succes(brouillon ? 'Brouillon téléchargé.' : 'Convention générée et téléchargée.')
    }
  }

  function recommencer() {
    if (!window.confirm('Effacer tout le formulaire et recommencer ?')) return
    effacerBrouillon()
    setS(initialState(new Date(), globales ?? {}))
    clearError()
  }

  return (
    <div className="px-8 py-6 fade-up" style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 className="page-title">Convention d’étude</h1>
        <button type="button" className="btn-ghost" onClick={recommencer}>Nouvelle convention</button>
      </div>
      <p style={{ color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 20 }}>
        Remplissez les champs : le document Word est généré à partir du modèle JuMP. Le formulaire
        est enregistré dans ce navigateur au fil de la saisie.
      </p>

      <Section title="L’étude">
        <Row>
          <Text label="Référence de la convention *" value={s.ref_ce} onChange={v => set('ref_ce', v)} placeholder="CE-2026-014" />
          <Text label="Date de rédaction *" type="date" value={s.date_redaction} onChange={v => set('date_redaction', v)}
            hint="La date de rédaction du document, pas celle de la signature." />
        </Row>
        <Text label="Titre de l’étude *" value={s.reference_etude} onChange={v => set('reference_etude', v)} />
        <Row>
          <Text label="Validité de la convention (mois)" type="number" min="1" value={s.validite_mois} onChange={v => set('validite_mois', v)} />
          <span />
        </Row>
      </Section>

      <Section title="Client">
        <Row>
          <Text label="Société *" value={s.client.societe} onChange={v => setClient('societe', v)} />
          <Select label="Type de client" value={s.client.type_client} onChange={v => setClient('type_client', v)} options={TYPES_CLIENT} />
        </Row>
        <Text label="Adresse du siège" value={s.client.adresse} onChange={v => setClient('adresse', v)} />
        <Row cols={4}>
          <Text label="Code postal" value={s.client.code_postal} onChange={v => setClient('code_postal', v)} />
          <Text label="Ville" value={s.client.ville} onChange={v => setClient('ville', v)} />
          <Text label="Pays" value={s.client.pays} onChange={v => setClient('pays', v)} />
          <Text label="SIRET" value={s.client.siret} onChange={v => setClient('siret', v)} />
        </Row>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Représentant légal (signataire)</h3>
        <Person value={s.client.representant} onChange={v => setClient('representant', v)} />
        <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
          Interlocuteur <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>— facultatif, le représentant sinon</span>
        </h3>
        <Person value={s.client.interlocuteur} onChange={v => setClient('interlocuteur', v)} withFonction={false} />
      </Section>

      <Section title="JuMP">
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          Président signataire : <strong style={{ color: 'var(--ink)' }}>
            {globales ? `${globales.president.prenom} ${globales.president.nom}` : 'défini par JuMP'}
          </strong> (reporté automatiquement dans la convention).
        </p>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Chef de projet</h3>
        <Person value={s.chef_projet} onChange={v => set('chef_projet', v)} withFonction={false} />
        <Row>
          <Text label="Formation" value={s.chef_projet.formation} onChange={v => setIn('chef_projet', 'formation', v)}
            placeholder="Étudiant en deuxième année à l’École des Mines de Paris" />
          <Text label="Fin de mandat" value={s.chef_projet.fin_mandat} onChange={v => setIn('chef_projet', 'fin_mandat', v)}
            placeholder="janvier 2027" hint="Si l’étude va au-delà, un nouveau chef de projet prend le relais. Vide : la phrase est retirée." />
        </Row>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Intervenants</h3>
        {s.intervenants.map((iv, i) => (
          <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <Select label="Civilité" value={iv.titre} onChange={v => setList('intervenants', i, { titre: v })}
                options={[{ value: 'Monsieur', label: 'Monsieur' }, { value: 'Madame', label: 'Madame' }]} />
              <Text label="Prénom *" value={iv.prenom} onChange={v => setList('intervenants', i, { prenom: v })} />
              <Text label="Nom *" value={iv.nom} onChange={v => setList('intervenants', i, { nom: v })} />
              <Remove onClick={() => removeFrom('intervenants', i)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'end' }}>
              <Text label="Année *" value={iv.annee} onChange={v => setList('intervenants', i, { annee: v })} placeholder="deuxième" />
              <Text label="Qualification" value={iv.qualification} onChange={v => setList('intervenants', i, { qualification: v })}
                placeholder="en double diplôme avec l’ENSAE" />
            </div>
          </div>
        ))}
        <div><button type="button" className="btn-ghost" onClick={() => addTo('intervenants', newIntervenant())}><Icon name="plus" size={13} /> Intervenant</button></div>
      </Section>

      <Section title="Contenu">
        {PROSE.map(({ key, label, hint, required }) => (
          <Prose key={key} label={label} hint={hint} required={required} value={s[key]}
            rows={key === 'exemples' ? 3 : 6}
            onChange={editProse(key, v => set(key, v))} {...review(key)} />
        ))}
      </Section>

      <Section title="Méthodologie : phases" aside={<span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{totals.jeh} JEH · {totals.semaines} semaines</span>}>
        {s.phases.map((p, i) => (
          <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px 110px auto', gap: 10, alignItems: 'end' }}>
              <Text label={`Phase ${i + 1} *`} value={p.nom} onChange={v => setList('phases', i, { nom: v })} />
              <Text label="JEH *" type="number" min="1" value={p.jeh} onChange={v => setList('phases', i, { jeh: v })} />
              <Text label="Durée (sem.) *" type="number" min="1" value={p.duree_semaines} onChange={v => setList('phases', i, { duree_semaines: v })} />
              <Text label="Début (sem.)" type="number" min="1" value={p.debut_semaine} onChange={v => setList('phases', i, { debut_semaine: v })} placeholder="auto" />
              <Text label="Prix JEH €" inputMode="decimal" value={p.prix_jeh} onChange={v => setList('phases', i, { prix_jeh: v })} placeholder={s.budget.prix_jeh || 'défaut'} />
              <Remove onClick={() => removeFrom('phases', i)} title="Retirer la phase" />
            </div>
            <Prose label="Description" required rows={3} value={p.description}
              onChange={editProse(`phases.${i}.description`, v => setList('phases', i, { description: v }))}
              {...review(`phases.${i}.description`)} />
          </div>
        ))}
        <div><button type="button" className="btn-ghost" onClick={() => addTo('phases', newPhase())}><Icon name="plus" size={13} /> Phase</button></div>

        <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Points de contrôle et validations client</h3>
        {s.points_controle.map((pc, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px auto', gap: 10, alignItems: 'end' }}>
            <Text label={`Point ${i + 1}`} value={pc.nom} onChange={v => setList('points_controle', i, { nom: v })} placeholder="Rapport intermédiaire" />
            <Text label="Format *" value={pc.format} onChange={v => setList('points_controle', i, { format: v })} placeholder="Word, PowerPoint, code…" />
            <Text label="Requis avant phase" type="number" min="1" value={pc.requis_avant_phase} onChange={v => setList('points_controle', i, { requis_avant_phase: v })} />
            <Remove onClick={() => removeFrom('points_controle', i)} />
          </div>
        ))}
        <div><button type="button" className="btn-ghost" onClick={() => addTo('points_controle', newPointDeControle())}><Icon name="plus" size={13} /> Point de contrôle</button></div>
      </Section>

      <Section title="Budget et paiement">
        <Row cols={3}>
          <Text label="Prix du JEH (€ HT) *" inputMode="decimal" value={s.budget.prix_jeh} onChange={v => setIn('budget', 'prix_jeh', v)}
            hint={`Prix d’usage prérempli, modifiable. Entre ${JEH_MIN} et ${JEH_MAX} € HT ; chaque phase peut avoir le sien.`} />
          <Text label="TVA (%)" inputMode="decimal" value={s.budget.taux_tva} onChange={v => setIn('budget', 'taux_tva', v)} />
          <Select label="Frais annexes" value={s.budget.frais_mode} onChange={v => setIn('budget', 'frais_mode', v)}
            options={[{ value: 'reel', label: 'Facturés au réel' }, { value: 'forfait', label: 'Au forfait' }]} />
        </Row>
        <Row cols={3}>
          <Text label="Acompte à la signature (%)" inputMode="decimal" value={s.paiement.acompte_pct} onChange={v => setIn('paiement', 'acompte_pct', v)} />
          <Text label="Versement intermédiaire (%)" inputMode="decimal" value={s.paiement.intermediaire_pct} onChange={v => setIn('paiement', 'intermediaire_pct', v)}
            hint="0 : pas de versement intermédiaire." />
          <Text label="Livrable qui le déclenche" value={s.paiement.livrable_intermediaire} onChange={v => setIn('paiement', 'livrable_intermediaire', v)} />
        </Row>
        {prixHorsFourchette(s) && (
          <div role="alert" style={{ color: 'var(--bad)', fontSize: 13 }}>
            Un prix de JEH est hors de la fourchette autorisée ({JEH_MIN}–{JEH_MAX} € HT).
          </div>
        )}
        <div style={{ background: 'var(--paper-2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <span>Total HT (somme des phases) <strong>{eur(totals.totalHt)}</strong></span>
          <span>TVA <strong>{eur(totals.tva)}</strong></span>
          <span>Total TTC <strong>{eur(totals.ttc)}</strong></span>
          <span style={{ color: 'var(--ink-3)' }}>Aperçu : le document est calculé par le serveur.</span>
        </div>
      </Section>

      {error && (
        <div role="alert" className="card" style={{ padding: 16, marginBottom: 16, borderColor: 'var(--bad)' }}>
          <strong style={{ color: 'var(--bad)' }}>{error.title}</strong>
          {error.items.length > 0 && (
            <ul style={{ margin: '8px 0 0 18px', fontSize: 13, listStyle: 'disc' }}>
              {error.items.map(item => <li key={item}>{item}</li>)}
            </ul>
          )}
          {error.kind === 'incomplete' && (
            <button type="button" className="btn-ghost" style={{ marginTop: 10 }} onClick={() => generer(true)}>
              Télécharger quand même en brouillon
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', bottom: 0, padding: '12px 0', background: 'var(--paper)' }}>
        <button type="button" className="btn-ember" disabled={exporting || aRevoir.length > 0} onClick={() => generer(false)}
          style={{ opacity: exporting || aRevoir.length > 0 ? 0.6 : 1 }}>
          <Icon name="download" size={14} /> {exporting ? 'Génération…' : 'Générer la convention (.docx)'}
        </button>
        <button type="button" className="btn-ghost" disabled={exporting || aRevoir.length > 0} onClick={() => generer(true)}>Brouillon</button>
        {aRevoir.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--ember-2)' }}>
            {aRevoir.length} texte{aRevoir.length > 1 ? 's' : ''} généré{aRevoir.length > 1 ? 's' : ''} par l’IA à relire avant de générer.
          </span>
        )}
      </div>
    </div>
  )
}
