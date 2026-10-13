import { Icon } from '../../../shared/lib/icons'

const LABEL = { fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }

export function Section({ title, children, aside }) {
  return (
    <section className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h2>
        {aside}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </section>
  )
}

export function Row({ cols = 2, children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>{children}</div>
}

export function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={LABEL}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
      {hint && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{hint}</span>}
    </label>
  )
}

export function Text({ label, value, onChange, hint, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <input className="field" value={value ?? ''} onChange={e => onChange(e.target.value)} {...rest} />
    </Field>
  )
}

export function Select({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <select className="field" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </Field>
  )
}

export function Person({ value, onChange, withFonction = true, withEmail = true }) {
  const set = k => v => onChange({ ...value, [k]: v })
  return (
    <>
      <Row cols={3}>
        <Select label="Civilité" value={value.titre} onChange={set('titre')} options={['Monsieur', 'Madame']} />
        <Text label="Prénom" value={value.prenom} onChange={set('prenom')} />
        <Text label="Nom" value={value.nom} onChange={set('nom')} />
      </Row>
      {(withFonction || withEmail) && (
        <Row>
          {withFonction && <Text label="Fonction" value={value.fonction} onChange={set('fonction')} />}
          {withEmail && <Text label="Email" type="email" value={value.email} onChange={set('email')} />}
        </Row>
      )}
    </>
  )
}

/**
 * Zone de texte rédigé.
 *
 * Un texte produit par l'IA arrive marqué `origin: 'ai'` : tant qu'il n'est
 * pas relu, l'export est refusé par le serveur. Modifier le texte annule la
 * relecture déjà donnée — c'est ce qui a changé qu'il faut relire.
 */
export function Prose({ label, hint, value, onChange, review, onReview, required, rows = 5 }) {
  const aRelire = review?.origin === 'ai'
  return (
    <div>
      <Field label={`${label}${required ? ' *' : ''}`} hint={hint}>
        <textarea
          className="field"
          style={{ resize: 'vertical', minHeight: rows * 22, borderColor: aRelire && !review.reviewed ? 'var(--ember)' : undefined }}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </Field>
      {aRelire && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={review.reviewed} onChange={e => onReview(e.target.checked)} />
          <span>
            <Icon name="zap" size={12} /> Texte généré par l’IA — <strong>je l’ai relu et je le valide</strong>
          </span>
        </label>
      )}
    </div>
  )
}

export function Remove({ onClick, title = 'Retirer' }) {
  return (
    <button type="button" className="btn-ghost" onClick={onClick} title={title} aria-label={title} style={{ padding: '4px 8px' }}>
      <Icon name="trash" size={14} />
    </button>
  )
}
