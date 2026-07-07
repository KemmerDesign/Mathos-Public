import { type NoteNode, type GraphLink } from '../pages/Cerebro'

interface BacklinksProps {
  currentNoteId: string
  notes: NoteNode[]
  links: GraphLink[]
  onNavigate: (noteId: string) => void
}

export default function CerebroBacklinks({ currentNoteId, notes, links, onNavigate }: BacklinksProps) {
  // Encontrar notas que linkean A la nota actual (backlinks)
  const backlinks = links
    .filter(l => l.target === currentNoteId || l.source === currentNoteId)
    .map(l => l.source === currentNoteId ? l.target : l.source)

  const linkedNotes = notes.filter(n => backlinks.includes(n.id) && n.id !== currentNoteId)

  // Encontrar menciones en contenido ([[wikilinks]])
  const currentNote = notes.find(n => n.id === currentNoteId)
  const mentionedIn: { noteId: string; context: string }[] = []
  if (currentNote) {
    const titleLower = currentNote.title.toLowerCase()
    notes.forEach(n => {
      if (n.id === currentNoteId) return
      const regex = new RegExp(`\\[\\[${currentNote.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'i')
      const match = n.content.match(regex)
      if (match) {
        const idx = match.index || 0
        const start = Math.max(0, idx - 30)
        const end = Math.min(n.content.length, idx + match[0].length + 40)
        let ctx = n.content.slice(start, end)
        if (start > 0) ctx = '…' + ctx
        if (end < n.content.length) ctx = ctx + '…'
        mentionedIn.push({ noteId: n.id, context: ctx })
      }
    })
  }

  if (linkedNotes.length === 0 && mentionedIn.length === 0) {
    return (
      <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--sepia-text-secondary)', textAlign: 'center' }}>
        Sin backlinks — ninguna nota enlaza a esta
      </div>
    )
  }

  return (
    <div style={{ fontSize: 12 }}>
      {/* Backlinks por enlace explícito */}
      {linkedNotes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
            color: 'var(--sepia-accent)', letterSpacing: '.08em',
            marginBottom: 6, padding: '0 14px'
          }}>
            🔗 Notas enlazadas ({linkedNotes.length})
          </div>
          {linkedNotes.map(note => (
            <button
              key={note.id}
              onClick={() => onNavigate(note.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 14px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 12, borderRadius: 6,
                color: 'var(--sepia-text)',
              }}
              className="hover:bg-[var(--sepia-accent-tint)] transition-colors"
            >
              <span style={{ fontWeight: 600 }}>{note.title}</span>
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--sepia-text-secondary)' }}>
                {note.parent_folder}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Menciones no enlazadas (wikilinks detectados en contenido) */}
      {mentionedIn.length > 0 && (
        <div>
          <div style={{
            fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
            color: '#0D9488', letterSpacing: '.08em',
            marginBottom: 6, padding: '0 14px'
          }}>
            📝 Menciones ({mentionedIn.length})
          </div>
          {mentionedIn.map((m, i) => {
            const mentionNote = notes.find(n => n.id === m.noteId)
            return (
              <button
                key={`mention-${i}`}
                onClick={() => onNavigate(m.noteId)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 11, borderRadius: 6,
                  color: 'var(--sepia-text-secondary)',
                }}
                className="hover:bg-[#F0FDFA] transition-colors"
              >
                <div style={{ fontWeight: 600, color: 'var(--sepia-text)', marginBottom: 3 }}>
                  {mentionNote?.title || 'Nota desconocida'}
                </div>
                <div style={{
                  fontSize: 10, lineHeight: 1.4,
                  padding: '4px 8px', background: 'var(--sepia-bg)',
                  borderRadius: 4, border: '1px solid var(--sepia-border)',
                  fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {m.context}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
