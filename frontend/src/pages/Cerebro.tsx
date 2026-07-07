import { useState, useEffect, useRef, useMemo } from 'react'
import { useStore } from '../services/store'
import api from '../services/api'
import { generateUUID } from '../utils/uuid'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import mermaid from 'mermaid'
import { renderMarkdownHTML } from '../utils/markdownRenderer'
import CerebroToolbar from '../components/CerebroToolbar'

function renderContenido(texto: string) {
  const parts = texto.split(/(```grafica[\s\S]*?```)/g);

  return parts.map((part, i) => {
    if (!part) return null;

    if (part.startsWith("```grafica")) {
      const raw = part.slice("```grafica".length, -3).trim();
      return <GraficaRenderer key={i} spec={raw} />;
    }

    return (
      <div 
        key={i} 
        dangerouslySetInnerHTML={{ __html: renderMarkdownHTML(part) }} 
        style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--sepia-text)' }}
      />
    );
  });
}

export interface NoteNode {
  id: string
  title: string
  content: string
  category: string
  parent_folder: string
  x: number
  y: number
  vx: number
  vy: number
  materia_id?: string | null
  tema_id?: string | null
}

export interface GraphLink {
  source: string
  target: string
}

// ─── Paleta de colores por carpeta base ───
const FOLDER_COLORS: Record<string, string> = {
  '/geometria': '#3B82F6',
  '/programacion': '#10B981',
  '/analisis': '#F59E0B',
  '/algebra': '#8B5CF6',
  '/fisica': '#EF4444',
  '/general': '#6A45DE',
}
const DEFAULT_FOLDER_COLOR = '#6A45DE'

function getFolderColor(folder: string): string {
  for (const [prefix, color] of Object.entries(FOLDER_COLORS)) {
    if (folder.startsWith(prefix)) return color
  }
  return DEFAULT_FOLDER_COLOR
}

// ─── Utils de carpetas ───
function getParentFolder(path: string): string {
  if (path === '/' || path === '') return '/'
  const parts = path.replace(/\/+$/, '').split('/')
  parts.pop()
  return parts.join('/') || '/'
}

function getFolderName(path: string): string {
  if (path === '/' || path === '') return 'Raíz'
  return path.replace(/\/+$/, '').split('/').pop() || 'Raíz'
}

function getFolderChildren(notes: NoteNode[], folder: string): NoteNode[] {
  return notes.filter(n => n.parent_folder === folder)
}

