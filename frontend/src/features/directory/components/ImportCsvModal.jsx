import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../shared/lib/icons'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

// Colonnes de l'export Mines. La correspondance est proposée par nom, et
// reste modifiable : les exports varient d'une année sur l'autre.
const TARGETS = [
  { key: 'id_profil',               label: 'ID profil' },
  { key: 'prenom',                  label: 'Prénom' },
  { key: 'nom',                     label: 'Nom' },
  { key: 'pays',                    label: 'Pays' },
  { key: 'ville',                   label: 'Ville' },
  { key: 'annee_obtention_diplome', label: 'Année de diplôme' },
  { key: 'diplomes',                label: 'Diplômes' },
  { key: 'entreprise_actuelle',     label: 'Entreprise' },
  { key: 'titre_poste',             label: 'Poste' },
  { key: 'email',                   label: 'Email' },
  { key: 'telephone',               label: 'Téléphone' },
  { key: 'linkedin',                label: 'LinkedIn' },
]

/**
 * Découpe une ligne CSV en respectant les guillemets — un champ « Nom, Prénom »
 * ne doit pas se scinder sur sa virgule interne.
 */
function splitLine(line, sep) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }  // guillemet échappé
        else quoted = false
      } else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map(v => v.trim())
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '')           // BOM des exports Excel
  const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length < 2) return { headers: [], rows: [] }

  // Excel francophone exporte en point-virgule ; l'export Mines en virgule.
  const sep = (lines[0].match(/;/g) ?? []).length > (lines[0].match(/,/g) ?? []).length ? ';' : ','

  const headers = splitLine(lines[0], sep)
  const rows = lines.slice(1).map(l => {
    const cells = splitLine(l, sep)
    return headers.reduce((acc, h, i) => { acc[h] = cells[i] ?? ''; return acc }, {})
  })
  return { headers, rows }
}

function guessMapping(headers) {
  const norm = h => h.toLowerCase().replace(/[^a-z0-9]/g, '')
  return TARGETS.reduce((acc, t) => {
    const hit = headers.find(h => norm(h) === norm(t.key))
      ?? headers.find(h => norm(h).includes(norm(t.key).slice(0, 6)))
    acc[t.key] = hit ?? ''
    return acc
  }, {})
}

export default function ImportCsvModal({ onClose, onDone }) {
  const [step, setStep] = useState('fichier')   // fichier → mapping → resultat
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const { headers: h, rows: r } = parseCsv(await file.text())
      if (!h.length) { setError('Fichier vide ou sans ligne d’en-tête.'); return }
      setHeaders(h); setRows(r); setMapping(guessMapping(h)); setStep('mapping')
    } catch {
      setError('Fichier illisible. Attendu : un CSV encodé en UTF-8.')
    }
  }

  async function runImport() {
    setBusy(true); setError(null)
    const res = { cree: 0, maj: 0, ignore: 0, erreurs: [] }

    for (const [i, row] of rows.entries()) {
      const payload = {}
      for (const t of TARGETS) {
        const src = mapping[t.key]
        if (src) payload[t.key] = row[src] ?? ''
      }

      // Sans nom ni prénom, la ligne ne décrit personne.
      if (!payload.prenom && !payload.nom) { res.ignore++; continue }

      const { data, error: err } = await supabase.rpc('upsert_contact', { payload })
      if (err) {
        res.erreurs.push({ ligne: i + 2, message: describeError(err) })
        // Un refus de permission vaut pour toutes les lignes : inutile de
        // marteler la base des milliers de fois.
        if (err.code === '42501') break
      } else {
        const action = Array.isArray(data) ? data[0]?.action : data?.action
        if (action === 'cree') res.cree++
        else if (action === 'maj') res.maj++
      }
    }

    setReport(res); setStep('resultat'); setBusy(false)
    onDone?.()
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,22,20,.28)', padding: 20 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 620, maxHeight: '86vh', overflow: 'auto', padding: 22, background: '#fffdf8' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 500 }}>Importer un fichier CSV</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {step === 'fichier' && (
          <>
            <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 16, maxWidth: '62ch' }}>
              Les contacts déjà connus sont mis à jour, pas dupliqués&nbsp;: la
              correspondance se fait sur l'ID profil, puis l'e-mail, puis le LinkedIn.
              Une colonne vide dans le fichier n'efface jamais une donnée existante.
            </p>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ fontSize: 13 }} />
          </>
        )}

        {step === 'mapping' && (
          <>
            <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 14 }}>
              {rows.length} ligne{rows.length > 1 ? 's' : ''} lue{rows.length > 1 ? 's' : ''}.
              Vérifiez la correspondance des colonnes.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
              {TARGETS.map(t => (
                <div key={t.key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, alignItems: 'center' }}>
                  <label style={{ fontSize: 13 }}>{t.label}</label>
                  <select
                    className="field"
                    style={{ fontSize: 13, padding: '5px 8px' }}
                    value={mapping[t.key] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [t.key]: e.target.value }))}
                  >
                    <option value="">— ignorer —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setStep('fichier')}>Retour</button>
              <button className="btn-ember" onClick={runImport} disabled={busy}>
                {busy ? `Import… ` : `Importer ${rows.length} ligne${rows.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}

        {step === 'resultat' && report && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { n: report.cree,   l: 'créés',   c: '#15803d' },
                { n: report.maj,    l: 'mis à jour', c: '#1d4ed8' },
                { n: report.ignore, l: 'ignorés', c: 'var(--ink-3)' },
              ].map(s => (
                <div key={s.l} className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.c }}>{s.n}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{s.l}</div>
                </div>
              ))}
            </div>

            {report.erreurs.length > 0 && (
              <div style={{ background: '#fee2e2', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#991b1b', marginBottom: 4 }}>
                  {report.erreurs.length} ligne{report.erreurs.length > 1 ? 's' : ''} en erreur
                </div>
                {report.erreurs.slice(0, 5).map(e => (
                  <div key={e.ligne} style={{ fontSize: 12.5, color: '#991b1b' }}>
                    Ligne {e.ligne} — {e.message}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-ember" onClick={onClose}>Fermer</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
