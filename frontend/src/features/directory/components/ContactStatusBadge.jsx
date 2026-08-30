import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { STATUSES as PIPELINE, statusMeta, normalizeStatus } from '../../../shared/lib/prospect'

// « — » d'abord : retirer le statut reste une action possible.
const STATUSES = [{ code: null, label: '—' }, ...PIPELINE]
export { STATUSES }


export default function ContactStatusBadge({ status, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef()

  const code = normalizeStatus(status ?? null)
  const current = statusMeta(code)

  function handleClick(e) {
    e.stopPropagation()
    if (!onChange) return
    const rect = ref.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
    setOpen(v => !v)
  }

  useEffect(() => {
    if (!open) return
    function close() { setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <>
      <span
        ref={ref}
        onClick={handleClick}
        style={{
          display: 'inline-flex', alignItems: 'center',
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
          textTransform: 'uppercase', letterSpacing: '.04em',
          background: current.bg,
          color: current.fg,
          cursor: onChange ? 'pointer' : 'default',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {current.label}
      </span>

      {open && createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 200,
            background: '#fffdf8', border: '1px solid var(--line)',
            borderRadius: 10, padding: 4, minWidth: 148,
            boxShadow: '0 4px 16px rgba(0,0,0,.10)',
          }}
        >
          {STATUSES.map(s => (
            <button
              key={s.code ?? '__none__'}
              onClick={e => { e.stopPropagation(); onChange(s.code); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 6,
                border: 'none', cursor: 'pointer', textAlign: 'left',
                background: s.code === code ? 'var(--paper-2)' : 'transparent',
                fontWeight: s.code === code ? 600 : 400,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
              onMouseLeave={e => e.currentTarget.style.background = s.code === code ? 'var(--paper-2)' : 'transparent'}
            >
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: statusMeta(s.code).fg, flexShrink: 0 }} />
              {s.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