function getSubfolders(notes: NoteNode[], parent: string, extra: string[] = []): string[] {
  const folders = new Set<string>()
  notes.forEach(n => {
    if (n.parent_folder.startsWith(parent) && n.parent_folder !== parent) {
      const rest = n.parent_folder.slice(parent.length).replace(/^\//, '')
      const child = rest.split('/')[0]
      const full = parent === '/' ? `/${child}` : `${parent}/${child}`
      folders.add(full)
    }
  })
  // Also include extra folders (user-created empty folders)
  extra.forEach(f => {
    if (f.startsWith(parent) && f !== parent) {
      const rest = f.slice(parent.length).replace(/^\//, '')
      const child = rest.split('/')[0]
      const full = parent === '/' ? `/${child}` : `${parent}/${child}`
      folders.add(full)
    }
  })
  return Array.from(folders).sort()
}

function getFolderBreadcrumbs(path: string): { label: string; path: string }[] {
  if (path === '/' || path === '') return [{ label: 'Raíz', path: '/' }]
  const parts = path.replace(/\/+$/, '').split('/')
  const crumbs: { label: string; path: string }[] = []
  let acc = ''
  for (const p of parts) {
    if (!p) continue
    acc = acc ? `${acc}/${p}` : `/${p}`
    crumbs.push({ label: p, path: acc })
  }
  return [{ label: 'Raíz', path: '/' }, ...crumbs]
}

interface CerebroProps {
  materiaId?: string | null  // cuando se renderiza dentro de MateriaContent
  temaId?: string | null     // filtro adicional por tema específico
}

export default function Cerebro({ materiaId = null, temaId = null }: CerebroProps) {

  const [notes, setNotes] = useState<NoteNode[]>([])
  const [links, setLinks] = useState<GraphLink[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [showIkaro, setShowIkaro] = useState(false)
  const [ikaroMessages, setIkaroMessages] = useState<{rol: 'user'|'ai', txt: string}[]>([])
  const [ikaroInput, setIkaroInput] = useState('')
  const [ikaroLoading, setIkaroLoading] = useState(false)

  // Carpeta actual en el explorador
  const [currentFolder, setCurrentFolder] = useState('/')
  const [folderCreating, setFolderCreating] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [extraFolders, setExtraFolders] = useState<string[]>([])

  // Efecto para renderizar gráficas Mermaid cuando se abre la vista previa
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' })
  }, [])


  // 1. Cargar datos: backend + merge con localStorage -> semilla local
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    async function loadData() {
      // ── Cargar localStorage (si existe) para merge ──
      let localNotes: NoteNode[] = []
      let localLinks: GraphLink[] = []
      let localFolders: string[] = []
      try {
        const sn = localStorage.getItem('cerebro_notes')
        const sl = localStorage.getItem('cerebro_links')
        const sf = localStorage.getItem('cerebro_folders')
        if (sn) localNotes = JSON.parse(sn)
        if (sl) localLinks = JSON.parse(sl).map((l: any) => ({ source: l.source_id || l.source, target: l.target_id || l.target }))
        if (sf) localFolders = JSON.parse(sf)
      } catch { /* ignorar datos corruptos */ }

      // Filtrar datos simulados persistidos por error
      const mockIds = new Set(['n1', 'n2', 'n3', 'n4', 'n5'])
      localNotes = localNotes.filter(n => !mockIds.has(n.id))
      localLinks = localLinks.filter(l => !mockIds.has(l.source) && !mockIds.has(l.target))

      // Intento 1: backend con JWT — merge con localStorage
      if (token) {
        try {
          const url = '/cerebro/sync'
          const res = await api.get(url)
          let backendNotes: any[] = res.data.notas || []
          backendNotes = backendNotes.filter((n: any) => !mockIds.has(n.id))
          
          let backendLinks: GraphLink[] = (res.data.enlaces || []).map((e: any) => ({
            source: e.source_id || e.source, target: e.target_id || e.target
          }))
          backendLinks = backendLinks.filter(l => !mockIds.has(l.source) && !mockIds.has(l.target))

          // Merge: Si hay backend, confía en él (para no resucitar notas borradas)
          const mergedNotes: NoteNode[] = backendNotes.map((n: any) => ({
              id: n.id, title: n.title, content: n.content,
              category: n.category || 'general', parent_folder: n.parent_folder || '/',
              x: Number(n.x), y: Number(n.y), vx: 0, vy: 0,
              materia_id: n.materia_id || null, tema_id: n.tema_id || null,
          }))

          const mergedLinks = backendLinks

          setNotes(mergedNotes)
          setLinks(mergedLinks)
          setExtraFolders(localFolders)
          if (mergedNotes.length > 0 && !selectedNoteId) {
            setSelectedNoteId(mergedNotes[0].id)
          }
          setIsLoaded(true)

          return
        } catch { /* backend no disponible, sigue a localStorage */ }
      }

      // Intento 2: localStorage (modo local, sin token o backend caido)
      try {
        const savedNotes = localStorage.getItem('cerebro_notes')
        const savedLinks = localStorage.getItem('cerebro_links')
        const savedFolders = localStorage.getItem('cerebro_folders')
        if (savedNotes && savedLinks) {
          const localNotes: NoteNode[] = JSON.parse(savedNotes).map((n: any) => ({ ...n, vx: 0, vy: 0 }))
          const localLinks: GraphLink[] = JSON.parse(savedLinks).map((l: any) => ({
            source: l.source_id || l.source,
            target: l.target_id || l.target
          }))
          if (localNotes.length > 0) {
            setNotes(localNotes)
            setLinks(localLinks)
            setExtraFolders(savedFolders ? JSON.parse(savedFolders) : [])
            setSelectedNoteId(localNotes[0].id)
            setIsLoaded(true)
            return
          }
        }
      } catch { /* ignorar datos corruptos */ }

      if (token) {
        // Usuario autenticado sin notas, mostrar cerebro vacío
        setNotes([])
        setLinks([])
        setIsLoaded(true)
        return
      }

      // Intento 3: semilla local (primera vez, solo para invitados)
      const seedNotes: NoteNode[] = [
        {
          id: 'n1', title: 'Teorema de Pitagoras',
          content: '# Teorema de Pitagoras\n\nEl **Teorema de Pitagoras** establece que en cualquier triangulo rectangulo, el area del cuadrado sobre la hipotenusa es igual a la suma de los cuadrados de los catetos.\n\n$$a^2 + b^2 = c^2$$\n\n- [[Triangulos]]\n- [[Trigonometria]]',
          category: 'geometria', parent_folder: '/geometria', x: 180, y: 150, vx: 0, vy: 0
        },
        {
          id: 'n2', title: 'Triangulos',
          content: '# Triangulos\n\nUn triangulo es un poligono de tres lados.\n\nPropiedades:\n- Suma angulos internos: 180°\n- Clasificacion: Equilatero, Isosceles, Escaleno\n\n- [[Teorema de Pitagoras]]',
          category: 'geometria', parent_folder: '/geometria', x: 100, y: 220, vx: 0, vy: 0
        },
        {
          id: 'n3', title: 'Trigonometria',
          content: '# Trigonometria\n\nRazones trigonometricas en un triangulo rectangulo:\n\n- sen(θ) = Opuesto / Hipotenusa\n- cos(θ) = Adyacente / Hipotenusa',
          category: 'geometria', parent_folder: '/geometria', x: 280, y: 220, vx: 0, vy: 0
        },
        {
          id: 'n4', title: 'Memoria Dinamica en C++',
          content: '# Memoria Dinamica en C++\n\nUso de **new** y **delete** para memoria dinamica.\n\n```\nint* arr = new int[10];\ndelete[] arr;\n```\n\n- [[Punteros]]',
          category: 'programacion', parent_folder: '/programacion', x: 350, y: 120, vx: 0, vy: 0
        },
        {
          id: 'n5', title: 'Punteros',
          content: '# Punteros\n\nUn puntero almacena una direccion de memoria.\n\n```\nint x = 42;\nint* ptr = &x;\n```\n\n- [[Memoria Dinamica en C++]]',
          category: 'programacion', parent_folder: '/programacion', x: 420, y: 200, vx: 0, vy: 0
        }
      ]
      const seedLinks: GraphLink[] = [
        { source: 'n1', target: 'n2' },
        { source: 'n1', target: 'n3' },
        { source: 'n4', target: 'n5' }
      ]
      setNotes(seedNotes)
      setLinks(seedLinks)
      setSelectedNoteId('n1')
      setIsLoaded(true)
      // Guardar semilla en localStorage para persistir (solo para invitados)
      try {
        localStorage.setItem('cerebro_notes', JSON.stringify(seedNotes))
        localStorage.setItem('cerebro_links', JSON.stringify(seedLinks))
      } catch { /* ignorar */ }
    }
    loadData()
  }, [])

  // Guardar siempre en localStorage (inmediato)
  useEffect(() => {
    if (!isLoaded) return
    const notasClean = notes.map(({ vx, vy, ...rest }) => rest)
    const enlacesBackend = links.map(l => ({ source_id: l.source, target_id: l.target }))
    try {
      localStorage.setItem('cerebro_notes', JSON.stringify(notasClean))
      localStorage.setItem('cerebro_links', JSON.stringify(links))
      localStorage.setItem('cerebro_folders', JSON.stringify(extraFolders))
    } catch { /* quota exceeded */ }
  }, [notes, links, isLoaded, extraFolders])

  // Refs to guarantee we always have latest state on unmount
  const syncStateRef = useRef({ notes, links, extraFolders })
  useEffect(() => {
    syncStateRef.current = { notes, links, extraFolders }
  }, [notes, links, extraFolders])

  // Debounced save: backend si hay conexión
  useEffect(() => {
    if (!isLoaded) return
    const timer = setTimeout(() => {
      const notasClean = notes.map(({ vx, vy, ...rest }) => rest)
      const enlacesBackend = links.map(l => ({ source_id: l.source, target_id: l.target }))

      api.post('/cerebro/sync', { notas: notasClean, enlaces: enlacesBackend }).catch(() => {})
    }, 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, links, isLoaded, extraFolders])

  // Force save on unmount or tab close
  useEffect(() => {
    const forceSave = () => {
      const { notes: currNotes, links: currLinks } = syncStateRef.current
      if (currNotes.length === 0) return // don't wipe backend if not loaded properly
      const notasClean = currNotes.map(({ vx, vy, ...rest }) => rest)
      const enlacesBackend = currLinks.map(l => ({ source_id: l.source, target_id: l.target }))
      // Usamos keepalive para que la petición no se cancele si el navegador cierra la pestaña
      const token = localStorage.getItem('auth_token')
      if (token) {
        fetch(api.defaults.baseURL + '/cerebro/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ notas: notasClean, enlaces: enlacesBackend }),
          keepalive: true
        }).catch(() => {})
      }
    }
    
    window.addEventListener('beforeunload', forceSave)
    return () => {
      window.removeEventListener('beforeunload', forceSave)
      forceSave()
    }
  }, [])

  const [selectedNoteId, setSelectedNoteId] = useState<string>('')
  const [editorMode, setEditorMode] = useState<'write' | 'preview'>('preview')
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [localGraph, setLocalGraph] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [draggedNode, setDraggedNode] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light'|'cosmos'>('light')
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // Auto-heal links once on load
  useEffect(() => {
    if (!isLoaded) return
    setLinks(prev => {
      const existingPairs = new Set(prev.map(l => `${l.source}-${l.target}`))
      const allNewLinks: GraphLink[] = [...prev]
      let healed = false
      
      notes.forEach(note => {
        const matches = [...note.content.matchAll(/\[\[(.*?)\]\]/g)].map(m => m[1].trim().toLowerCase())
        matches.forEach(name => {
          const targetNote = notes.find(n => n.title.toLowerCase() === name)
          if (targetNote && targetNote.id !== note.id) {
            const key = `${note.id}-${targetNote.id}`
            if (!existingPairs.has(key)) {
              existingPairs.add(key)
              allNewLinks.push({ source: note.id, target: targetNote.id })
              healed = true
            }
          }
        })
      })
      return healed ? allNewLinks : prev
    })
  }, [isLoaded])

  const cosmosStars = useMemo(() => {
    return Array.from({length: 80}).map((_, i) => ({
      id: i,
      cx: `${Math.random() * 100}%`,
      cy: `${Math.random() * 100}%`,
      r: Math.random() * 1.5 + 0.5,
      duration: Math.random() * 3 + 2, // 2 to 5 seconds
      delay: Math.random() * 2
    }))
  }, [])

  const materias = useStore((s) => s.materias)
  const [selectedText, setSelectedText] = useState('')
  const [fcQuestion, setFcQuestion] = useState('')
  const [selectedMateriaIdForFc, setSelectedMateriaIdForFc] = useState('')
  const [fcCreating, setFcCreating] = useState(false)
  const [fcSuccessMsg, setFcSuccessMsg] = useState('')
  
  const cmdInputRef = useRef<HTMLTextAreaElement>(null)
  const selectedNote = notes.find(n => n.id === selectedNoteId)

  useEffect(() => {
    if (editorMode === 'preview' && selectedNote) {
      setTimeout(() => {
        try {
          mermaid.run({ querySelector: '.mermaid' })
        } catch (e) {
          console.error("Mermaid run error:", e)
        }
      }, 50)
    }
  }, [selectedNote, editorMode])

  // 2. Physics Simulation Loop (60 FPS force layout)
  useEffect(() => {
    let animId: number
    const run = () => {
      setNodes(prev => {
        const next = prev.map(n => ({ ...n }))
        
        // Repulsion force
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const dx = next[j].x - next[i].x
            const dy = next[j].y - next[i].y
            const dist = Math.hypot(dx, dy) || 1
            if (dist < 150) {
              const force = (150 - dist) * 0.05
              const fx = (dx / dist) * force
              const fy = (dy / dist) * force
              next[i].vx -= fx
              next[i].vy -= fy
              next[j].vx += fx
              next[j].vy += fy
            }
          }
        }
        
        // Attraction force
        links.forEach(link => {
          const s = next.find(n => n.id === link.source)
          const t = next.find(n => n.id === link.target)
          if (s && t) {
            const dx = t.x - s.x
            const dy = t.y - s.y
            const dist = Math.hypot(dx, dy) || 1
            const force = (dist - 110) * 0.02
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            s.vx += fx
            s.vy += fy
            t.vx -= fx
            t.vy -= fy
          }
        })
        
        // Pull to center & update coordinates
        const cx = 350, cy = 300 // Centrado mejorado
        next.forEach(n => {
          if (n.id === draggedNode) return
          n.vx += (cx - n.x) * 0.003
          n.vy += (cy - n.y) * 0.003
          
          n.x += n.vx
          n.y += n.vy
          n.vx *= 0.75
          n.vy *= 0.75
        })
        
        return next
      })
      animId = requestAnimationFrame(run)
    }
    animId = requestAnimationFrame(run)
    return () => cancelAnimationFrame(animId)
  }, [links, draggedNode])

  const setNodes = (fn: (prev: NoteNode[]) => NoteNode[]) => {
    setNotes(prev => fn(prev))
  }

  // 3. Handlers
  const createNewNote = (folder = currentFolder) => {
    const newId = generateUUID()
    const title = `Nueva Nota ${notes.length + 1}`
    const newNote: NoteNode = {
      id: newId,
      title,
      content: `# ${title}\n\nEscribe aquí tu contenido utilizando Markdown y LaTeX.\nPuedes enlazar a otra nota usando [[Nombre de Nota]].`,
      category: 'general',
      parent_folder: folder,
      x: 200 + Math.random() * 100,
      y: 150 + Math.random() * 100,
      vx: 0, vy: 0,
      materia_id: materiaId,
      tema_id: temaId,
    } as NoteNode
    setNotes(prev => [...prev, newNote])
    setSelectedNoteId(newId)
    setEditorMode('write')
  }

  const createFolder = () => {
    const name = newFolderName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    if (!name) return
    const newPath = currentFolder === '/' ? `/${name}` : `${currentFolder}/${name}`
    setNewFolderName('')
    setFolderCreating(false)
    // Guardar carpeta aunque esté vacía para que aparezca en el sidebar
    setExtraFolders(prev => {
      if (prev.includes(newPath)) return prev
      return [...prev, newPath]
    })
    setCurrentFolder(newPath)
  }

  const deleteNote = (noteId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta nota?')) return
    setNotes(prev => prev.filter(n => n.id !== noteId))
    setLinks(prev => prev.filter(l => l.source !== noteId && l.target !== noteId))
    if (selectedNoteId === noteId) {
      setSelectedNoteId('')
    }
  }

  const deleteFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('¿Estás seguro de que quieres eliminar esta carpeta y todo su contenido?')) return
    setNotes(prev => prev.filter(n => !n.parent_folder.startsWith(folderPath)))
    setExtraFolders(prev => prev.filter(f => !f.startsWith(folderPath) && f !== folderPath))
    if (currentFolder.startsWith(folderPath) || currentFolder === folderPath) {
      setCurrentFolder(getParentFolder(folderPath))
    }
  }

  const moveNoteToFolder = (noteId: string, targetFolder: string) => {
    setNotes(prev => prev.map(n =>
      n.id === noteId ? { ...n, parent_folder: targetFolder } : n
    ))
  }

  const handleContentChange = (val: string) => {
    setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, content: val } : n))
    
    const matches = [...val.matchAll(/\[\[(.*?)\]\]/g)].map(m => m[1].trim().toLowerCase())
    const newLinks: GraphLink[] = []
    
    matches.forEach(name => {
      const targetNote = notes.find(n => n.title.toLowerCase() === name)
      if (targetNote && targetNote.id !== selectedNoteId) {
        const exists = newLinks.some(l => 
          (l.source === selectedNoteId && l.target === targetNote.id) ||
          (l.source === targetNote.id && l.target === selectedNoteId)
        )
        if (!exists) {
          newLinks.push({ source: selectedNoteId, target: targetNote.id })
        }
      }
    })
    
    setLinks(prev => {
      const unrelated = prev.filter(l => l.source !== selectedNoteId)
      return [...unrelated, ...newLinks]
    })
  }

  const wrapText = (prefix: string, suffix: string = '') => {
    const input = cmdInputRef.current
    if (!input) {
      if (selectedNote) handleContentChange(selectedNote.content + prefix + suffix)
      return
    }
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? 0
    const val = input.value
    const selected = val.substring(start, end)
    
    // Si no hay selección y es un link o math block, ponemos placeholder
    const innerText = selected || (prefix === '[[' ? 'Enlace' : (prefix.includes('grafica') ? '' : ''))
    
    const newVal = val.substring(0, start) + prefix + innerText + suffix + val.substring(end)
    handleContentChange(newVal)
    
    setTimeout(() => {
      input.focus()
      if (selected) {
        const newPos = start + prefix.length + selected.length
        input.setSelectionRange(newPos, newPos)
      } else {
        // Seleccionar el placeholder para que el usuario escriba encima
        const selStart = start + prefix.length
        const selEnd = selStart + innerText.length
        input.setSelectionRange(selStart, selEnd)
      }
    }, 10)
  }

  const insertText = (text: string) => wrapText(text, '')

  const handleGraphNodeDrag = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggedNode) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left - pan.x
    const my = e.clientY - rect.top - pan.y
    setNotes(prev => prev.map(n => n.id === draggedNode ? { ...n, x: mx, y: my, vx: 0, vy: 0 } : n))
  }

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection()?.toString().trim()
      if (sel) {
        setSelectedText(sel)
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  useEffect(() => {
    if (materias.length > 0 && !selectedMateriaIdForFc) {
      setSelectedMateriaIdForFc(materias[0].id)
    }
  }, [materias, selectedMateriaIdForFc])

  const crearFlashcardManual = async () => {
    if (!selectedText) return
    const matId = selectedMateriaIdForFc || (materias.length > 0 ? materias[0].id : '')
    if (!matId) {
      alert('Por favor selecciona una materia primero.')
      return
    }
    setFcCreating(true)
    setFcSuccessMsg('')
    try {
      await api.post('/srs/flashcards', {
        materia_id: matId,
        pregunta: fcQuestion || `¿Qué expresa la siguiente sección?\n"${selectedText.slice(0, 120)}"`,
        respuesta: selectedText,
        fuente: 'manual'
      })
      setFcSuccessMsg('¡Flashcard guardada en tu SRS!')
      setFcQuestion('')
      setSelectedText('')
      setTimeout(() => setFcSuccessMsg(''), 4000)
    } catch (e) {
      console.error(e)
      alert('Error al guardar la flashcard.')
    } finally {
      setFcCreating(false)
    }
  }

  const handleMouseDown = (nodeId: string) => {
    setDraggedNode(nodeId)
  }

  const handleMouseUp = () => {
    setDraggedNode(null)
  }

  // 4. Custom Markdown & LaTeX Render Engine
  const handlePreviewClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const noteName = target.getAttribute('data-note')
    if (noteName) {
      const found = notes.find(n => n.title.toLowerCase() === noteName.toLowerCase())
      if (found) {
        setSelectedNoteId(found.id)
      } else if (selectedNote) {
        const newId = generateUUID()
        const newNote: NoteNode = {
          id: newId,
          title: noteName,
          content: `# ${noteName}\n\nNota creada automáticamente desde un enlace bidireccional en **[[${selectedNote.title}]]**.\n\nEscribe aquí tu fórmula o contenido matemático.`,
          category: 'general',
          parent_folder: currentFolder,
          x: selectedNote.x + (Math.random() - 0.5) * 50,
          y: selectedNote.y + (Math.random() - 0.5) * 50,
          vx: 0, vy: 0
        }
        setNotes(prev => [...prev, newNote])
        setLinks(prev => [...prev, { source: selectedNoteId, target: newId }])
        setSelectedNoteId(newId)
        setEditorMode('write')
      }
    }
  }

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    n.content.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const notesInCurrentFolder = getFolderChildren(notes, currentFolder)
  const subfolders = getSubfolders(notes, currentFolder, extraFolders)
  const breadcrumbs = getFolderBreadcrumbs(currentFolder)

  // All notes for graph view (filtered by search + local graph toggle)
  const graphNotes = (() => {
    let base = searchTerm ? filteredNotes : notes
    if (localGraph && selectedNoteId) {
      const neighborIds = new Set<string>()
      links.forEach(l => {
        if (l.source === selectedNoteId) neighborIds.add(l.target)
        if (l.target === selectedNoteId) neighborIds.add(l.source)
      })
      neighborIds.add(selectedNoteId)
      base = base.filter(n => neighborIds.has(n.id))
    }
    return base
  })()
  const graphLinks = localGraph && selectedNoteId
    ? links.filter(l => l.source === selectedNoteId || l.target === selectedNoteId)
    : links

  const exportBrainToZip = async () => {
    const zip = new JSZip()
    const folder = zip.folder("Mathos-Cerebro")
    if (!folder) return

    notes.forEach(note => {
      const safeTitle = note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      folder.file(`${safeTitle}.md`, note.content)
    })

    const blob = await zip.generateAsync({ type: "blob" })
    saveAs(blob, "Cerebro-Export.zip")
  }

  const exportNoteToPDF = () => {
    if (!selectedNote) return;
    
    const linkedIds = links.filter(l => l.source === selectedNoteId).map(l => l.target);
    const linkedNotes = notes.filter(n => linkedIds.includes(n.id));
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    let htmlContent = `
      <html>
        <head>
          <title>${selectedNote.title} - Mathós Cerebro</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { color: #6A45DE; border-bottom: 2px solid #6A45DE; padding-bottom: 10px; margin-top: 40px; font-size: 24px; }
            h2 { color: #555; margin-top: 30px; font-size: 20px; }
            .note-container { margin-bottom: 50px; page-break-inside: avoid; }
            .sub-note { border-left: 4px solid #E5E7EB; padding-left: 20px; margin-top: 30px; }
            pre { background: #f4f4f4; padding: 15px; border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 13px; border: 1px solid #ddd; }
            code { font-family: monospace; background: #f4f4f4; padding: 2px 4px; border-radius: 4px; border: 1px solid #ddd; }
            .wiki-link { color: #0D9488; font-weight: bold; text-decoration: none; }
            .callout { padding: 15px; border-radius: 8px; margin: 15px 0; background: #f9f9f9; border-left: 4px solid #6A45DE; }
          </style>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
        </head>
        <body>
          <div class="note-container">
            <h1>${selectedNote.title}</h1>
            <div>${renderMarkdownHTML(selectedNote.content)}</div>
          </div>
    `;

    if (linkedNotes.length > 0) {
      htmlContent += `
          <div style="page-break-before: always; margin-top: 50px;">
            <h2 style="border-bottom: 1px solid #ccc; padding-bottom: 8px;">Nodos Enlazados</h2>
      `;
      linkedNotes.forEach(n => {
        htmlContent += `
          <div class="note-container sub-note">
            <h2>🔗 ${n.title}</h2>
            <div>${renderMarkdownHTML(n.content)}</div>
          </div>
        `;
      });
      htmlContent += `</div>`;
    }

    htmlContent += `
        </body>
        <script>
          window.onload = function() { setTimeout(function(){ window.print(); }, 500); };
        </script>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: 'var(--sepia-bg)', color: 'var(--sepia-text)' }}>
        <h2>Sincronizando Cerebro...</h2>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, background: 'var(--sepia-bg)', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* ─── Sidebar: Explorador de Carpetas + Notas ─── */}
      <div style={{
        width: 250, borderRight: '1px solid var(--sepia-border)', background: 'var(--sepia-panel)',
        display: 'flex', flexDirection: 'column', flexShrink: 0
      }}>
        {/* Header */}
        <div style={{ padding: 12, borderBottom: '1px solid var(--sepia-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: 'var(--sepia-text-secondary)', letterSpacing: '.06em' }}>Mi Cerebro</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setShowIkaro(v => !v)}
                title="Preguntar a Ikaro"
                style={{
                  background: showIkaro ? '#6A45DE' : 'transparent',
                  color: showIkaro ? 'white' : 'var(--sepia-text-secondary)',
                  border: '1px solid var(--sepia-border)', padding: '4px 8px',
                  borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer'
                }}
              >🤖</button>
              <button
                onClick={exportBrainToZip}
                title="Exportar a ZIP (.md)"
                style={{
                  background: 'transparent', color: 'var(--sepia-text-secondary)', border: '1px solid var(--sepia-border)', padding: '4px 8px',
                  borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer'
                }}
              >⬇️</button>
              <button
                onClick={() => createNewNote()}
                style={{
                  background: '#6A45DE', color: 'white', border: 'none', padding: '4px 10px',
                  borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 4px rgba(106,69,222,0.3)'
                }}
              >+ Nota</button>
            </div>
          </div>
          <input
            type="text"
            placeholder="Buscar apuntes..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%', fontSize: 12, padding: '6px 10px', border: '1px solid var(--sepia-border)',
              borderRadius: 6, background: 'var(--sepia-bg)', color: 'var(--sepia-text)', outline: 'none'
            }}
          />
        </div>

        {/* ─── Breadcrumbs de carpeta actual ─── */}
        <div style={{
          padding: '6px 12px', borderBottom: '1px solid var(--sepia-border)',
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
          fontSize: 11, background: 'var(--sepia-bg)'
        }}>
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: 'var(--sepia-text-secondary)', fontSize: 10 }}>›</span>}
              <button
                onClick={() => setCurrentFolder(crumb.path)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontWeight: crumb.path === currentFolder ? 700 : 400,
                  color: crumb.path === currentFolder ? '#6A45DE' : 'var(--sepia-text-secondary)',
                  padding: '2px 4px', borderRadius: 4, fontSize: 11
                }}
              >{crumb.label}</button>
            </span>
          ))}
        </div>
        
        {/* ─── Subcarpetas ─── */}
        <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--sepia-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px' }}>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--sepia-text-secondary)', letterSpacing: '.04em' }}>
              Carpetas
            </span>
            <button
              onClick={() => { setFolderCreating(true); setNewFolderName('') }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14,
                color: 'var(--sepia-text-secondary)', padding: '2px 4px'
              }}
              title="Nueva carpeta"
            >+</button>
          </div>

          {folderCreating && (
            <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setFolderCreating(false) }}
                placeholder="nombre carpeta"
                autoFocus
                style={{
                  flex: 1, fontSize: 11, padding: '3px 6px', border: '1px solid #6A45DE',
                  borderRadius: 4, background: 'var(--sepia-bg)', color: 'var(--sepia-text)', outline: 'none'
                }}
              />
              <button onClick={createFolder} style={{
                background: '#6A45DE', color: 'white', border: 'none', borderRadius: 4,
                padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer'
              }}>OK</button>
            </div>
          )}

          {/* Botón "Raíz" siempre visible */}
          <button
            onClick={() => setCurrentFolder('/')}
            style={{
              width: '100%', textAlign: 'left', padding: '5px 8px',
              borderRadius: 6, border: 'none',
              background: currentFolder === '/' ? '#EFEAFD' : 'transparent',
              color: currentFolder === '/' ? '#6A45DE' : 'var(--sepia-text)',
              cursor: 'pointer', fontSize: 12, fontWeight: currentFolder === '/' ? 700 : 400,
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2
            }}
          >📁 Raíz</button>

          {subfolders.map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
              <button
                onClick={() => setCurrentFolder(f)}
                style={{
                  flex: 1, textAlign: 'left', padding: '5px 8px 5px 20px',
                  borderRadius: 6, border: 'none',
                  background: currentFolder === f ? '#EFEAFD' : 'transparent',
                  color: currentFolder === f ? '#6A45DE' : 'var(--sepia-text)',
                  cursor: 'pointer', fontSize: 12, fontWeight: currentFolder === f ? 700 : 400,
                  display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                  background: getFolderColor(f), flexShrink: 0
                }}/>
                {getFolderName(f)}
              </button>
              <button
                onClick={(e) => deleteFolder(f, e)}
                style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px 8px', fontSize: 12, opacity: 0.6 }}
                title="Eliminar carpeta"
              >🗑️</button>
            </div>
          ))}
        </div>

        {/* ─── Lista de notas en la carpeta actual ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {notesInCurrentFolder.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--sepia-text-secondary)', textAlign: 'center', padding: 20, opacity: 0.5 }}>
              Carpeta vacía. Crea una nota nueva.
            </div>
          )}
          {(searchTerm ? filteredNotes : notesInCurrentFolder).map(n => {
            const isSel = n.id === selectedNoteId
            return (
              <div
                key={n.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  borderRadius: 8, marginBottom: 2,
                  background: isSel ? '#EFEAFD' : 'transparent',
                  cursor: 'pointer'
                }}
              >
                <button
                  onClick={() => {
                    setSelectedNoteId(n.id)
                    setCurrentFolder(n.parent_folder)
                  }}
                  style={{
                    flex: 1, textAlign: 'left', padding: '8px 12px',
                    border: 'none', background: 'transparent',
                    color: isSel ? '#6A45DE' : 'var(--sepia-text)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                      background: getFolderColor(n.parent_folder), flexShrink: 0
                    }}/>
                    <div style={{ fontWeight: 700, fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {n.title}
                    </div>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--sepia-text-secondary)', marginTop: 2, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', paddingLeft: 14 }}>
                    {n.content.replace(/[#*`\[\]]/g, '').substring(0, 40)}
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNote(n.id) }}
                  style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px 8px', fontSize: 12, opacity: isSel ? 1 : 0.4 }}
                  title="Eliminar nota"
                >🗑️</button>
                {/* Botón mover a otra carpeta */}
                <select
                  value={n.parent_folder}
                  onChange={e => moveNoteToFolder(n.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  title="Mover a carpeta"
                  style={{
                    fontSize: 9, padding: '2px 2px', border: 'none',
                    background: 'transparent', color: 'var(--sepia-text-secondary)',
                    cursor: 'pointer', maxWidth: 24, overflow: 'hidden'
                  }}
                >
                  {Array.from(new Set(notes.map(x => x.parent_folder))).sort().map(f => (
                    <option key={f} value={f}>{getFolderName(f)}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>

        {/* Flashcard SRS Creator Widget */}
        {selectedText && (
          <div style={{
            padding: 12, borderTop: '1px solid var(--sepia-border)', background: 'rgba(106,69,222,0.03)',
            display: 'flex', flexDirection: 'column', gap: 8
          }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#6A45DE', display: 'flex', alignItems: 'center', gap: 4 }}>🧠 Crear Flashcard SRS</div>
            <div style={{
              fontSize: 10.5, fontStyle: 'italic', padding: 6, background: 'var(--sepia-bg)',
              border: '1px solid var(--sepia-border)', borderRadius: 5, color: 'var(--sepia-text-secondary)',
              maxHeight: 50, overflowY: 'auto', wordBreak: 'break-all'
            }}>
              "{selectedText}"
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--sepia-text-secondary)' }}>Materia:</span>
              <select
                value={selectedMateriaIdForFc}
                onChange={e => setSelectedMateriaIdForFc(e.target.value)}
                style={{
                  fontSize: 11, padding: '4px 6px', border: '1px solid var(--sepia-border)',
                  borderRadius: 5, background: 'var(--sepia-bg)', color: 'var(--sepia-text)'
                }}
              >
                {materias.map(m => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--sepia-text-secondary)' }}>Pregunta:</span>
              <input
                type="text"
                placeholder="Escribe la pregunta..."
                value={fcQuestion}
                onChange={e => setFcQuestion(e.target.value)}
                style={{
                  fontSize: 11, padding: '4px 8px', border: '1px solid var(--sepia-border)',
                  borderRadius: 5, background: 'var(--sepia-bg)', color: 'var(--sepia-text)', outline: 'none'
                }}
              />
            </div>
            <button
              onClick={crearFlashcardManual}
              disabled={fcCreating}
              style={{
                width: '100%', background: '#6A45DE', color: 'white', border: 'none',
                padding: '6px', borderRadius: 5, fontSize: 11, fontWeight: 'bold', cursor: 'pointer'
              }}
            >{fcCreating ? 'Guardando...' : 'Añadir a SRS'}</button>
            {fcSuccessMsg && (
              <div style={{ fontSize: 10, color: 'green', fontWeight: 'bold', textAlign: 'center' }}>{fcSuccessMsg}</div>
            )}
          </div>
        )}
      </div>

      {/* ─── Editor & Preview Area ─── */}
      <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
        
        {!selectedNote ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--sepia-text-secondary)' }}>
            <span style={{ fontSize: 40, opacity: 0.3 }}>📝</span>
            <div style={{ fontSize: 14 }}>Selecciona una nota o crea una nueva</div>
            <button onClick={() => createNewNote()} style={{
              background: '#6A45DE', color: 'white', border: 'none', padding: '8px 20px',
              borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 13
            }}>+ Crear Nota</button>
          </div>
        ) : (
          <>
            {/* Editor (Izquierda) */}
            <div style={{ flex: 1.2, borderRight: '1px solid var(--sepia-border)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <CerebroToolbar
                editorMode={editorMode}
                setEditorMode={setEditorMode}
                showBacklinks={showBacklinks}
                setShowBacklinks={setShowBacklinks}
                exportNoteToPDF={exportNoteToPDF}
                folderColor={getFolderColor(selectedNote.parent_folder)}
                folderName={getFolderName(selectedNote.parent_folder)}
                wrapText={wrapText}
                insertText={insertText}
              />

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16 }}>
                {editorMode === 'write' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 12 }}>
                    <input
                      type="text"
                      value={selectedNote.title}
                      onChange={e => {
                        const val = e.target.value
                        setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, title: val } : n))
                      }}
                      style={{
                        fontSize: 18, fontWeight: 800, border: 'none', outline: 'none',
                        background: 'transparent', color: 'var(--sepia-text)',
                        borderBottom: '1px solid var(--sepia-border)', paddingBottom: 6
                      }}
                      placeholder="Título de la nota"
                    />
                    <textarea
                      ref={cmdInputRef}
                      value={selectedNote.content}
                      onChange={e => handleContentChange(e.target.value)}
                      spellCheck={true}
                      lang="es"
                      style={{
                        flex: 1, resize: 'none', border: 'none', outline: 'none',
                        background: 'transparent', color: 'var(--sepia-text)',
                        fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6
                      }}
                      placeholder="Escribe tu nota aquí..."
                    />
                  </div>
                ) : (
                  <div
                    onClick={handlePreviewClick}
                    dangerouslySetInnerHTML={{ __html: renderMarkdownHTML(selectedNote.content) }}
                    style={{ flex: 1, overflowY: 'auto', color: 'var(--sepia-text)', fontSize: 13.5 }}
                  />
                )}
              </div>

              {/* Backlinks Panel */}
              {showBacklinks && (
                <div style={{
                  borderTop: '1px solid var(--sepia-border)',
                  maxHeight: 180, overflowY: 'auto',
                  background: 'var(--sepia-panel)'
                }}>
                  <CerebroBacklinks
                    currentNoteId={selectedNoteId}
                    notes={notes}
                    links={links}
                    onNavigate={(id) => { setSelectedNoteId(id); setShowBacklinks(false) }}
                  />
                </div>
              )}
            </div>

            {/* ─── Grafo de Relaciones (Seguimiento 2D) ─── */}
            <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--sepia-panel)' }}>
              <div style={{
                padding: '8px 12px', borderBottom: '1px solid var(--sepia-border)',
                background: 'var(--sepia-panel)', fontSize: 11, fontWeight: 800,
                textTransform: 'uppercase', color: 'var(--sepia-text-secondary)', letterSpacing: '.06em', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <span>Grafo de Relaciones</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setTheme(theme === 'light' ? 'cosmos' : 'light')}
                    style={{
                      border: 'none', background: theme === 'cosmos' ? '#2e1065' : 'transparent',
                      color: theme === 'cosmos' ? '#a78bfa' : 'var(--sepia-text-secondary)',
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      cursor: 'pointer', textTransform: 'uppercase'
                    }}
                  >{theme === 'cosmos' ? '🌌 Cosmos' : '🌞 Sepia'}</button>
                  <button
                    onClick={() => setLocalGraph(!localGraph)}
                    style={{
                      border: 'none', background: localGraph ? '#F0FDFA' : 'transparent',
                      color: localGraph ? '#0D9488' : 'var(--sepia-text-secondary)',
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      cursor: 'pointer', textTransform: 'uppercase'
                    }}
                  >{localGraph ? '📌 Local' : '🌐 Global'}</button>
                </div>
              </div>
              
              <div style={{ flex: 1, position: 'relative', display: 'flex', minWidth: 0, minHeight: 0 }}>
                <svg
                  width="100%"
                  height="100%"
                  onMouseMove={handleGraphNodeDrag}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={(e) => setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))}
                  style={{ flex: 1, background: theme === 'cosmos' ? 'radial-gradient(ellipse at center, #1b2735 0%, #090a0f 100%)' : 'var(--sepia-bg)' }}
                >
                  <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {theme === 'cosmos' && (
                    <style>
                      {`
                        @keyframes twinkleGlow {
                          0%, 100% { opacity: 0.2; transform: scale(0.8); }
                          50% { opacity: 0.9; transform: scale(1.2); }
                        }
                      `}
                    </style>
                  )}

                  {/* Estrellas de fondo para Cosmos estáticas pero con glow */}
                  {theme === 'cosmos' && cosmosStars.map((star) => (
                    <circle
                      key={`star-${star.id}`}
                      cx={star.cx}
                      cy={star.cy}
                      r={star.r}
                      fill="#fff"
                      style={{
                        animation: `twinkleGlow ${star.duration}s infinite ease-in-out`,
                        animationDelay: `${star.delay}s`,
                        transformOrigin: `${star.cx} ${star.cy}`
                      }}
                    />
                  ))}

                  <g transform={`translate(${pan.x}, ${pan.y})`}>
                  {/* Render links (lines) */}
                  {graphLinks.map((link, idx) => {
                    const s = graphNotes.find(n => n.id === link.source)
                    const t = graphNotes.find(n => n.id === link.target)
                    if (!s || !t) return null
                    return (
                      <line
                        key={idx}
                        x1={s.x} y1={s.y}
                        x2={t.x} y2={t.y}
                        stroke={theme === 'cosmos' ? '#a855f7' : '#D97706'}
                        strokeWidth={theme === 'cosmos' ? 1.5 : 2}
                        opacity={theme === 'cosmos' ? 0.7 : 0.45}
                        filter={theme === 'cosmos' ? 'url(#glow)' : undefined}
                      />
                    )
                  })}

                  {/* Render nodes */}
                  {graphNotes.map(n => {
                    const isSel = n.id === selectedNoteId
                    const color = getFolderColor(n.parent_folder)
                    
                    return (
                      <g
                        key={n.id}
                        onMouseDown={() => handleMouseDown(n.id)}
                        onClick={(e) => { e.stopPropagation(); setSelectedNoteId(n.id); setCurrentFolder(n.parent_folder) }}
                        style={{ cursor: 'grab' }}
                      >
                        <circle
                          cx={n.x} cy={n.y}
                          r={isSel ? 18 : 12}
                          fill={theme === 'cosmos' ? (isSel ? '#c084fc' : '#e9d5ff') : color}
                          stroke={isSel ? (theme === 'cosmos' ? '#fff' : '#000') : (theme === 'cosmos' ? '#a855f7' : '#fff')}
                          strokeWidth={isSel ? 2 : 1.5}
                          style={{ transition: 'r 0.2s', filter: theme === 'cosmos' ? 'url(#glow)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
                        />
                        <text
                          x={n.x} y={n.y + (isSel ? 32 : 24)}
                          textAnchor="middle"
                          style={{
                            fontSize: isSel ? 11.5 : 10,
                            fontWeight: isSel ? 'bold' : 'normal',
                            fill: theme === 'cosmos' ? '#e2e8f0' : (isSel ? '#000' : 'var(--sepia-text-secondary)'),
                            fontFamily: 'system-ui, sans-serif',
                            pointerEvents: 'none',
                            userSelect: 'none',
                            textShadow: theme === 'cosmos' ? '0 0 5px rgba(0,0,0,0.8)' : '0 1px 2px rgba(255,255,255,0.8)'
                          }}
                        >
                          {n.title}
                        </text>
                      </g>
                    )
                  })}
                  </g>
                </svg>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Panel Ikaro */}
      {showIkaro && selectedNote && (
        <div style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 340, zIndex: 100,
          background: 'var(--sepia-panel)', borderLeft: '1px solid var(--sepia-border)',
          display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,.12)'
        }}>
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--sepia-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--sepia-text)' }}>🤖 Ikaro</div>
              <div style={{ fontSize: 11, opacity: .6, color: 'var(--sepia-text)', marginTop: 1 }}>
                Asistente de Cerebro · {selectedNote.title}
              </div>
            </div>
            <button onClick={() => setShowIkaro(false)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 18, opacity: .5, color: 'var(--sepia-text)'
            }}>✕</button>
          </div>

          <div style={{
            margin: '10px 12px 0', padding: '8px 10px',
            background: 'rgba(106,69,222,0.07)', borderRadius: 8,
            border: '1px solid rgba(106,69,222,0.2)', fontSize: 11,
            color: 'var(--sepia-text)', flexShrink: 0
          }}>
            <span style={{ fontWeight: 700, color: '#6A45DE' }}>📄 Contexto:</span>
            <span style={{ marginLeft: 6, opacity: .7 }}>
              {selectedNote.content.replace(/[#*`\[\]]/g, '').substring(0, 120)}…
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ikaroMessages.length === 0 && (
              <div style={{ textAlign: 'center', opacity: .4, fontSize: 12, marginTop: 20, color: 'var(--sepia-text)' }}>
                Pregúntame sobre <strong>{selectedNote.title}</strong>, pídeme conectar conceptos o crear nuevas notas.
              </div>
            )}
            {ikaroMessages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.rol === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                padding: '8px 12px',
                borderRadius: m.rol === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: m.rol === 'user' ? '#6A45DE' : 'var(--sepia-bg)',
                color: m.rol === 'user' ? 'white' : 'var(--sepia-text)',
                fontSize: 12.5, lineHeight: 1.5,
                border: m.rol === 'ai' ? '1px solid var(--sepia-border)' : 'none'
              }}>
                {renderContenido(m.txt)}
              </div>
            ))}
            {ikaroLoading && (
              <div style={{ alignSelf: 'flex-start', fontSize: 12, opacity: .5, color: 'var(--sepia-text)' }}>Ikaro está pensando…</div>
            )}
          </div>

          <div style={{
            padding: '10px 12px', borderTop: '1px solid var(--sepia-border)', flexShrink: 0,
            display: 'flex', gap: 8, alignItems: 'flex-end'
          }}>
            <textarea
              value={ikaroInput}
              onChange={e => setIkaroInput(e.target.value)}
              spellCheck={true}
              lang="es"
              onKeyDown={async e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const q = ikaroInput.trim();
                  if (!q || ikaroLoading) return;
                  setIkaroMessages(prev => [...prev, { rol: 'user', txt: q }]);
                  setIkaroInput('');
                  setIkaroLoading(true);
                  try {
                    const contexto = `Estás ayudando con la nota "${selectedNote.title}" cuyo contenido es:\n${selectedNote.content.substring(0, 500)}\n\nPregunta del usuario: ${q}`;
                    const res = await api.post('/asistente/preguntar', { pregunta: contexto, nivel: 'normal' });
                    setIkaroMessages(prev => [...prev, { rol: 'ai', txt: res.data.respuesta }]);
                  } catch {
                    setIkaroMessages(prev => [...prev, { rol: 'ai', txt: '⚠️ No pude contactar a Mathós.' }]);
                  }
                  setIkaroLoading(false);
                }
              }}
              placeholder="Pregunta o pide crear una nota... (Enter para enviar)"
              rows={2}
              style={{
                flex: 1, resize: 'none', border: '1px solid var(--sepia-border)',
                borderRadius: 8, padding: '8px 10px', background: 'var(--sepia-bg)',
                color: 'var(--sepia-text)', fontSize: 12, outline: 'none', fontFamily: 'inherit'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
