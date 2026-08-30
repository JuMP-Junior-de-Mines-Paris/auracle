import { useState, useEffect, useCallback } from 'react'
import { Icon } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { describeError } from '../lib/errors'

/**
 * Notes attachées à n'importe quelle fiche.
 *
 * La table `notes` est polymorphe (entity_type, entity_id), donc le même
 * panneau sert contact, mission, tâche, membre et liste — au lieu d'une
 * table et d'un composant par cible, comme c'était le cas des contacts.
 */
export function useNotes(entityType, entityId) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchNotes = useCallback(async () => {
    if (!entityId) { setNotes([]); setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('notes')
      .select('*, author:profiles!created_by(prenom, nom, email)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      // Les notes épinglées d'abord : c'est ce qu'on veut lire en arrivant.
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })

    setError(err ? describeError(err) : null)
    setNotes(err ? [] : (data ?? []))
    setLoading(false)
  }, [entityType, entityId])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  async function add(content) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: err } = await supabase
      .from('notes')
      .insert({ entity_type: entityType, entity_id: entityId, content: content.trim(), created_by: user.id })
      .select('*, author:profiles!created_by(prenom, nom, email)')
      .single()
    if (err) throw new Error(describeError(err))
    setNotes(prev => [data, ...prev])
    return data
  }

  async function togglePin(id, pinned) {
    const { error: err } = await supabase.from('notes').update({ pinned }).eq('id', id)
    if (err) throw new Error(describeError(err))
    setNotes(prev =>
      [...prev.map(n => (n.id === id ? { ...n, pinned } : n))]
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
    )
  }

  async function remove(id) {
    const { error: err } = await supabase.from('notes').delete().eq('id', id)
    if (err) throw new Error(describeError(err))
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  return { notes, loading, error, add, togglePin, remove, refetch: fetchNotes }
}

function authorName(a) {
  if (!a) return null
  return [a.prenom, a.nom].filter(Boolean).join(' ') || a.email || null
}

export default function NotesPanel({ entityType, entityId, title = 'Notes', placeholder = 'Ajouter une note…' }) {
  const { notes, loading, error, add, togglePin, remove } = useNotes(entityType, entityId)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!text.trim() || saving) return
    setSaving(true); setErr(null)
    try { await add(text); setText('') }
    catch (e2) { setErr(e2.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
        {title}
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        <textarea
          className="field"
          style={{ fontSize: 13, resize: 'vertical', minHeight: 72 }}
          placeholder={placeholder}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e) }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>Ctrl + Entrée pour envoyer</span>
          <button type="submit" className="btn-ember" disabled={saving || !text.trim()} style={{ fontSize: 13, padding: '6px 12px', opacity: (saving || !text.trim()) ? 0.5 : 1 }}>
            {saving ? '…' : 'Ajouter'}
          </button>
        </div>
      </form>

      {(err || error) && (
        <div style={{ fontSize: 12.5, color: 'var(--bad)', marginBottom: 8 }}>{err || error}</div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--ink-4)' }}>Chargement…</div>
      ) : notes.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink-4)', textAlign: 'center', padding: '8px 0' }}>
          Aucune note pour le moment.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map(n => (
            <div
              key={n.id}
              style={{
                padding: '10px 12px', borderRadius: 10, position: 'relative',
                background: n.pinned ? 'var(--ember-soft)' : 'var(--paper-2)',
                border: `1px solid ${n.pinned ? '#c2d9ef' : 'var(--line)'}`,
              }}
            >
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 2 }}>
                <button
                  onClick={() => togglePin(n.id, !n.pinned)}
                  title={n.pinned ? 'Détacher' : 'Épingler en tête'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: n.pinned ? 'var(--ember)' : 'var(--ink-4)' }}
                >
                  <Icon name="bookmark" size={12} fill={n.pinned ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => remove(n.id)}
                  title="Supprimer"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-4)' }}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>

              <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5, paddingRight: 40 }}>
                {n.content}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-4)' }}>
                {authorName(n.author) && <span style={{ fontWeight: 500 }}>{authorName(n.author)}</span>}
                {authorName(n.author) && ' · '}
                {new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
