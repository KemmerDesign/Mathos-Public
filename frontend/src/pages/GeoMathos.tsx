import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MousePointer2, Circle as CircleIcon, Minus, SquareSlash, ArrowRight, Grid3X3, Focus, ZoomIn, ZoomOut, Save, FolderOpen, RotateCcw, Image, Trash2, ArrowRightCircle, Move, MousePointerClick, RefreshCcw, Hand, Eye, Settings, Search, Keyboard, Info, Calculator, MessageSquare, PlaySquare, Maximize } from 'lucide-react'
import { useStore } from '../services/store'
import api from '../services/api'
import GeoMathosHeader from '../components/GeoMathosHeader'
import GeoMathosToolsSidebar from '../components/GeoMathosToolsSidebar'

// ── Constants ──────────────────────────────────────────────────────────────────
const W = 860, H = 560
const OX = 430, OY = 280
const GRID = 40
const SNAP_PX = 14
const PT_R = 5
const EXTENT = 4
const AC = '#6A45DE'
const GEO = '#8B6914'
const GEO_L = '#C4922A'
const COLOR_PRESETS = ['#8B6914', '#6A45DE', '#DC2626', '#059669', '#0284C7', '#D97706']

// ── Types ──────────────────────────────────────────────────────────────────────
// GP.x / GP.y = MATH UNITS — converted via mathToSvg()
interface GP     { id: string; x: number; y: number; label: string; hidden?: boolean }
interface GS     { id: string; p1: string; p2: string; dashed?: boolean; color?: string; hidden?: boolean }
interface GC     { id: string; center: string; rPt: string; color?: string; hidden?: boolean }
interface GA     { id: string; p1: string; v: string; p2: string; hidden?: boolean }
interface GLn    { id: string; p1: string; p2: string; color?: string; hidden?: boolean }   // infinite line
interface GR     { id: string; p1: string; p2: string; color?: string; hidden?: boolean }   // ray from p1 through p2
interface GV     { id: string; p1: string; p2: string; color?: string; hidden?: boolean }   // vector with arrowhead
interface GPoly  { id: string; pts: string[]; color?: string; hidden?: boolean }             // polygon
interface GFn    { id: string; expr: string; color?: string; implicit?: boolean; hidden?: boolean; domain?: [number, number] } // f(x) or implicit F(x,y)=0
interface GState { pts: GP[]; segs: GS[]; circles: GC[]; angles: GA[]; lines: GLn[]; rays: GR[]; vectors: GV[]; polys: GPoly[]; fns: GFn[] }

export type Tool = 'select' | 'point' | 'segment' | 'line' | 'ray' | 'vector' | 'circle'
          | 'midpoint' | 'perp' | 'parallel' | 'perpto' | 'angle' | 'bisector'
          | 'intersect' | 'poly' | 'delete'
          | 'reflect_line' | 'reflect_pt' | 'rotate' | 'translate'

// ── ID generator ───────────────────────────────────────────────────────────────
let _n = 0
const uid = () => `g${++_n}`
const EMPTY: GState = { pts: [], segs: [], circles: [], angles: [], lines: [], rays: [], vectors: [], polys: [], fns: [] }

// ── Geometry utilities (math coords) ─────────────────────────────────────────
const dist = (a: GP, b: GP) => Math.hypot(b.x - a.x, b.y - a.y)

function angleDeg(p1: GP, v: GP, p2: GP): number {
  const a1 = Math.atan2(p1.y - v.y, p1.x - v.x)
  const a2 = Math.atan2(p2.y - v.y, p2.x - v.x)
  let d = Math.abs(a2 - a1) * 180 / Math.PI
  if (d > 180) d = 360 - d
  return Math.round(d * 10) / 10
}

function nextLabel(pts: GP[]): string {
  const used = new Set(pts.map(p => p.label))
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c)) return c
  return `P${pts.length + 1}`
}


function polyArea(pts: GP[]): number {
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(sum) / 2
}

// Reflect point P across line defined by lp1-lp2
function reflectAcrossLine(p: GP, lp1: GP, lp2: GP): { x: number; y: number } {
  const dx = lp2.x - lp1.x, dy = lp2.y - lp1.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-10) return { x: p.x, y: p.y }
  const t = ((p.x - lp1.x) * dx + (p.y - lp1.y) * dy) / len2
  const fx = lp1.x + t * dx, fy = lp1.y + t * dy
  return { x: 2 * fx - p.x, y: 2 * fy - p.y }
}

// ── Expression system (cached, supports x and y) ──────────────────────────────
const _exprCache = new Map<string, (...a: number[]) => number | null>()

function _sanitize(expr: string): string {
  return expr
    .replace(/\^/g, '**')
    .replace(/\b(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|sqrt|cbrt|abs|log|log2|log10|exp|ceil|floor|round|sign|pow|hypot)\b/g, 'Math.$1')
    .replace(/\bln\b/g, 'Math.log')
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
    .replace(/(\d)([xy])/g, '$1*$2')
    .replace(/\)([xy])/g, ')*$1')
}

function _compile(vars: string[], sanitized: string): (...a: number[]) => number | null {
  const key = vars.join(',') + ':' + sanitized
  if (_exprCache.has(key)) return _exprCache.get(key)!
  try {
    // eslint-disable-next-line no-new-func
    const raw = new Function(...vars, `"use strict"; return +(${sanitized});`)
    const fn = (...a: number[]) => { try { const r = raw(...a); return (typeof r === 'number' && isFinite(r)) ? r : null } catch { return null } }
    _exprCache.set(key, fn)
    return fn
  } catch {
    const noop = () => null
    _exprCache.set(key, noop)
    return noop
  }
}

function evalFn(expr: string, x: number): number | null {
  return _compile(['x'], _sanitize(expr))(x)
}

function evalImplicit(rawExpr: string, x: number, y: number): number | null {
  const expr = rawExpr.includes('=')
    ? (() => { const [l, r] = rawExpr.split('=', 2); return `(${l})-(${r})` })()
    : rawExpr
  return _compile(['x', 'y'], _sanitize(expr))(x, y)
}

// ── Marching squares for implicit curves F(x,y)=0 ─────────────────────────────
function implicitSVGPath(
  fn: (x: number, y: number) => number | null,
  toSvg: (mx: number, my: number) => SvgPt,
  xMin: number, xMax: number, yMin: number, yMax: number,
  nx: number, ny: number
): string {
  const dx = (xMax - xMin) / nx
  const dy = (yMax - yMin) / ny
  // Pre-sample entire grid
  const grid: number[][] = []
  for (let j = 0; j <= ny; j++) {
    grid[j] = []
    for (let i = 0; i <= nx; i++) {
      const v = fn(xMin + i * dx, yMin + j * dy)
      grid[j][i] = v === null ? NaN : v
    }
  }
  let path = ''
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v00 = grid[j][i], v10 = grid[j][i + 1]
      const v01 = grid[j + 1][i], v11 = grid[j + 1][i + 1]
      if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) continue
      const crosses: SvgPt[] = []
      // Bottom edge (j, left→right)
      if ((v00 > 0) !== (v10 > 0))
        crosses.push(toSvg(xMin + (i + v00 / (v00 - v10)) * dx, yMin + j * dy))
      // Right edge (i+1, bottom→top)
      if ((v10 > 0) !== (v11 > 0))
        crosses.push(toSvg(xMin + (i + 1) * dx, yMin + (j + v10 / (v10 - v11)) * dy))
      // Top edge (j+1, right→left)
      if ((v11 > 0) !== (v01 > 0))
        crosses.push(toSvg(xMin + (i + 1 - v11 / (v11 - v01)) * dx, yMin + (j + 1) * dy))
      // Left edge (i, top→bottom)
      if ((v01 > 0) !== (v00 > 0))
        crosses.push(toSvg(xMin + i * dx, yMin + (j + 1 - v01 / (v01 - v00)) * dy))
      if (crosses.length === 2) {
        path += `M${crosses[0].x.toFixed(1)},${crosses[0].y.toFixed(1)} L${crosses[1].x.toFixed(1)},${crosses[1].y.toFixed(1)} `
      } else if (crosses.length === 4) {
        // Saddle: resolve by center value
        const vc = fn(xMin + (i + 0.5) * dx, yMin + (j + 0.5) * dy)
        if (vc === null || vc > 0) {
          path += `M${crosses[0].x.toFixed(1)},${crosses[0].y.toFixed(1)} L${crosses[3].x.toFixed(1)},${crosses[3].y.toFixed(1)} `
          path += `M${crosses[1].x.toFixed(1)},${crosses[1].y.toFixed(1)} L${crosses[2].x.toFixed(1)},${crosses[2].y.toFixed(1)} `
        } else {
          path += `M${crosses[0].x.toFixed(1)},${crosses[0].y.toFixed(1)} L${crosses[1].x.toFixed(1)},${crosses[1].y.toFixed(1)} `
          path += `M${crosses[2].x.toFixed(1)},${crosses[2].y.toFixed(1)} L${crosses[3].x.toFixed(1)},${crosses[3].y.toFixed(1)} `
        }
      }
    }
  }
  return path
}

// Clip an infinite line (defined by two SVG points) to the viewport rectangle
function clipLineToViewport(sx1: number, sy1: number, sx2: number, sy2: number): [SvgPt, SvgPt] | null {
  const dx = sx2 - sx1, dy = sy2 - sy1
  const tvals: number[] = []
  if (Math.abs(dx) > 1e-6) { tvals.push(-sx1 / dx); tvals.push((W - sx1) / dx) }
  if (Math.abs(dy) > 1e-6) { tvals.push(-sy1 / dy); tvals.push((H - sy1) / dy) }
  const inside = tvals.filter(t => {
    const x = sx1 + t * dx, y = sy1 + t * dy
    return x >= -1 && x <= W + 1 && y >= -1 && y <= H + 1
  }).sort((a, b) => a - b)
  if (inside.length < 2) return null
  const t1 = inside[0], t2 = inside[inside.length - 1]
  return [{ x: sx1 + t1 * dx, y: sy1 + t1 * dy }, { x: sx1 + t2 * dx, y: sy1 + t2 * dy }]
}

// Clip a ray (starts at p1, goes through p2) to viewport — returns far endpoint
function clipRayToViewport(sx1: number, sy1: number, sx2: number, sy2: number): SvgPt | null {
  const dx = sx2 - sx1, dy = sy2 - sy1
  let tMax = Infinity
  if (dx > 1e-6) tMax = Math.min(tMax, (W - sx1) / dx)
  else if (dx < -1e-6) tMax = Math.min(tMax, -sx1 / dx)
  if (dy > 1e-6) tMax = Math.min(tMax, (H - sy1) / dy)
  else if (dy < -1e-6) tMax = Math.min(tMax, -sy1 / dy)
  if (!isFinite(tMax) || tMax <= 0) return null
  return { x: sx1 + tMax * dx, y: sy1 + tMax * dy }
}

// SVG polygon string for an arrowhead at (x2,y2) pointing from (x1,y1)
function arrowHeadPoints(x1: number, y1: number, x2: number, y2: number, size = 11): string {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len
  const px = -uy, py = ux
  const b1x = x2 - ux * size + px * size * 0.38
  const b1y = y2 - uy * size + py * size * 0.38
  const b2x = x2 - ux * size - px * size * 0.38
  const b2y = y2 - uy * size - py * size * 0.38
  return `${x2},${y2} ${b1x},${b1y} ${b2x},${b2y}`
}

// SVG-coord geometry for drawing angle arcs
function angleArcPathSvg(p1: SvgPt, v: SvgPt, p2: SvgPt, r = 22): string {
  const a1 = Math.atan2(p1.y - v.y, p1.x - v.x)
  const a2 = Math.atan2(p2.y - v.y, p2.x - v.x)
  const sx = v.x + r * Math.cos(a1), sy = v.y + r * Math.sin(a1)
  const ex = v.x + r * Math.cos(a2), ey = v.y + r * Math.sin(a2)
  let diff = a2 - a1
  if (diff < 0) diff += 2 * Math.PI
  const large = diff > Math.PI ? 1 : 0
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`
}

function rightAnglePathSvg(p1: SvgPt, v: SvgPt, p2: SvgPt, s = 14): string {
  const dx1 = p1.x - v.x, dy1 = p1.y - v.y
  const dx2 = p2.x - v.x, dy2 = p2.y - v.y
  const l1 = Math.hypot(dx1, dy1) || 1, l2 = Math.hypot(dx2, dy2) || 1
  const u1x = dx1 / l1 * s, u1y = dy1 / l1 * s
  const u2x = dx2 / l2 * s, u2y = dy2 / l2 * s
  return `M ${v.x + u1x} ${v.y + u1y} L ${v.x + u1x + u2x} ${v.y + u1y + u2y} L ${v.x + u2x} ${v.y + u2y}`
}

function angleLabelPosSvg(p1: SvgPt, v: SvgPt, p2: SvgPt, r = 38): SvgPt {
  const a1 = Math.atan2(p1.y - v.y, p1.x - v.x)
  const a2 = Math.atan2(p2.y - v.y, p2.x - v.x)
  return { x: v.x + r * Math.cos((a1 + a2) / 2), y: v.y + r * Math.sin((a1 + a2) / 2) }
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function GeoMathos() {
  const [st, setSt] = useState<GState>(EMPTY)
  const [tool, setTool] = useState<Tool>('point')
  const [pending, setPending] = useState<string[]>([])
  const [pendingSeg, setPendingSeg] = useState<string | null>(null)
  const [editingPt, setEditingPt] = useState<{ id: string; xStr: string; yStr: string } | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [snapPt, setSnapPt] = useState<GP | null>(null)
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [cmdInput, setCmdInput] = useState('')
  const [isPanning, setIsPanning] = useState(false)
  const [currentColor, setCurrentColor] = useState(GEO)
  const [snapGrid, setSnapGrid] = useState(false)
  const [fnInput, setFnInput] = useState('')
  const [fnError, setFnError] = useState<string | null>(null)
  const [rotateAngle, setRotateAngle] = useState(90)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [editingObj, setEditingObj] = useState<{ type: keyof GState; id: string; val: string } | null>(null)
  const [cmdError, setCmdError] = useState<string | null>(null)
  const [intersectPending, setIntersectPending] = useState<{ id: string; type: string } | null>(null)
  const [showMathKb, setShowMathKb] = useState(false)
  const cmdInputRef = useRef<HTMLInputElement>(null)

  function insertText(text: string) {
    const input = cmdInputRef.current
    if (!input) {
      setCmdInput(prev => prev + text)
      return
    }
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? 0
    const val = input.value
    const newVal = val.substring(0, start) + text + val.substring(end)
    setCmdInput(newVal)
    setCmdError(null)
    setTimeout(() => {
      input.focus()
      const newPos = start + text.length
      input.setSelectionRange(newPos, newPos)
    }, 10)
  }

  // ── Persistencia ───────────────────────────────────────────────────────
  type SavedItem = { id: string; nombre: string; created_at: string; preview: string; n_puntos: number; n_objetos: number }
  const [showSave, setShowSave] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveToast, setSaveToast] = useState<string | null>(null)
  const [showLoad, setShowLoad] = useState(false)
  const [savedList, setSavedList] = useState<SavedItem[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [confirmLoad, setConfirmLoad] = useState<string | null>(null)  // id que espera confirmación
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null)  // id de la construcción cargada

  const navigate = useNavigate()
  const selectedMateriaId = useStore(s => s.selectedMateriaId)
  const setPendingChatImage = useStore(s => s.setPendingChatImage)

  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<string | null>(null)
  const panning = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null)
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null)
  const historyRef = useRef<GState[]>([])

  // ── Coordinate helpers ─────────────────────────────────────────────────
  const gridPx = GRID * zoom
  const ox = OX + pan.x
  const oy = OY + pan.y
  const mathToSvg = (mx: number, my: number): SvgPt => ({ x: ox + mx * gridPx, y: oy - my * gridPx })
  const svgToMath = (sx: number, sy: number) => ({ x: (sx - ox) / gridPx, y: -(sy - oy) / gridPx })
  const ms = (p: GP): SvgPt => mathToSvg(p.x, p.y)

  // ── Global Escape ──────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEditingPt(null); setPending([]); setPendingSeg(null) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────
  const gp = (id: string) => st.pts.find(p => p.id === id)!

  // Direction vector of any linear object (seg, line, ray, vector)
  function getLinearDir(id: string): { dx: number; dy: number } | null {
    const s = st.segs.find(x => x.id === id) || st.lines.find(x => x.id === id)
       || st.rays.find(x => x.id === id) || st.vectors.find(x => x.id === id)
    if (!s) return null
    try { const p1 = gp(s.p1), p2 = gp(s.p2); return { dx: p2.x - p1.x, dy: p2.y - p1.y } } catch { return null }
  }

  function pushHistory(s: GState) {
    historyRef.current = [...historyRef.current.slice(-40), structuredClone(s)]
  }

  function undo() {
    const h = historyRef.current
    if (!h.length) return
    setSt(h[h.length - 1])
    historyRef.current = h.slice(0, -1)
    setPending([]); setPendingSeg(null)
  }

  function svgCoordsFromClient(clientX: number, clientY: number): SvgPt {
    if (!svgRef.current) return { x: 0, y: 0 }
    const r = svgRef.current.getBoundingClientRect()
    return { x: (clientX - r.left) * (W / r.width), y: (clientY - r.top) * (H / r.height) }
  }

  function svgCoords(e: React.MouseEvent): SvgPt {
    return svgCoordsFromClient(e.clientX, e.clientY)
  }

  function snapTo(mx: number, my: number, pts: GP[], skip?: string): GP | null {
    const threshold = SNAP_PX / gridPx
    let best: GP | null = null, bestD = threshold
    for (const p of pts) {
      if (p.id === skip || p.hidden) continue
      const d = Math.hypot(p.x - mx, p.y - my)
      if (d < bestD) { bestD = d; best = p }
    }
    return best
  }

  function changeTool(t: Tool) { setTool(t); setPending([]); setPendingSeg(null); setEditingPt(null); setIntersectPending(null); setCmdError(null) }

  // ── Fit all points in view ─────────────────────────────────────────────
  function fitAll(pts?: GP[]) {
    const P = pts ?? st.pts
    if (!P.length) { setZoom(1); setPan({ x: 0, y: 0 }); return }
    const xs = P.map(p => p.x), ys = P.map(p => p.y)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const margin = Math.max(1, (xMax - xMin) * 0.18, (yMax - yMin) * 0.18)
    const rangeX = (xMax - xMin) + 2 * margin || 10
    const rangeY = (yMax - yMin) + 2 * margin || 10
    const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2
    const newZoom = Math.min((W * 0.85) / (rangeX * GRID), (H * 0.85) / (rangeY * GRID), 5)
    setZoom(newZoom)
    setPan({ x: -cx * GRID * newZoom, y: cy * GRID * newZoom })
  }

  // ── Command bar ────────────────────────────────────────────────────────
  function runCommand() {
    setCmdError(null)
    const raw = cmdInput.trim()
    if (!raw) return

    // 1. Separar la etiqueta si existe, ej. "s1 = Segmento(A, B)" -> label="s1", resto="Segmento(A, B)"
    let label: string | undefined = undefined
    let expr = raw
    const eqIdx = raw.indexOf('=')
    
    // Validar que el '=' no esté dentro de paréntesis (ej. curvas implícitas x^2+y^2=9)
    const parenIdx = raw.indexOf('(')
    const hasLabel = eqIdx > 0 && (parenIdx === -1 || eqIdx < parenIdx)
    
    if (hasLabel) {
      const parts = raw.split('=', 2)
      label = parts[0].trim()
      expr = parts[1].trim()
      
      // Si es definición de función f(x) = ..., no es una etiqueta simple de objeto
      if (/\([x]\)$/.test(label)) {
        label = undefined
        expr = raw
      }
    }

    const findPt = (lbl: string) => {
      const clean = lbl.trim().toUpperCase()
      return st.pts.find(p => p.label.toUpperCase() === clean)
    }

    // A. Punto cartesiano: A = (2, 3) o simplemente (2, 3)
    const ptMatch = expr.match(/^\(?\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)?$/)
    if (ptMatch) {
      const mx = parseFloat(ptMatch[1])
      const my = parseFloat(ptMatch[2])
      const finalLabel = label || nextLabel(st.pts)
      
      const existing = st.pts.find(p => p.label.toUpperCase() === finalLabel.toUpperCase())
      pushHistory(st)
      if (existing) {
        setSt(prev => ({
          ...prev,
          pts: prev.pts.map(p => p.id === existing.id ? { ...p, x: mx, y: my } : p)
        }))
      } else {
        setSt(prev => ({
          ...prev,
          pts: [...prev.pts, { id: uid(), x: mx, y: my, label: finalLabel }]
        }))
      }
      setCmdInput('')
      return
    }

    // B. Comandos geométricos: Cmd(Arg1, Arg2, ...)
    const cmdMatch = expr.match(/^([A-Za-zÁÉÍÓÚáéíóúñ]+)\((.+)\)$/)
    if (cmdMatch) {
      const cmdName = cmdMatch[1].toLowerCase()
      const args = cmdMatch[2].split(',').map(a => a.trim())

      // Segmento: Segmento(A, B)
      if (cmdName === 'segmento' || cmdName === 'segment') {
        if (args.length !== 2) {
          setCmdError('Segmento requiere 2 puntos: ej. Segmento(A, B)')
          return
        }
        const p1 = findPt(args[0]), p2 = findPt(args[1])
        if (!p1 || !p2) {
          setCmdError(`Puntos no encontrados: ${!p1 ? args[0] : ''} ${!p2 ? args[1] : ''}`)
          return
        }
        pushHistory(st)
        setSt(prev => ({
          ...prev,
          segs: [...prev.segs, { id: uid(), p1: p1.id, p2: p2.id, color: currentColor }]
        }))
        setCmdInput('')
        return
      }

      // Recta: Recta(A, B)
      if (cmdName === 'recta' || cmdName === 'line') {
        if (args.length !== 2) {
          setCmdError('Recta requiere 2 puntos: ej. Recta(A, B)')
          return
        }
        const p1 = findPt(args[0]), p2 = findPt(args[1])
        if (!p1 || !p2) {
          setCmdError(`Puntos no encontrados: ${!p1 ? args[0] : ''} ${!p2 ? args[1] : ''}`)
          return
        }
        pushHistory(st)
        setSt(prev => ({
          ...prev,
          lines: [...prev.lines, { id: uid(), p1: p1.id, p2: p2.id, color: currentColor }]
        }))
        setCmdInput('')
        return
      }

      // Semirrecta: Semirrecta(A, B)
      if (cmdName === 'semirrecta' || cmdName === 'ray') {
        if (args.length !== 2) {
          setCmdError('Semirrecta requiere 2 puntos: ej. Semirrecta(A, B)')
          return
        }
        const p1 = findPt(args[0]), p2 = findPt(args[1])
        if (!p1 || !p2) {
          setCmdError(`Puntos no encontrados: ${!p1 ? args[0] : ''} ${!p2 ? args[1] : ''}`)
          return
        }
        pushHistory(st)
        setSt(prev => ({
          ...prev,
          rays: [...prev.rays, { id: uid(), p1: p1.id, p2: p2.id, color: currentColor }]
        }))
        setCmdInput('')
        return
      }

      // Vector: Vector(A, B)
      if (cmdName === 'vector') {
        if (args.length !== 2) {
          setCmdError('Vector requiere 2 puntos: ej. Vector(A, B)')
          return
        }
        const p1 = findPt(args[0]), p2 = findPt(args[1])
        if (!p1 || !p2) {
          setCmdError(`Puntos no encontrados: ${!p1 ? args[0] : ''} ${!p2 ? args[1] : ''}`)
          return
        }
        pushHistory(st)
        setSt(prev => ({
          ...prev,
          vectors: [...prev.vectors, { id: uid(), p1: p1.id, p2: p2.id, color: currentColor }]
        }))
        setCmdInput('')
        return
      }

      // Círculo: Circulo(A, B)
      if (cmdName === 'circulo' || cmdName === 'círculo' || cmdName === 'circle') {
        if (args.length !== 2) {
          setCmdError('Círculo requiere Centro y Punto de borde: ej. Circulo(A, B)')
          return
        }
        const p1 = findPt(args[0]), p2 = findPt(args[1])
        if (!p1 || !p2) {
          setCmdError(`Puntos no encontrados: ${!p1 ? args[0] : ''} ${!p2 ? args[1] : ''}`)
          return
        }
        pushHistory(st)
        setSt(prev => ({
          ...prev,
          circles: [...prev.circles, { id: uid(), center: p1.id, rPt: p2.id, color: currentColor }]
        }))
        setCmdInput('')
        return
      }

      // Ángulo: Angulo(A, B, C)
      if (cmdName === 'angulo' || cmdName === 'ángulo' || cmdName === 'angle') {
        if (args.length !== 3) {
          setCmdError('Ángulo requiere 3 puntos (vértice al centro): ej. Angulo(A, B, C)')
          return
        }
        const p1 = findPt(args[0]), p2 = findPt(args[1]), p3 = findPt(args[2])
        if (!p1 || !p2 || !p3) {
          setCmdError(`Puntos no encontrados: ${!p1 ? args[0] : ''} ${!p2 ? args[1] : ''} ${!p3 ? args[2] : ''}`)
          return
        }
        pushHistory(st)
        setSt(prev => ({
          ...prev,
          angles: [...prev.angles, { id: uid(), p1: p1.id, v: p2.id, p2: p3.id }]
        }))
        setCmdInput('')
        return
      }

      // Punto Medio: Medio(A, B)
      if (cmdName === 'medio' || cmdName === 'puntomedio' || cmdName === 'midpoint') {
        if (args.length !== 2) {
          setCmdError('Punto medio requiere 2 puntos: ej. Medio(A, B)')
          return
        }
        const p1 = findPt(args[0]), p2 = findPt(args[1])
        if (!p1 || !p2) {
          setCmdError(`Puntos no encontrados: ${!p1 ? args[0] : ''} ${!p2 ? args[1] : ''}`)
          return
        }
        pushHistory(st)
        setSt(prev => ({
          ...prev,
          pts: [...prev.pts, { id: uid(), x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, label: nextLabel(prev.pts) }]
        }))
        setCmdInput('')
        return
      }
    }

    // C. Intentar graficar como función
    const domainMatch = raw.match(/\[([^,]+),([^\]]+)\]/)
    let domain: [number, number] | undefined = undefined
    let exprFunc = raw
    
    if (domainMatch) {
      exprFunc = raw.replace(domainMatch[0], '').trim()
      const minVal = evalFn(domainMatch[1].trim(), 0)
      const maxVal = evalFn(domainMatch[2].trim(), 0)
      if (minVal !== null && maxVal !== null) {
        domain = [minVal, maxVal]
      }
    }

    const isImplicit = /\by\b/.test(exprFunc) || exprFunc.includes('=')
    let valid = false
    try {
      if (isImplicit) {
        const tests: [number, number][] = [[0,0],[1,1],[-1,1],[0,3]]
        valid = tests.some(([x, y]) => evalImplicit(exprFunc, x, y) !== null)
      } else {
        valid = [0, 1, -1, 0.5].some(x => evalFn(exprFunc, x) !== null)
      }
    } catch { /* parse fail */ }

    if (valid) {
      pushHistory(st)
      setSt(prev => ({
        ...prev,
        fns: [...(prev.fns ?? []), { id: uid(), expr: exprFunc, color: currentColor, implicit: isImplicit, domain }]
      }))
      setCmdInput('')
      return
    }

    setCmdError('Expresión no válida. Ej: A=(2,3), Segmento(A,B), Circulo(A,B), f(x)=sin(x)')
  }

  // ── Close polygon ──────────────────────────────────────────────────────
  function closePoly() {
    if (pending.length < 3) return
    pushHistory(st)
    setSt(prev => ({ ...prev, polys: [...prev.polys, { id: uid(), pts: [...pending], color: currentColor }] }))
    setPending([])
  }

  // ── Add function f(x) ─────────────────────────────────────────────────
  function addFn() {
    const rawExpr = fnInput.trim()
    if (!rawExpr) return

    // Parsear dominio si existe, ej: "sin(x) [0, 3.14]" o "x^2 [-2, 2]"
    const domainMatch = rawExpr.match(/\[([^,]+),([^\]]+)\]/)
    let domain: [number, number] | undefined = undefined
    let expr = rawExpr

    if (domainMatch) {
      expr = rawExpr.replace(domainMatch[0], '').trim()
      const minVal = evalFn(domainMatch[1].trim(), 0)
      const maxVal = evalFn(domainMatch[2].trim(), 0)
      if (minVal !== null && maxVal !== null) {
        domain = [minVal, maxVal]
      }
    }

    const isImplicit = /\by\b/.test(expr) || expr.includes('=')
    let valid = false
    try {
      if (isImplicit) {
        const tests: [number, number][] = [[0,0],[1,1],[-1,1],[0,3],[2,-1],[1,0]]
        valid = tests.some(([x, y]) => evalImplicit(expr, x, y) !== null)
      } else {
        valid = [0, 1, -1, 0.5].some(x => evalFn(expr, x) !== null)
      }
    } catch { /* fail */ }

    if (!valid) {
      setFnError('Inválida — ej: sin(x) [-3.14, 3.14], x^2+y^2=9')
      return
    }
    pushHistory(st)
    setSt(prev => ({
      ...prev,
      fns: [...(prev.fns ?? []), { id: uid(), expr, color: currentColor, implicit: isImplicit, domain }]
    }))
    setFnInput('')
    setFnError(null)
  }

  // ── Resolvedor Numérico de Intersecciones (Bisección) ───────────────────
  function evalLineAtX(p1: GP, p2: GP, x: number): number | null {
    const dx = p2.x - p1.x
    if (Math.abs(dx) < 1e-9) return null
    const t = (x - p1.x) / dx
    return p1.y + t * (p2.y - p1.y)
  }

  function findIntersections(obj1: any, type1: string, obj2: any, type2: string): { x: number; y: number }[] {
    const xMin = svgToMath(0, 0).x
    const xMax = svgToMath(W, 0).x
    const results: { x: number; y: number }[] = []

    // Helper para evaluar recta/segmento/vector
    const evalLine = (obj: any, type: string, x: number): number | null => {
      try {
        const p1 = gp(obj.p1), p2 = gp(obj.p2)
        if (type === 'segs' || type === 'vectors') {
          const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x)
          if (x < minX - 1e-6 || x > maxX + 1e-6) return null
        } else if (type === 'rays') {
          const dx = p2.x - p1.x
          if (dx > 0 && x < p1.x - 1e-6) return null
          if (dx < 0 && x > p1.x + 1e-6) return null
        }
        return evalLineAtX(p1, p2, x)
      } catch { return null }
    }

    type SemiFunc = {
      domain: [number, number]
      eval: (x: number) => number | null
    }

    const toSemiFuncs = (obj: any, type: string): SemiFunc[] => {
      if (type === 'fns') {
        const d: [number, number] = obj.domain || [xMin, xMax]
        return [{
          domain: d,
          eval: (x) => evalFn(obj.expr, x)
        }]
      }
      if (type === 'segs' || type === 'lines' || type === 'rays' || type === 'vectors') {
        try {
          const p1 = gp(obj.p1), p2 = gp(obj.p2)
          if (Math.abs(p2.x - p1.x) < 1e-8) return [] // vertical, manejada aparte
          
          let d: [number, number] = [xMin, xMax]
          if (type === 'segs' || type === 'vectors') {
            d = [Math.min(p1.x, p2.x), Math.max(p1.x, p2.x)]
          } else if (type === 'rays') {
            const dx = p2.x - p1.x
            d = dx > 0 ? [p1.x, xMax] : [xMin, p1.x]
          }
          return [{
            domain: d,
            eval: (x) => evalLine(obj, type, x)
          }]
        } catch { return [] }
      }
      if (type === 'circles') {
        try {
          const center = gp(obj.center), rPt = gp(obj.rPt)
          const r = dist(center, rPt)
          const d: [number, number] = [center.x - r, center.x + r]
          return [
            {
              domain: d,
              eval: (x) => {
                const dx = x - center.x
                const rad = r * r - dx * dx
                if (rad < 0) return null
                return center.y + Math.sqrt(rad)
              }
            },
            {
              domain: d,
              eval: (x) => {
                const dx = x - center.x
                const rad = r * r - dx * dx
                if (rad < 0) return null
                return center.y - Math.sqrt(rad)
              }
            }
          ]
        } catch { return [] }
      }
      return []
    }

    // Verificar si alguno es vertical
    const isVertical = (obj: any, type: string): GP[] | null => {
      if (type === 'segs' || type === 'lines' || type === 'rays' || type === 'vectors') {
        try {
          const p1 = gp(obj.p1), p2 = gp(obj.p2)
          if (Math.abs(p2.x - p1.x) < 1e-8) return [p1, p2]
        } catch {}
      }
      return null
    }

    const v1 = isVertical(obj1, type1)
    const v2 = isVertical(obj2, type2)

    if (v1 || v2) {
      const vert = v1 || v2!
      const otherObj = v1 ? obj2 : obj1
      const otherType = v1 ? type2 : type1
      const xc = vert[0].x
      
      if (isVertical(otherObj, otherType)) return []
      
      const sfs = toSemiFuncs(otherObj, otherType)
      sfs.forEach(sf => {
        if (xc >= sf.domain[0] - 1e-6 && xc <= sf.domain[1] + 1e-6) {
          const yc = sf.eval(xc)
          if (yc !== null) {
            const vertType = v1 ? type1 : type2
            if (vertType === 'segs' || vertType === 'vectors') {
              const minY = Math.min(vert[0].y, vert[1].y), maxY = Math.max(vert[0].y, vert[1].y)
              if (yc < minY - 1e-6 || yc > maxY + 1e-6) return
            }
            results.push({ x: xc, y: yc })
          }
        }
      })
      return results
    }

    const sf1s = toSemiFuncs(obj1, type1)
    const sf2s = toSemiFuncs(obj2, type2)

    for (const sf1 of sf1s) {
      for (const sf2 of sf2s) {
        const dMin = Math.max(sf1.domain[0], sf2.domain[0], xMin)
        const dMax = Math.min(sf1.domain[1], sf2.domain[1], xMax)
        if (dMin > dMax - 1e-6) continue

        const h = (x: number): number | null => {
          const y1 = sf1.eval(x)
          const y2 = sf2.eval(x)
          if (y1 === null || y2 === null) return null
          return y1 - y2
        }

        const M = 60
        const step = (dMax - dMin) / M
        for (let i = 0; i < M; i++) {
          const a = dMin + i * step
          const b = a + step
          const ha = h(a), hb = h(b)
          if (ha === null || hb === null) continue
          if ((ha > 0) !== (hb > 0)) {
            let left = a, right = b
            for (let iter = 0; iter < 28; iter++) {
              const mid = (left + right) / 2
              const hm = h(mid)
              if (hm === null) break
              if (Math.abs(hm) < 1e-6) { left = mid; break }
              const hl = h(left)
              if (hl === null) break
              if ((hl > 0) === (hm > 0)) {
                left = mid
              } else {
                right = mid
              }
            }
            const rx = left
            const ry = sf1.eval(rx)
            if (ry !== null) {
              if (!results.some(pt => Math.abs(pt.x - rx) < 1e-4 && Math.abs(pt.y - ry) < 1e-4)) {
                results.push({ x: rx, y: ry })
              }
            }
          }
        }
      }
    }
    return results
  }

  function handleIntersectSelect(id: string, type: string) {
    if (!intersectPending) {
      setIntersectPending({ id, type })
      return
    }
    if (intersectPending.id === id && intersectPending.type === type) return

    const findObj = (oId: string, oType: string) => {
      if (oType === 'fns') return (st.fns ?? []).find(f => f.id === oId)
      if (oType === 'segs') return st.segs.find(s => s.id === oId)
      if (oType === 'lines') return st.lines.find(l => l.id === oId)
      if (oType === 'rays') return st.rays.find(r => r.id === oId)
      if (oType === 'vectors') return st.vectors.find(v => v.id === oId)
      if (oType === 'circles') return st.circles.find(c => c.id === oId)
      return null
    }

    const obj1 = findObj(intersectPending.id, intersectPending.type)
    const obj2 = findObj(id, type)

    if (obj1 && obj2) {
      const pts = findIntersections(obj1, intersectPending.type, obj2, type)
      if (pts.length > 0) {
        pushHistory(st)
        setSt(prev => {
          let current = prev
          pts.forEach(pt => {
            current = {
              ...current,
              pts: [...current.pts, { id: uid(), x: pt.x, y: pt.y, label: nextLabel(current.pts) }]
            }
          })
          return current
        })
      }
    }
    setIntersectPending(null)
  }
  // ── Algebra View helpers ────────────────────────────────────────────────
  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  function toggleVisibility(type: keyof GState, id: string) {
    pushHistory(st)
    setSt(prev => ({
      ...prev,
      [type]: (prev[type] as any[]).map((obj: any) =>
        obj.id === id ? { ...obj, hidden: !obj.hidden } : obj
      )
    }))
  }

  function deleteObject(type: keyof GState, id: string) {
    pushHistory(st)
    if (type === 'pts') {
      // Borrar punto y todo lo que esté conectado
      setSt(prev => ({
        ...prev,
        pts: prev.pts.filter(p => p.id !== id),
        segs: prev.segs.filter(s => s.p1 !== id && s.p2 !== id),
        circles: prev.circles.filter(c => c.center !== id && c.rPt !== id),
        angles: prev.angles.filter(a => a.p1 !== id && a.v !== id && a.p2 !== id),
        lines: prev.lines.filter(l => l.p1 !== id && l.p2 !== id),
        rays: prev.rays.filter(r => r.p1 !== id && r.p2 !== id),
        vectors: prev.vectors.filter(v => v.p1 !== id && v.p2 !== id),
        polys: prev.polys.filter(pg => !pg.pts.includes(id)),
      }))
    } else {
      setSt(prev => ({
        ...prev,
        [type]: (prev[type] as any[]).filter(obj => obj.id !== id),
      }))
    }
  }

  function startAlgebraEdit(type: keyof GState, id: string, definition: string, label: string) {
    if (type === 'pts') {
      setEditingObj({ type, id, val: `${label} = ${definition}` })
    } else {
      setEditingObj({ type, id, val: definition })
    }
  }

  function saveAlgebraEdit() {
    if (!editingObj) return
    const { type, id, val } = editingObj
    pushHistory(st)
    
    if (type === 'pts') {
      let newLabel = ''
      let coordsStr = val
      if (val.includes('=')) {
        const parts = val.split('=', 2)
        newLabel = parts[0].trim()
        coordsStr = parts[1].trim()
      }
      
      const clean = coordsStr.replace(/[()]/g, '')
      const parts = clean.split(',')
      const x = parseFloat(parts[0]), y = parseFloat(parts[1])
      if (!isNaN(x) && !isNaN(y)) {
        setSt(prev => ({
          ...prev,
          pts: prev.pts.map(p => p.id === id ? { ...p, x, y, label: newLabel || p.label } : p)
        }))
      } else if (newLabel) {
        setSt(prev => ({
          ...prev,
          pts: prev.pts.map(p => p.id === id ? { ...p, label: newLabel } : p)
        }))
      }
    } else if (type === 'fns') {
      const expr = val.trim()
      if (expr) {
        const isImplicit = /\by\b/.test(expr) || expr.includes('=')
        let valid = false
        if (isImplicit) {
          const tests: [number, number][] = [[0,0],[1,1],[-1,1],[0,3]]
          valid = tests.some(([x, y]) => evalImplicit(expr, x, y) !== null)
        } else {
          valid = [0, 1, -1, 0.5].some(x => evalFn(expr, x) !== null)
        }
        if (valid) {
          setSt(prev => ({
            ...prev,
            fns: (prev.fns ?? []).map(f => f.id === id ? { ...f, expr, implicit: isImplicit } : f)
          }))
        }
      }
    }
    setEditingObj(null)
  }
  // ── Coordinate editor ──────────────────────────────────────────────────
  function onPointDblClick(e: React.MouseEvent, ptId: string) {
    e.stopPropagation()
    const pt = st.pts.find(p => p.id === ptId)
    if (!pt) return
    setEditingPt({ id: ptId, xStr: pt.x.toFixed(2), yStr: pt.y.toFixed(2) })
  }

  function confirmEdit() {
    if (!editingPt) return
    const x = parseFloat(editingPt.xStr), y = parseFloat(editingPt.yStr)
    if (isNaN(x) || isNaN(y)) { setEditingPt(null); return }
    pushHistory(st)
    setSt(prev => ({ ...prev, pts: prev.pts.map(p => p.id === editingPt.id ? { ...p, x, y } : p) }))
    setEditingPt(null)
  }

  // ── Zoom with mouse wheel ─────────────────────────────────────────────
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    const { x: sx, y: sy } = svgCoords(e as unknown as React.MouseEvent)
    const { x: mx, y: my } = svgToMath(sx, sy)
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
    const newZoom = Math.max(0.01, Math.min(50, zoom * factor))
    const ng = GRID * newZoom
    setZoom(newZoom)
    setPan({ x: sx - OX - mx * ng, y: sy - OY + my * ng })
  }

  // ── Mouse events ───────────────────────────────────────────────────────
  function onSVGMove(e: React.MouseEvent<SVGSVGElement>) {
    const { x: sx, y: sy } = svgCoords(e)
    if (panning.current) {
      const rect = svgRef.current!.getBoundingClientRect()
      const dx = (e.clientX - panning.current.startX) * (W / rect.width)
      const dy = (e.clientY - panning.current.startY) * (H / rect.height)
      setPan({ x: panning.current.startPan.x + dx, y: panning.current.startPan.y + dy })
      return
    }
    const { x: mx, y: my } = svgToMath(sx, sy)
    const snap = snapTo(mx, my, st.pts, dragging.current ?? undefined)
    setSnapPt(snap)
    const cmx = (snapGrid && !snap) ? Math.round(mx) : mx
    const cmy = (snapGrid && !snap) ? Math.round(my) : my
    setCursor(snap ? { x: snap.x, y: snap.y } : { x: cmx, y: cmy })
    if (dragging.current) {
      const id = dragging.current
      const px = snapGrid ? Math.round(mx) : mx
      const py = snapGrid ? Math.round(my) : my
      setSt(prev => ({ ...prev, pts: prev.pts.map(p => p.id === id ? { ...p, x: px, y: py } : p) }))
    }
  }

  function onSVGLeave() {
    if (panning.current) { panning.current = null; setIsPanning(false) }
    if (dragging.current) { pushHistory(st); dragging.current = null }
    setCursor(null); setSnapPt(null)
  }

  function onSVGUp() {
    if (panning.current) { panning.current = null; setIsPanning(false); return }
    if (dragging.current) { pushHistory(st); dragging.current = null }
  }

  function onSVGDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      panning.current = { startX: e.clientX, startY: e.clientY, startPan: { ...pan } }
      setIsPanning(true); e.preventDefault(); return
    }
    if (editingPt) { setEditingPt(null); return }
    const { x: sx, y: sy } = svgCoords(e)
    const { x: mx, y: my } = svgToMath(sx, sy)
    handleClick(mx, my)
  }

  // ── Touch events ──────────────────────────────────────────────────────
  function onSVGTouchStart(e: React.TouchEvent<SVGSVGElement>) {
    e.preventDefault()
    if (e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1]
      const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const cx = (t1.clientX + t2.clientX) / 2
      const cy = (t1.clientY + t2.clientY) / 2
      pinchRef.current = { dist: d, cx, cy }
      panning.current = { startX: cx, startY: cy, startPan: { ...pan } }
      setIsPanning(true)
      return
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]
      if (editingPt) { setEditingPt(null); return }
      const { x: sx, y: sy } = svgCoordsFromClient(t.clientX, t.clientY)
      const { x: mx, y: my } = svgToMath(sx, sy)
      if (tool === 'select') {
        const snap = snapTo(mx, my, st.pts)
        if (snap) dragging.current = snap.id
      }
      setCursor({ x: mx, y: my })
    }
  }

  function onSVGTouchMove(e: React.TouchEvent<SVGSVGElement>) {
    e.preventDefault()
    if (e.touches.length === 2 && pinchRef.current) {
      const t1 = e.touches[0], t2 = e.touches[1]
      const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const cx = (t1.clientX + t2.clientX) / 2
      const cy = (t1.clientY + t2.clientY) / 2
      // Pan
      if (panning.current) {
        const rect = svgRef.current!.getBoundingClientRect()
        const dx = (cx - panning.current.startX) * (W / rect.width)
        const dy = (cy - panning.current.startY) * (H / rect.height)
        setPan({ x: panning.current.startPan.x + dx, y: panning.current.startPan.y + dy })
      }
      // Pinch zoom (zoom-to-center)
      const factor = newDist / pinchRef.current.dist
      if (Math.abs(factor - 1) > 0.005) {
        const { x: sx, y: sy } = svgCoordsFromClient(cx, cy)
        const { x: mx, y: my } = svgToMath(sx, sy)
        const newZoom = Math.max(0.01, Math.min(50, zoom * factor))
        const ng = GRID * newZoom
        setZoom(newZoom)
        setPan({ x: sx - OX - mx * ng, y: sy - OY + my * ng })
        pinchRef.current = { dist: newDist, cx, cy }
      }
      return
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]
      const { x: sx, y: sy } = svgCoordsFromClient(t.clientX, t.clientY)
      const { x: mx, y: my } = svgToMath(sx, sy)
      const snap = snapTo(mx, my, st.pts, dragging.current ?? undefined)
      setSnapPt(snap)
      const cmx = (snapGrid && !snap) ? Math.round(mx) : mx
      const cmy = (snapGrid && !snap) ? Math.round(my) : my
      setCursor(snap ? { x: snap.x, y: snap.y } : { x: cmx, y: cmy })
      if (dragging.current) {
        const id = dragging.current
        const px = snapGrid ? Math.round(mx) : mx
        const py = snapGrid ? Math.round(my) : my
        setSt(prev => ({ ...prev, pts: prev.pts.map(p => p.id === id ? { ...p, x: px, y: py } : p) }))
      }
    }
  }

  function onSVGTouchEnd(e: React.TouchEvent<SVGSVGElement>) {
    if (pinchRef.current) {
      pinchRef.current = null
      panning.current = null
      setIsPanning(false)
      return
    }
    if (dragging.current) {
      pushHistory(st)
      dragging.current = null
      setCursor(null); setSnapPt(null)
      return
    }
    // Single tap → trigger tool action
    const t = e.changedTouches[0]
    const { x: sx, y: sy } = svgCoordsFromClient(t.clientX, t.clientY)
    const { x: mx, y: my } = svgToMath(sx, sy)
    handleClick(mx, my)
    setCursor(null); setSnapPt(null)
  }

  function onPointTouchStart(e: React.TouchEvent, ptId: string) {
    e.stopPropagation()
    e.preventDefault()
    if (tool === 'select') { dragging.current = ptId; return }
    if (tool === 'delete') {
      pushHistory(st)
      setSt(prev => ({
        ...prev,
        pts: prev.pts.filter(p => p.id !== ptId),
        segs: prev.segs.filter(s => s.p1 !== ptId && s.p2 !== ptId),
        circles: prev.circles.filter(c => c.center !== ptId && c.rPt !== ptId),
        angles: prev.angles.filter(a => a.p1 !== ptId && a.v !== ptId && a.p2 !== ptId),
        lines: prev.lines.filter(l => l.p1 !== ptId && l.p2 !== ptId),
        rays: prev.rays.filter(r => r.p1 !== ptId && r.p2 !== ptId),
        vectors: prev.vectors.filter(v => v.p1 !== ptId && v.p2 !== ptId),
        polys: prev.polys.filter(pg => !pg.pts.includes(ptId)),
      }))
      return
    }
    // Other tools: treat as click on the point's math coords
    const t = e.touches[0]
    const { x: sx, y: sy } = svgCoordsFromClient(t.clientX, t.clientY)
    const { x: mx, y: my } = svgToMath(sx, sy)
    handleClick(mx, my)
  }

  function onPointDown(e: React.MouseEvent, ptId: string) {
    e.stopPropagation()
    if (e.shiftKey) return
    if (tool === 'select') { dragging.current = ptId; return }
    if (tool === 'delete') {
      pushHistory(st)
      setSt(prev => ({
        ...prev,
        pts: prev.pts.filter(p => p.id !== ptId),
        segs: prev.segs.filter(s => s.p1 !== ptId && s.p2 !== ptId),
        circles: prev.circles.filter(c => c.center !== ptId && c.rPt !== ptId),
        angles: prev.angles.filter(a => a.p1 !== ptId && a.v !== ptId && a.p2 !== ptId),
        lines: prev.lines.filter(l => l.p1 !== ptId && l.p2 !== ptId),
        rays: prev.rays.filter(r => r.p1 !== ptId && r.p2 !== ptId),
        vectors: prev.vectors.filter(v => v.p1 !== ptId && v.p2 !== ptId),
        polys: prev.polys.filter(pg => !pg.pts.includes(ptId)),
      }))
      return
    }
    const { x: sx, y: sy } = svgCoords(e)
    const { x: mx, y: my } = svgToMath(sx, sy)
    handleClick(mx, my)
  }

  function onSegDown(e: React.MouseEvent, sId: string) {
    e.stopPropagation()
    if (tool === 'intersect') {
      handleIntersectSelect(sId, 'segs')
      return
    }
    if (tool === 'parallel' || tool === 'perpto') { if (!pendingSeg) setPendingSeg(sId); return }
    if (tool === 'reflect_line') { if (!pendingSeg) setPendingSeg(sId); return }
    if (tool === 'delete') {
      pushHistory(st)
      setSt(prev => ({ ...prev, segs: prev.segs.filter(s => s.id !== sId) }))
    }
  }

  function onLineDown(e: React.MouseEvent, lId: string) {
    e.stopPropagation()
    if (tool === 'intersect') {
      handleIntersectSelect(lId, 'lines')
      return
    }
    if (tool === 'parallel' || tool === 'perpto') { if (!pendingSeg) setPendingSeg(lId); return }
    if (tool === 'reflect_line') { if (!pendingSeg) setPendingSeg(lId); return }
    if (tool === 'delete') {
      pushHistory(st)
      setSt(prev => ({ ...prev, lines: prev.lines.filter(l => l.id !== lId) }))
    }
  }

  function onRayDown(e: React.MouseEvent, rId: string) {
    e.stopPropagation()
    if (tool === 'intersect') {
      handleIntersectSelect(rId, 'rays')
      return
    }
    if (tool === 'parallel' || tool === 'perpto') { if (!pendingSeg) setPendingSeg(rId); return }
    if (tool === 'reflect_line') { if (!pendingSeg) setPendingSeg(rId); return }
    if (tool === 'delete') {
      pushHistory(st)
      setSt(prev => ({ ...prev, rays: prev.rays.filter(r => r.id !== rId) }))
    }
  }

  function onVectorDown(e: React.MouseEvent, vId: string) {
    e.stopPropagation()
    if (tool === 'intersect') {
      handleIntersectSelect(vId, 'vectors')
      return
    }
    if (tool === 'parallel' || tool === 'perpto') { if (!pendingSeg) setPendingSeg(vId); return }
    if (tool === 'translate') { if (!pendingSeg) setPendingSeg(vId); return }
    if (tool === 'delete') {
      pushHistory(st)
      setSt(prev => ({ ...prev, vectors: prev.vectors.filter(v => v.id !== vId) }))
    }
  }

  function onCircleDown(e: React.MouseEvent, cId: string) {
    e.stopPropagation()
    if (tool === 'intersect') {
      handleIntersectSelect(cId, 'circles')
      return
    }
    if (tool === 'delete') {
      pushHistory(st)
      setSt(prev => ({ ...prev, circles: prev.circles.filter(c => c.id !== cId) }))
    }
  }

  function onAngleDown(e: React.MouseEvent, aId: string) {
    e.stopPropagation()
    if (tool === 'delete') {
      pushHistory(st)
      setSt(prev => ({ ...prev, angles: prev.angles.filter(a => a.id !== aId) }))
    }
  }

  function onPolyDown(e: React.MouseEvent, pId: string) {
    e.stopPropagation()
    if (tool === 'delete') {
      pushHistory(st)
      setSt(prev => ({ ...prev, polys: prev.polys.filter(p => p.id !== pId) }))
    }
  }

  // ── Click handler (math coords) ────────────────────────────────────────
  function handleClick(rawMx: number, rawMy: number) {
    const mx = snapGrid ? Math.round(rawMx) : rawMx
    const my = snapGrid ? Math.round(rawMy) : rawMy
    if (tool === 'select' || tool === 'delete' || tool === 'intersect') return

    // parallel / perpto: first click → segment already set via onSegDown; second click = through point
    if ((tool === 'parallel' || tool === 'perpto') && pendingSeg) {
      const dir = getLinearDir(pendingSeg)
      if (!dir) { setPendingSeg(null); return }
      const snap = snapTo(mx, my, st.pts)
      pushHistory(st)
      setSt(prev => {
        let thru: GP, base = prev
        if (snap) {
          thru = prev.pts.find(p => p.id === snap.id)!
        } else {
          thru = { id: uid(), x: mx, y: my, label: nextLabel(prev.pts) }
          base = { ...prev, pts: [...prev.pts, thru] }
        }
        const len = Math.hypot(dir.dx, dir.dy) || 1
        const ux = tool === 'parallel' ? dir.dx / len * EXTENT : -dir.dy / len * EXTENT
        const uy = tool === 'parallel' ? dir.dy / len * EXTENT :  dir.dx / len * EXTENT
        const b1: GP = { id: uid(), x: thru.x + ux, y: thru.y + uy, label: nextLabel(base.pts) }
        const b2: GP = { id: uid(), x: thru.x - ux, y: thru.y - uy, label: nextLabel([...base.pts, b1]) }
        return { ...base, pts: [...base.pts, b1, b2], segs: [...base.segs, { id: uid(), p1: b1.id, p2: b2.id, dashed: true, color: currentColor }] }
      })
      setPendingSeg(null); return
    }
    if ((tool === 'parallel' || tool === 'perpto') && !pendingSeg) return

    // ── Transformaciones ──────────────────────────────────────────────────
    if (tool === 'reflect_line') {
      if (!pendingSeg) return
      const sn = snapTo(mx, my, st.pts)
      if (!sn) return
      const srcPt = gp(sn.id)
      const ref = st.segs.find(s => s.id === pendingSeg) || st.lines.find(s => s.id === pendingSeg) || st.rays.find(s => s.id === pendingSeg)
      if (!ref) { setPendingSeg(null); return }
      const img = reflectAcrossLine(srcPt, gp(ref.p1), gp(ref.p2))
      pushHistory(st)
      setSt(prev => ({ ...prev, pts: [...prev.pts, { id: uid(), x: img.x, y: img.y, label: nextLabel(prev.pts) }] }))
      return
    }

    if (tool === 'reflect_pt') {
      if (pending.length === 0) {
        const sn = snapTo(mx, my, st.pts)
        if (sn) { setPending([sn.id]); return }
        const newId = uid()
        pushHistory(st)
        setSt(prev => ({ ...prev, pts: [...prev.pts, { id: newId, x: mx, y: my, label: nextLabel(prev.pts) }] }))
        setPending([newId])
        return
      }
      const sn = snapTo(mx, my, st.pts)
      if (!sn || sn.id === pending[0]) return
      const c = gp(pending[0]), s = gp(sn.id)
      pushHistory(st)
      setSt(prev => ({ ...prev, pts: [...prev.pts, { id: uid(), x: 2 * c.x - s.x, y: 2 * c.y - s.y, label: nextLabel(prev.pts) }] }))
      return
    }

    if (tool === 'rotate') {
      if (pending.length === 0) {
        const sn = snapTo(mx, my, st.pts)
        if (sn) { setPending([sn.id]); return }
        const newId = uid()
        pushHistory(st)
        setSt(prev => ({ ...prev, pts: [...prev.pts, { id: newId, x: mx, y: my, label: nextLabel(prev.pts) }] }))
        setPending([newId])
        return
      }
      const sn = snapTo(mx, my, st.pts)
      if (!sn || sn.id === pending[0]) return
      const c = gp(pending[0]), s = gp(sn.id)
      const θ = rotateAngle * Math.PI / 180
      const dx = s.x - c.x, dy = s.y - c.y
      pushHistory(st)
      setSt(prev => ({ ...prev, pts: [...prev.pts, { id: uid(), x: c.x + dx * Math.cos(θ) - dy * Math.sin(θ), y: c.y + dx * Math.sin(θ) + dy * Math.cos(θ), label: nextLabel(prev.pts) }] }))
      return
    }

    if (tool === 'translate') {
      if (!pendingSeg) return
      const sn = snapTo(mx, my, st.pts)
      if (!sn) return
      const srcPt = gp(sn.id)
      const vec = st.vectors.find(v => v.id === pendingSeg)
      if (!vec) { setPendingSeg(null); return }
      const vp1 = gp(vec.p1), vp2 = gp(vec.p2)
      pushHistory(st)
      setSt(prev => ({ ...prev, pts: [...prev.pts, { id: uid(), x: srcPt.x + (vp2.x - vp1.x), y: srcPt.y + (vp2.y - vp1.y), label: nextLabel(prev.pts) }] }))
      return
    }

    // polygon: collect N vertices, click on first to close
    if (tool === 'poly') {
      const snap = snapTo(mx, my, st.pts)
      const usedId = snap?.id
      if (pending.length >= 3 && usedId === pending[0]) {
        closePoly(); return
      }
      if (usedId && pending.includes(usedId)) return
      const newId = usedId ?? uid()
      if (!usedId) {
        pushHistory(st)
        setSt(prev => ({ ...prev, pts: [...prev.pts, { id: newId, x: mx, y: my, label: nextLabel(prev.pts) }] }))
      }
      setPending(prev => [...prev, newId])
      return
    }

    if (tool === 'point') {
      if (snapTo(mx, my, st.pts)) return
      pushHistory(st)
      setSt(prev => ({ ...prev, pts: [...prev.pts, { id: uid(), x: mx, y: my, label: nextLabel(prev.pts) }] }))
      return
    }

    const snap = snapTo(mx, my, st.pts)
    const usedPtId = snap?.id
    if (usedPtId && pending.includes(usedPtId)) return

    const newPtId = usedPtId ?? uid()
    const newPt: GP | null = usedPtId ? null : { id: newPtId, x: mx, y: my, label: nextLabel(st.pts) }
    const newPending = [...pending, newPtId]
    const needed = (tool === 'angle' || tool === 'bisector') ? 3 : 2

    if (newPending.length < needed) {
      pushHistory(st)
      setSt(prev => newPt ? { ...prev, pts: [...prev.pts, newPt] } : prev)
      setPending(newPending)
      return
    }

    pushHistory(st)
    const [id0, id1, id2] = newPending
    setSt(prev => {
      const base = newPt ? { ...prev, pts: [...prev.pts, newPt] } : { ...prev }
      if (tool === 'segment')  return { ...base, segs:    [...base.segs,    { id: uid(), p1: id0, p2: id1, color: currentColor }] }
      if (tool === 'line')     return { ...base, lines:   [...base.lines,   { id: uid(), p1: id0, p2: id1, color: currentColor }] }
      if (tool === 'ray')      return { ...base, rays:    [...base.rays,    { id: uid(), p1: id0, p2: id1, color: currentColor }] }
      if (tool === 'vector')   return { ...base, vectors: [...base.vectors, { id: uid(), p1: id0, p2: id1, color: currentColor }] }
      if (tool === 'circle')   return { ...base, circles: [...base.circles, { id: uid(), center: id0, rPt: id1, color: currentColor }] }
      if (tool === 'angle')    return { ...base, angles:  [...base.angles,  { id: uid(), p1: id0, v: id1, p2: id2 }] }
      if (tool === 'midpoint') {
        const p1 = base.pts.find(p => p.id === id0)!, p2 = base.pts.find(p => p.id === id1)!
        return { ...base, pts: [...base.pts, { id: uid(), x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, label: nextLabel(base.pts) }] }
      }
      if (tool === 'perp') {
        const p1 = base.pts.find(p => p.id === id0)!, p2 = base.pts.find(p => p.id === id1)!
        const dx = p2.x - p1.x, dy = p2.y - p1.y
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len * EXTENT, ny = dx / len * EXTENT
        const midx = (p1.x + p2.x) / 2, midy = (p1.y + p2.y) / 2
        const b1: GP = { id: uid(), x: midx + nx, y: midy + ny, label: nextLabel(base.pts) }
        const b2: GP = { id: uid(), x: midx - nx, y: midy - ny, label: nextLabel([...base.pts, b1]) }
        return { ...base, pts: [...base.pts, b1, b2], segs: [...base.segs, { id: uid(), p1: b1.id, p2: b2.id, dashed: true }] }
      }
      if (tool === 'bisector') {
        const p1 = base.pts.find(p => p.id === id0)!
        const v  = base.pts.find(p => p.id === id1)!
        const p2 = base.pts.find(p => p.id === id2)!
        const dx1 = p1.x - v.x, dy1 = p1.y - v.y
        const dx2 = p2.x - v.x, dy2 = p2.y - v.y
        const l1 = Math.hypot(dx1, dy1) || 1, l2 = Math.hypot(dx2, dy2) || 1
        const bx = dx1 / l1 + dx2 / l2, by = dy1 / l1 + dy2 / l2
        const lb = Math.hypot(bx, by) || 1
        const endId = uid()
        const endPt: GP = { id: endId, x: v.x + bx / lb * EXTENT, y: v.y + by / lb * EXTENT, label: nextLabel(base.pts) }
        return { ...base, pts: [...base.pts, endPt], rays: [...base.rays, { id: uid(), p1: id1, p2: endId, color: currentColor }] }
      }
      return base
    })
    setPending([])
  }

  // ── Dynamic grid ────────────────────────────────────────────────────────
  const iMin = Math.floor(-ox / gridPx) - 1
  const iMax = Math.ceil((W - ox) / gridPx) + 1
  const jMin = Math.floor((oy - H) / gridPx) - 1
  const jMax = Math.ceil(oy / gridPx) + 1
  const gridEls: React.ReactNode[] = []
  for (let i = iMin; i <= iMax; i++) {
    const sx = ox + i * gridPx
    gridEls.push(<line key={`gv${i}`} x1={sx} y1={0} x2={sx} y2={H}
      stroke={i === 0 ? GEO : 'rgba(180,140,80,0.13)'} strokeWidth={i === 0 ? 1.5 : 1} />)
  }
  for (let j = jMin; j <= jMax; j++) {
    const sy = oy - j * gridPx
    gridEls.push(<line key={`gh${j}`} x1={0} y1={sy} x2={W} y2={sy}
      stroke={j === 0 ? GEO : 'rgba(180,140,80,0.13)'} strokeWidth={j === 0 ? 1.5 : 1} />)
  }
  const axisLabels: React.ReactNode[] = []
  if (gridPx > 16) {
    for (let i = iMin; i <= iMax; i++) {
      if (i === 0) continue
      const sx = ox + i * gridPx
      if (sx > 4 && sx < W - 4)
        axisLabels.push(<text key={`lx${i}`} x={sx} y={oy + 13} textAnchor="middle" fontSize={8} fill={GEO_L} opacity={0.5}>{i}</text>)
    }
    for (let j = jMin; j <= jMax; j++) {
      if (j === 0) continue
      const sy = oy - j * gridPx
      if (sy > 4 && sy < H - 4)
        axisLabels.push(<text key={`ly${j}`} x={ox - 6} y={sy + 3} textAnchor="end" fontSize={8} fill={GEO_L} opacity={0.5}>{j}</text>)
    }
  }

  // ── Preview ────────────────────────────────────────────────────────────
  let preview: React.ReactNode = null
  if (cursor && pending.length > 0 && tool !== 'poly') {
    try {
      const last = gp(pending[pending.length - 1])
      const ls = ms(last), cs = mathToSvg(cursor.x, cursor.y)
      if (tool === 'circle' && pending.length === 1) {
        const r = Math.hypot(cursor.x - last.x, cursor.y - last.y) * gridPx
        preview = <circle cx={ls.x} cy={ls.y} r={r} fill="none" stroke={AC} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.45} />
      } else if (tool === 'line') {
        const clipped = clipLineToViewport(ls.x, ls.y, cs.x, cs.y)
        if (clipped) preview = <line x1={clipped[0].x} y1={clipped[0].y} x2={clipped[1].x} y2={clipped[1].y} stroke={AC} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.45} />
      } else {
        preview = <line x1={ls.x} y1={ls.y} x2={cs.x} y2={cs.y} stroke={AC} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.45} />
      }
    } catch { /* skip */ }
  }

  // Polygon build preview
  let polyPreview: React.ReactNode = null
  if (tool === 'poly' && pending.length >= 1 && cursor) {
    try {
      const svgPts = pending.map(id => ms(gp(id)))
      const curSvg = mathToSvg(cursor.x, cursor.y)
      const allPts = [...svgPts, curSvg]
      const pointsStr = allPts.map(p => `${p.x},${p.y}`).join(' ')
      polyPreview = (
        <g style={{ pointerEvents: 'none' }}>
          {pending.length >= 2 && <polygon points={pointsStr} fill={currentColor} fillOpacity={0.08} stroke={currentColor} strokeWidth={1} strokeDasharray="5 3" />}
          {pending.length < 2 && <line x1={svgPts[svgPts.length-1].x} y1={svgPts[svgPts.length-1].y} x2={curSvg.x} y2={curSvg.y} stroke={AC} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.45} />}
        </g>
      )
    } catch { /* skip */ }
  }

  // Parallel/perpto ghost preview
  if (cursor && pendingSeg && (tool === 'parallel' || tool === 'perpto')) {
    const dir = getLinearDir(pendingSeg)
    if (dir) {
      const len = Math.hypot(dir.dx, dir.dy) || 1
      const ux = (tool === 'parallel' ? dir.dx / len : -dir.dy / len) * EXTENT
      const uy = (tool === 'parallel' ? dir.dy / len :  dir.dx / len) * EXTENT
      const c1 = mathToSvg(cursor.x + ux, cursor.y + uy)
      const c2 = mathToSvg(cursor.x - ux, cursor.y - uy)
      preview = <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke={AC} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.5} />
    }
  }

  // ── Measurements ───────────────────────────────────────────────────────
  const measures: React.ReactNode[] = []
  st.segs.forEach(s => {
    try {
      const p1 = gp(s.p1), p2 = gp(s.p2)
      measures.push(<div key={s.id} style={mCard()}>
        <div style={{ fontSize: 10, color: s.color || GEO_L, fontWeight: 700 }}>|{p1.label}{p2.label}|</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sepia-text)' }}>{dist(p1, p2).toFixed(2)} u</div>
      </div>)
    } catch { /* dangling */ }
  })
  st.vectors.forEach(v => {
    try {
      const p1 = gp(v.p1), p2 = gp(v.p2)
      measures.push(<div key={v.id} style={mCard()}>
        <div style={{ fontSize: 10, color: v.color || GEO_L, fontWeight: 700 }}>→ {p1.label}{p2.label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sepia-text)' }}>{dist(p1, p2).toFixed(2)} u</div>
      </div>)
    } catch { /* dangling */ }
  })
  st.circles.forEach(c => {
    try {
      const center = gp(c.center), rPt = gp(c.rPt)
      measures.push(<div key={c.id} style={mCard()}>
        <div style={{ fontSize: 10, color: c.color || GEO_L, fontWeight: 700 }}>r ({center.label})</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sepia-text)' }}>{dist(center, rPt).toFixed(2)} u</div>
      </div>)
    } catch { /* dangling */ }
  })
  st.angles.forEach(a => {
    try {
      const p1 = gp(a.p1), v = gp(a.v), p2 = gp(a.p2)
      measures.push(<div key={a.id} style={mCard()}>
        <div style={{ fontSize: 10, color: GEO_L, fontWeight: 700 }}>∠{p1.label}{v.label}{p2.label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: AC }}>{angleDeg(p1, v, p2)}°</div>
      </div>)
    } catch { /* dangling */ }
  })
  st.polys.forEach(pg => {
    try {
      const pts = pg.pts.map(id => gp(id))
      const perimeter = pts.reduce((acc, p, i) => acc + dist(p, pts[(i + 1) % pts.length]), 0)
      const area = polyArea(pts)
      measures.push(<div key={pg.id} style={mCard()}>
        <div style={{ fontSize: 10, color: pg.color || GEO_L, fontWeight: 700 }}>⬡ {pts.length}-gono</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sepia-text)' }}>P: {perimeter.toFixed(2)} u</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: AC }}>A: {area.toFixed(2)} u²</div>
      </div>)
    } catch { /* dangling */ }
  })

  // ── Enviar a Ikaro ─────────────────────────────────────────────────────
  // ── Persistencia: guardar ─────────────────────────────────────────────
  async function handleSave() {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      const endpoint = currentSavedId ? `/geo/${currentSavedId}` : '/geo/guardar'
      const method = currentSavedId ? 'put' : 'post'
      const res = await api[method](endpoint, { nombre: saveName.trim(), data: st })
      setCurrentSavedId(res.data.id)
      setShowSave(false)
      setSaveToast(`"${res.data.nombre}" guardado`)
      setTimeout(() => setSaveToast(null), 2500)
    } catch {
      setSaveToast('Error al guardar')
      setTimeout(() => setSaveToast(null), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function fetchSavedList() {
    setLoadingList(true)
    try {
      const res = await api.get('/geo/lista')
      setSavedList(res.data)
    } catch { /* ignore */ }
    finally { setLoadingList(false) }
  }

  function openLoadPanel() {
    setShowLoad(true)
    setConfirmLoad(null)
    fetchSavedList()
  }

  async function doLoad(item: SavedItem) {
    try {
      const res = await api.get(`/geo/${item.id}`)
      pushHistory(st)
      setSt(res.data.data as GState)
      setCurrentSavedId(item.id)
      setSaveName(item.nombre)
      setPending([]); setPendingSeg(null)
      setShowLoad(false)
      setConfirmLoad(null)
      setTimeout(() => fitAll((res.data.data as GState).pts), 50)
    } catch { /* ignore */ }
  }

  async function doDelete(id: string) {
    try {
      await api.delete(`/geo/${id}`)
      setSavedList(prev => prev.filter(x => x.id !== id))
      if (currentSavedId === id) setCurrentSavedId(null)
    } catch { /* ignore */ }
  }

  function enviarAIkaro() {
    if (!svgRef.current) return
    const svgStr = new XMLSerializer().serializeToString(svgRef.current)
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#FFF8EC'; ctx.fillRect(0, 0, W, H)
      ctx.drawImage(img, 0, 0)
      const base64 = canvas.toDataURL('image/png')
      const ptLabels = st.pts.map(p => `${p.label}(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(', ')
      const hint = `Analiza esta construcción geométrica.${ptLabels ? ` Puntos: ${ptLabels}.` : ''} ¿Es correcta? ¿Qué propiedades puedes identificar?`
      setPendingChatImage({ base64, filename: 'geo-mathos.png', mime: 'image/png', hint })
      navigate(selectedMateriaId ? `/materia/${selectedMateriaId}` : '/')
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)))
  }

  // ── Export PNG ─────────────────────────────────────────────────────────
  function exportPNG() {
    if (!svgRef.current) return
    const svgStr = new XMLSerializer().serializeToString(svgRef.current)
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#FFF8EC'; ctx.fillRect(0, 0, W, H)
      ctx.drawImage(img, 0, 0)
      const a = document.createElement('a')
      a.download = 'geo-mathos.png'; a.href = canvas.toDataURL(); a.click()
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)))
  }

  // ── Tools & hints ──────────────────────────────────────────────────────
  const TOOLS: { id: Tool; icon: any; label: string; hint: string }[] = [
    { id: 'select',    icon: <MousePointer2 size={18} strokeWidth={2.5} />,  label: 'Mover',      hint: 'Arrastra puntos. Shift+drag = pan' },
    { id: 'point',     icon: <CircleIcon size={18} strokeWidth={2.5} />,  label: 'Punto',      hint: 'Clic para crear punto' },
    { id: 'segment',   icon: <Minus size={18} strokeWidth={2.5} />,  label: 'Segmento',   hint: '2 clics: extremos' },
    { id: 'line',      icon: <SquareSlash size={18} strokeWidth={2.5} />,  label: 'Recta∞',     hint: '2 clics: define la recta infinita' },
    { id: 'ray',       icon: <ArrowRight size={18} strokeWidth={2.5} />,  label: 'Semirrecta', hint: '2 clics: origen → dirección' },
    { id: 'vector',    icon: <ArrowRightCircle size={18} strokeWidth={2.5} />,  label: 'Vector',     hint: '2 clics: cola → punta' },
    { id: 'circle',    icon: <CircleIcon size={18} strokeWidth={2.5} />,  label: 'Círculo',    hint: '2 clics: centro → borde' },
    { id: 'poly',      icon: <Grid3X3 size={18} strokeWidth={2.5} />,  label: 'Polígono',   hint: 'N clics + clic en 1° vértice para cerrar' },
    { id: 'midpoint',  icon: <Focus size={18} strokeWidth={2.5} />,  label: 'Pto. medio', hint: '2 clics: extremos' },
    { id: 'perp',      icon: <Move size={18} strokeWidth={2.5} />,  label: 'Mediatriz',  hint: '2 clics: extremos del segmento' },
    { id: 'parallel',  icon: <Minus size={18} strokeWidth={2.5} />,  label: 'Paralela',   hint: 'Segmento → punto de paso' },
    { id: 'perpto',    icon: <Move size={18} strokeWidth={2.5} />,  label: 'Perp.',      hint: 'Segmento → punto de paso' },
    { id: 'angle',     icon: <Calculator size={18} strokeWidth={2.5} />,  label: 'Ángulo',     hint: '3 clics: rayo, vértice, rayo' },
    { id: 'bisector',  icon: <Calculator size={18} strokeWidth={2.5} />,  label: 'Bisectriz',  hint: '3 clics: rayo, vértice, rayo' },
    { id: 'intersect', icon: <Focus size={18} strokeWidth={2.5} />,  label: 'Intersec.',  hint: 'Clic 2 segmentos/rectas → punto cruce' },
    { id: 'delete',      icon: <Trash2 size={18} strokeWidth={2.5} />,  label: 'Borrar',       hint: 'Clic sobre objeto para borrarlo' },
    { id: 'reflect_line', icon: <RefreshCcw size={18} strokeWidth={2.5} />, label: 'Ref.Recta',   hint: 'Clic en recta/seg. espejo → clic en puntos' },
    { id: 'reflect_pt',   icon: <RefreshCcw size={18} strokeWidth={2.5} />, label: 'Ref.Punto',   hint: 'Centro de simetría → clic en puntos' },
    { id: 'rotate',       icon: <RotateCcw size={18} strokeWidth={2.5} />, label: 'Rotar',        hint: 'Centro de rotación → clic en puntos (θ en barra)' },
    { id: 'translate',    icon: <ArrowRight size={18} strokeWidth={2.5} />, label: 'Trasladar',   hint: 'Clic en vector → clic en puntos' },
  ]

  const STEP_HINTS: Partial<Record<Tool, string[]>> = {
    segment:   ['Primer extremo', 'Segundo extremo'],
    line:      ['Primer punto de la recta', 'Segundo punto'],
    ray:       ['Punto de origen', 'Punto de dirección'],
    vector:    ['Cola (inicio)', 'Punta (fin)'],
    circle:    ['Centro', 'Punto en la circunferencia'],
    midpoint:  ['Primer extremo', 'Segundo extremo'],
    perp:      ['Primer extremo', 'Segundo extremo'],
    angle:     ['Punto del primer rayo', 'Vértice', 'Punto del segundo rayo'],
    bisector:  ['Punto del primer rayo', 'Vértice', 'Punto del segundo rayo'],
    intersect:    ['Clic en el primer segmento/recta', 'Clic en el segundo'],
    parallel:     ['Clic en segmento/recta de referencia', 'Clic en punto de paso'],
    perpto:       ['Clic en segmento/recta de referencia', 'Clic en punto de paso'],
    poly:         ['Primer vértice', 'Siguiente vértice (sigue clicando)', 'Clic en 1° vértice para cerrar'],
    reflect_line: ['Clic en segmento/recta espejo', 'Clic en punto a reflejar (repite para más)'],
    reflect_pt:   ['Clic en centro de simetría', 'Clic en punto a reflejar (repite para más)'],
    rotate:       ['Clic en centro de rotación', 'Clic en punto a rotar (repite para más)'],
    translate:    ['Clic en vector de traslación', 'Clic en punto a trasladar (repite para más)'],
  }

  const isLinearTool = (['intersect', 'parallel', 'perpto', 'reflect_line', 'translate'] as Tool[]).includes(tool)
  const currentStep = isLinearTool
    ? (pendingSeg === null ? 0 : 1)
    : tool === 'poly'
      ? (pending.length === 0 ? 0 : pending.length === 1 ? 1 : 2)
      : pending.length
  const stepHint = STEP_HINTS[tool]?.[currentStep]
  const svgCursor = isPanning ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair'

  const totalObjects = st.segs.length + st.circles.length + st.angles.length +
    st.lines.length + st.rays.length + st.vectors.length + st.polys.length

  // ── Function / implicit-curve paths (recomputed each render — zoom/pan dependent) ────
  const fnPaths = (st.fns ?? []).map(fn => {
    const xMin = svgToMath(0, 0).x
    const xMax = svgToMath(W, 0).x
    if (fn.implicit) {
      const yMin = svgToMath(0, H).y   // bottom of viewport in math coords
      const yMax = svgToMath(0, 0).y   // top of viewport in math coords
      const d = implicitSVGPath(
        (x, y) => evalImplicit(fn.expr, x, y),
        mathToSvg, xMin, xMax, yMin, yMax, 200, 130
      )
      return { ...fn, d }
    }
    // Explicit f(x)
    const N = 700
    const dMin = fn.domain ? Math.max(xMin, fn.domain[0]) : xMin
    const dMax = fn.domain ? Math.min(xMax, fn.domain[1]) : xMax
    if (dMin > dMax) return { ...fn, d: '' }

    const step = (dMax - dMin) / N
    let d = ''
    let prevSy: number | null = null
    for (let i = 0; i <= N; i++) {
      const fx = dMin + i * step
      const fy = evalFn(fn.expr, fx)
      if (fy === null) { prevSy = null; continue }
      const { x: sx, y: sy } = mathToSvg(fx, fy)
      const jump = prevSy !== null && Math.abs(sy - prevSy) > H * 2
      if (prevSy === null || jump) {
        d += `M${sx.toFixed(1)},${sy.toFixed(1)} `
      } else {
        d += `L${sx.toFixed(1)},${sy.toFixed(1)} `
      }
      prevSy = sy
    }
    return { ...fn, d }
  })

  // ── Algebra View list preparations ──────────────────────────────────────
  const ptItems = st.pts.map(p => ({
    type: 'pts' as const,
    id: p.id,
    label: p.label,
    definition: `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`,
    value: null,
    hidden: !!p.hidden,
  }))

  const fnItems = (st.fns ?? []).map(fn => {
    const domStr = fn.domain ? ` en [${fn.domain[0].toFixed(2)}, ${fn.domain[1].toFixed(2)}]` : ''
    return {
      type: 'fns' as const,
      id: fn.id,
      label: fn.implicit ? 'C' : 'f(x)',
      definition: `${fn.expr}${domStr}`,
      value: null,
      hidden: !!fn.hidden,
      color: fn.color,
    }
  })

  const segItems = st.segs.map(s => {
    let label = 'Segmento'
    let def = 'Segmento(?, ?)'
    let val = null
    try {
      const p1 = gp(s.p1), p2 = gp(s.p2)
      label = `${p1.label}${p2.label}`
      def = `Segmento(${p1.label}, ${p2.label})`
      val = `${dist(p1, p2).toFixed(2)} u`
    } catch { /* dangling */ }
    return {
      type: 'segs' as const,
      id: s.id,
      label,
      definition: def,
      value: val,
      hidden: !!s.hidden,
      color: s.color,
    }
  })

  const lineItems = st.lines.map(l => {
    let label = 'Recta'
    let def = 'Recta(?, ?)'
    try {
      const p1 = gp(l.p1), p2 = gp(l.p2)
      label = `recta ${p1.label}${p2.label}`
      def = `Recta(${p1.label}, ${p2.label})`
    } catch { /* dangling */ }
    return {
      type: 'lines' as const,
      id: l.id,
      label,
      definition: def,
      value: null,
      hidden: !!l.hidden,
      color: l.color,
    }
  })

  const rayItems = st.rays.map(r => {
    let label = 'Semirrecta'
    let def = 'Semirrecta(?, ?)'
    try {
      const p1 = gp(r.p1), p2 = gp(r.p2)
      label = `semirrecta ${p1.label}${p2.label}`
      def = `Semirrecta(${p1.label}, ${p2.label})`
    } catch { /* dangling */ }
    return {
      type: 'rays' as const,
      id: r.id,
      label,
      definition: def,
      value: null,
      hidden: !!r.hidden,
      color: r.color,
    }
  })

  const vectorItems = st.vectors.map(v => {
    let label = 'Vector'
    let def = 'Vector(?, ?)'
    let val = null
    try {
      const p1 = gp(v.p1), p2 = gp(v.p2)
      label = `vector ${p1.label}${p2.label}`
      def = `Vector(${p1.label}, ${p2.label})`
      val = `${dist(p1, p2).toFixed(2)} u`
    } catch { /* dangling */ }
    return {
      type: 'vectors' as const,
      id: v.id,
      label,
      definition: def,
      value: val,
      hidden: !!v.hidden,
      color: v.color,
    }
  })

  const circleItems = st.circles.map(c => {
    let label = 'Círculo'
    let def = 'Círculo(?, ?)'
    let val = null
    try {
      const center = gp(c.center), rPt = gp(c.rPt)
      label = `círculo ${center.label}`
      def = `Círculo(${center.label}, ${rPt.label})`
      val = `r = ${dist(center, rPt).toFixed(2)} u`
    } catch { /* dangling */ }
    return {
      type: 'circles' as const,
      id: c.id,
      label,
      definition: def,
      value: val,
      hidden: !!c.hidden,
      color: c.color,
    }
  })

  const angleItems = st.angles.map(a => {
    let label = 'Ángulo'
    let def = 'Ángulo(?, ?, ?)'
    let val = null
    try {
      const p1 = gp(a.p1), v = gp(a.v), p2 = gp(a.p2)
      label = `∠${p1.label}${v.label}${p2.label}`
      def = `Ángulo(${p1.label}, ${v.label}, ${p2.label})`
      val = `${angleDeg(p1, v, p2)}°`
    } catch { /* dangling */ }
    return {
      type: 'angles' as const,
      id: a.id,
      label,
      definition: def,
      value: val,
      hidden: !!a.hidden,
    }
  })

  const polyItems = st.polys.map(pg => {
    let label = 'Polígono'
    let def = 'Polígono(…)'
    let val = null
    try {
      const pts = pg.pts.map(id => gp(id))
      label = `${pts.length}-gono`
      def = `Polígono(${pts.map(p => p.label).join(', ')})`
      val = `A = ${polyArea(pts).toFixed(2)} u²`
    } catch { /* dangling */ }
    return {
      type: 'polys' as const,
      id: pg.id,
      label,
      definition: def,
      value: val,
      hidden: !!pg.hidden,
      color: pg.color,
    }
  })

  const renderAlgebraItem = (
    type: keyof GState,
    id: string,
    label: string,
    definition: string,
    value: string | null,
    hidden: boolean,
    color?: string
  ) => {
    const isEditing = editingObj?.type === type && editingObj?.id === id
    const activeColor = color || GEO
    return (
      <div
        key={id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          borderRadius: 8,
          background: 'var(--sepia-bg)',
          border: '1px solid var(--sepia-border)',
          marginBottom: 4,
          fontSize: 12,
        }}
      >
        <button
          onClick={() => toggleVisibility(type, id)}
          title={hidden ? 'Mostrar objeto' : 'Ocultar objeto'}
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: `2px solid ${activeColor}`,
            background: hidden ? 'transparent' : activeColor,
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <input
              autoFocus
              value={editingObj.val}
              onChange={e => setEditingObj({ ...editingObj, val: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter') saveAlgebraEdit()
                if (e.key === 'Escape') setEditingObj(null)
              }}
              onBlur={saveAlgebraEdit}
              style={{
                width: '100%',
                fontSize: 11,
                fontFamily: 'monospace',
                padding: '2px 4px',
                border: `1.5px solid ${AC}`,
                borderRadius: 4,
                background: 'white',
                color: 'black',
                outline: 'none',
              }}
            />
          ) : (
            <div
              onDoubleClick={() => startAlgebraEdit(type, id, definition, label)}
              style={{ cursor: (type === 'pts' || type === 'fns') ? 'pointer' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={(type === 'pts' || type === 'fns') ? 'Doble clic para editar' : undefined}
            >
              <strong style={{ color: activeColor }}>{label}</strong>
              <span style={{ color: 'var(--sepia-text)', fontFamily: 'monospace', marginLeft: 4 }}>
                = {definition}
              </span>
              {value && (
                <span style={{ color: AC, fontSize: 10, marginLeft: 6, fontWeight: 600 }}>
                  ({value})
                </span>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => deleteObject(type, id)}
          title="Eliminar"
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: '#DC2626',
            fontSize: 13,
            padding: '0 4px',
            opacity: 0.7,
          }}
        >
          🗑
        </button>
      </div>
    )
  }

  const renderAlgebraGroup = (
    title: string,
    key: string,
    items: {
      type: keyof GState
      id: string
      label: string
      definition: string
      value: string | null
      hidden: boolean
      color?: string
    }[]
  ) => {
    if (items.length === 0) return null
    const isCollapsed = collapsedGroups[key]
    return (
      <div key={key} style={{ marginBottom: 12 }}>
        <button
          onClick={() => toggleGroup(key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            padding: '4px 8px',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--sepia-text-secondary)', letterSpacing: '.06em' }}>
            {title} ({items.length})
          </span>
          <span style={{ fontSize: 10, color: 'var(--sepia-text-secondary)', marginLeft: 'auto' }}>
            {isCollapsed ? '►' : '▼'}
          </span>
        </button>
        {!isCollapsed && (
          <div style={{ paddingLeft: 4, paddingRight: 4 }}>
            {items.map(item =>
              renderAlgebraItem(
                item.type,
                item.id,
                item.label,
                item.definition,
                item.value,
                item.hidden,
                item.color
              )
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-white dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100">

      <GeoMathosHeader
        stepHint={stepHint}
        tool={tool}
        rotateAngle={rotateAngle}
        setRotateAngle={setRotateAngle}
        pendingCount={pending.length}
        closePoly={closePoly}
        snapGrid={snapGrid}
        toggleSnapGrid={() => setSnapGrid(s => !s)}
        undo={undo}
        clearAll={() => { pushHistory(st); setSt(EMPTY); setPending([]); setPendingSeg(null); setCurrentSavedId(null); setSaveName('') }}
        exportPNG={exportPNG}
        ptsCount={st.pts.length}
        setShowSave={setShowSave}
        saveName={saveName}
        setSaveName={setSaveName}
        currentSavedId={currentSavedId}
        openLoadPanel={openLoadPanel}
        enviarAIkaro={enviarAIkaro}
      />

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative bg-zinc-50 dark:bg-zinc-950">

        {/* Sidebar Tools */}
        <GeoMathosToolsSidebar
          tool={tool}
          changeTool={changeTool}
          TOOLS={TOOLS}
          currentColor={currentColor}
          setCurrentColor={setCurrentColor}
          COLOR_PRESETS={COLOR_PRESETS}
        />

        {/* Canvas Area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative bg-white dark:bg-[#09090b]">
          <div className="flex-1 min-h-0 overflow-hidden relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-full block touch-none"
              style={{ cursor: svgCursor }}
              onMouseMove={onSVGMove}
              onMouseUp={onSVGUp}
              onMouseLeave={onSVGLeave}
              onMouseDown={onSVGDown}
              onWheel={onWheel}
              onTouchStart={onSVGTouchStart}
              onTouchMove={onSVGTouchMove}
              onTouchEnd={onSVGTouchEnd}
            >
              <rect x={0} y={0} width={W} height={H} fill="transparent" />
              {gridEls}
              {axisLabels}

              {/* Infinite lines (clipped to viewport) */}
              {st.lines.filter(l => !l.hidden).map(l => {
                try {
                  const p1 = gp(l.p1), p2 = gp(l.p2)
                  const s1 = ms(p1), s2 = ms(p2)
                  const clipped = clipLineToViewport(s1.x, s1.y, s2.x, s2.y)
                  if (!clipped) return null
                  const col = l.color || GEO
                  return (
                    <g key={l.id}>
                      <line x1={clipped[0].x} y1={clipped[0].y} x2={clipped[1].x} y2={clipped[1].y}
                        stroke="transparent" strokeWidth={14}
                        style={{ cursor: ['delete','intersect','parallel','perpto'].includes(tool) ? 'pointer' : 'default' }}
                        onMouseDown={e => onLineDown(e, l.id)} />
                      <line x1={clipped[0].x} y1={clipped[0].y} x2={clipped[1].x} y2={clipped[1].y}
                        stroke={l.id === pendingSeg ? AC : col} strokeWidth={l.id === pendingSeg ? 3 : 2}
                        strokeDasharray="12 6" style={{ pointerEvents: 'none' }} opacity={0.8} />
                    </g>
                  )
                } catch { return null }
              })}

              {/* Rays */}
              {st.rays.filter(r => !r.hidden).map(r => {
                try {
                  const p1 = gp(r.p1), p2 = gp(r.p2)
                  const s1 = ms(p1), s2 = ms(p2)
                  const far = clipRayToViewport(s1.x, s1.y, s2.x, s2.y)
                  if (!far) return null
                  const col = r.color || GEO
                  return (
                    <g key={r.id}>
                      <line x1={s1.x} y1={s1.y} x2={far.x} y2={far.y}
                        stroke="transparent" strokeWidth={14}
                        style={{ cursor: ['delete','parallel','perpto'].includes(tool) ? 'pointer' : 'default' }}
                        onMouseDown={e => onRayDown(e, r.id)} />
                      <line x1={s1.x} y1={s1.y} x2={far.x} y2={far.y}
                        stroke={col} strokeWidth={2.5} style={{ pointerEvents: 'none' }} />
                    </g>
                  )
                } catch { return null }
              })}

              {/* Polygons */}
              {st.polys.filter(pg => !pg.hidden).map(pg => {
                try {
                  const svgPts = pg.pts.map(id => ms(gp(id)))
                  const pointsStr = svgPts.map(p => `${p.x},${p.y}`).join(' ')
                  const col = pg.color || GEO
                  return (
                    <g key={pg.id} style={{ cursor: tool === 'delete' ? 'pointer' : 'default' }}
                       onMouseDown={e => onPolyDown(e, pg.id)}>
                      <polygon points={pointsStr} fill={col} fillOpacity={0.12} stroke={col} strokeWidth={2.5} strokeLinejoin="round" />
                    </g>
                  )
                } catch { return null }
              })}

              {/* Segments */}
              {st.segs.filter(s => !s.hidden).map(s => {
                try {
                  const p1 = gp(s.p1), p2 = gp(s.p2)
                  const s1 = ms(p1), s2 = ms(p2)
                  const smx = (s1.x + s2.x) / 2, smy = (s1.y + s2.y) / 2
                  const sel = s.id === pendingSeg
                  const col = s.color || GEO
                  return (
                    <g key={s.id}>
                      <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke="transparent" strokeWidth={14}
                        style={{ cursor: ['delete','intersect','parallel','perpto'].includes(tool) ? 'pointer' : 'default' }}
                        onMouseDown={e => onSegDown(e, s.id)} />
                      <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
                        stroke={sel ? AC : col} strokeWidth={sel ? 3.5 : 2.5} strokeLinecap="round"
                        strokeDasharray={s.dashed ? '8 6' : undefined} style={{ pointerEvents: 'none' }} />
                      <text x={smx + 8} y={smy - 8} fontSize={12} fill={sel ? AC : col} fontWeight="700" style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.8))' }}>
                        {dist(p1, p2).toFixed(2)}
                      </text>
                    </g>
                  )
                } catch { return null }
              })}

              {/* Vectors */}
              {st.vectors.filter(v => !v.hidden).map(v => {
                try {
                  const p1 = gp(v.p1), p2 = gp(v.p2)
                  const s1 = ms(p1), s2 = ms(p2)
                  const col = v.color || GEO
                  const pts = arrowHeadPoints(s1.x, s1.y, s2.x, s2.y)
                  const smx = (s1.x + s2.x) / 2, smy = (s1.y + s2.y) / 2
                  return (
                    <g key={v.id}>
                      <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke="transparent" strokeWidth={14}
                        style={{ cursor: ['delete','parallel','perpto'].includes(tool) ? 'pointer' : 'default' }}
                        onMouseDown={e => onVectorDown(e, v.id)} />
                      <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={col} strokeWidth={2.5} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                      <polygon points={pts} fill={col} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                      <text x={smx + 8} y={smy - 8} fontSize={12} fill={col} fontWeight="700" style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.8))' }}>
                        {dist(p1, p2).toFixed(2)}
                      </text>
                    </g>
                  )
                } catch { return null }
              })}

              {/* Circles */}
              {st.circles.filter(c => !c.hidden).map(c => {
                try {
                  const center = gp(c.center), rPt = gp(c.rPt)
                  const sc = ms(center), sr = ms(rPt)
                  const r = dist(center, rPt) * gridPx
                  const col = c.color || GEO
                  return (
                    <g key={c.id}>
                      <circle cx={sc.x} cy={sc.y} r={r} fill="none" stroke="transparent" strokeWidth={14}
                        style={{ cursor: ['delete', 'intersect'].includes(tool) ? 'pointer' : 'default' }}
                        onMouseDown={e => onCircleDown(e, c.id)} />
                      <circle cx={sc.x} cy={sc.y} r={r} fill="none" stroke={col} strokeWidth={2.5} opacity={0.9} style={{ pointerEvents: 'none' }} />
                      <text x={sr.x + 8} y={sr.y - 8} fontSize={12} fill={col} fontWeight="700" style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.8))' }}>
                        {dist(center, rPt).toFixed(2)}
                      </text>
                    </g>
                  )
                } catch { return null }
              })}

              {/* Angle arcs */}
              {st.angles.filter(a => !a.hidden).map(a => {
                try {
                  const p1 = gp(a.p1), v = gp(a.v), p2 = gp(a.p2)
                  const sp1 = ms(p1), sv = ms(v), sp2 = ms(p2)
                  const deg = angleDeg(p1, v, p2)
                  const isRight = Math.abs(deg - 90) < 1.5
                  const lp = angleLabelPosSvg(sp1, sv, sp2)
                  return (
                    <g key={a.id} style={{ cursor: tool === 'delete' ? 'pointer' : 'default' }} onMouseDown={e => onAngleDown(e, a.id)}>
                      <path d={isRight ? rightAnglePathSvg(sp1, sv, sp2) : angleArcPathSvg(sp1, sv, sp2)} fill="none" stroke={GEO} strokeWidth={2} />
                      <text x={lp.x} y={lp.y} fontSize={12} fill={GEO_L} fontWeight="800" textAnchor="middle" style={{ filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.8))' }}>{deg}°</text>
                    </g>
                  )
                } catch { return null }
              })}

              {fnPaths.filter(fp => !fp.hidden).map(fp => fp.d ? (
                <g key={fp.id}>
                  <path d={fp.d} fill="none" stroke="transparent" strokeWidth={16}
                    style={{ cursor: ['delete', 'intersect'].includes(tool) ? 'pointer' : 'default' }}
                    onMouseDown={() => {
                      if (tool === 'delete') { pushHistory(st); setSt(prev => ({ ...prev, fns: (prev.fns ?? []).filter(f => f.id !== fp.id) })) }
                      if (tool === 'intersect') { handleIntersectSelect(fp.id, 'fns') }
                    }}
                  />
                  <path d={fp.d} fill="none" stroke={fp.color || AC} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} style={{ pointerEvents: 'none' }} />
                </g>
              ) : null)}

              {polyPreview}
              {preview}

              {/* Points */}
              {st.pts.filter(p => !p.hidden).map(p => {
                const sp = ms(p)
                return (
                  <g key={p.id}>
                    <circle cx={sp.x} cy={sp.y} r={PT_R + 10} fill="transparent"
                      style={{ cursor: tool === 'select' ? 'move' : tool === 'delete' ? 'pointer' : 'crosshair' }}
                      onMouseDown={e => onPointDown(e, p.id)}
                      onDoubleClick={e => onPointDblClick(e, p.id)}
                      onTouchStart={e => onPointTouchStart(e, p.id)} />
                    <circle cx={sp.x} cy={sp.y} r={PT_R + 1}
                      fill={pending.includes(p.id) ? AC : (p.color || GEO)}
                      stroke="#fff" strokeWidth={2} style={{ pointerEvents: 'none' }} />
                    <text x={sp.x + 10} y={sp.y - 8} fontSize={14} fontWeight="800"
                      fill={p.color || GEO} style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.9))' }}>
                      {p.label}
                    </text>
                  </g>
                )
              })}

              {/* Snap ring */}
              {snapPt && !dragging.current && (() => {
                const sp = ms(snapPt)
                const isClose = tool === 'poly' && pending.length >= 3 && snapPt.id === pending[0]
                return <circle cx={sp.x} cy={sp.y} r={PT_R + 9} fill="none"
                  stroke={isClose ? '#10B981' : AC} strokeWidth={isClose ? 3 : 2.5} opacity={0.7} style={{ pointerEvents: 'none' }} />
              })()}

              {cursor && !snapPt && pending.length > 0 && tool !== 'select' && tool !== 'delete' && tool !== 'poly' && (() => {
                const cs = mathToSvg(cursor.x, cursor.y)
                return <circle cx={cs.x} cy={cs.y} r={4} fill={AC} opacity={0.4} style={{ pointerEvents: 'none' }} />
              })()}
            </svg>

            {/* Floating coordinate editor */}
            {editingPt && (() => {
              const pt = st.pts.find(p => p.id === editingPt.id)
              if (!pt) return null
              const sp = ms(pt)
              return (
                <div onMouseDown={e => e.stopPropagation()} className="absolute z-20 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-2xl animate-pop" style={{
                  left: `${(sp.x / W) * 100}%`, top: `${(sp.y / H) * 100}%`,
                  transform: 'translate(-50%, calc(-100% - 16px))',
                  minWidth: 220,
                }}>
                  <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-3 flex items-center gap-2">
                    <Move size={14} className="text-indigo-500" /> Coordenadas de {pt.label}
                  </div>
                  <div className="flex gap-3 mb-3">
                    {(['xStr', 'yStr'] as const).map(k => (
                      <label key={k} className="flex items-center gap-2 flex-1">
                        <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 italic">{k === 'xStr' ? 'x' : 'y'}</span>
                        <input autoFocus={k === 'xStr'}
                          value={editingPt[k]}
                          onChange={e => setEditingPt(ep => ep ? { ...ep, [k]: e.target.value } : null)}
                          onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditingPt(null) }}
                          className="w-full text-sm px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono" />
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 justify-end mt-2">
                    <button onClick={() => setEditingPt(null)} className="px-3 py-1.5 text-xs font-bold rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
                    <button onClick={confirmEdit} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white shadow-md transition-colors">Aplicar</button>
                  </div>
                </div>
              )
            })()}

            {/* Save dialog */}
            {showSave && (
              <div className="absolute top-4 right-4 z-20 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-2xl animate-pop w-[300px]" onMouseDown={e => e.stopPropagation()}>
                <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-3 flex items-center gap-2">
                  <Save size={16} className="text-indigo-500" /> {currentSavedId ? 'Actualizar Construcción' : 'Guardar Construcción'}
                </div>
                <input
                  autoFocus
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSave(false) }}
                  placeholder="Nombre de la construcción…"
                  className="w-full text-sm px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 mb-4 transition-all"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowSave(false)} className="px-4 py-2 text-xs font-bold rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
                  <button onClick={handleSave} disabled={saving || !saveName.trim()} className="px-5 py-2 text-xs font-bold rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white shadow-md transition-all disabled:opacity-50">
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}

            {/* Save toast */}
            {saveToast && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-5 py-2.5 rounded-full text-sm font-bold shadow-xl flex items-center gap-2 animate-fab-in">
                <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">✓</div> {saveToast}
              </div>
            )}
          </div>

          {/* Floating Command Bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-11/12 max-w-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl flex items-center gap-3 p-2 z-20">
            {cmdError && (
              <div className="absolute bottom-[calc(100%+12px)] left-0 bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-3 animate-pop">
                <span>⚠️ {cmdError}</span>
                <button onClick={() => setCmdError(null)} className="opacity-80 hover:opacity-100">×</button>
              </div>
            )}

            <button
              onClick={() => setShowMathKb(!showMathKb)}
              title="Teclado Matemático"
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${showMathKb ? 'bg-indigo-500 text-white shadow-md' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
            >
              <Keyboard size={18} />
            </button>
            
            <div className="flex-1 flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-xl">
              <span className="text-zinc-400 font-bold text-sm">❯</span>
              <input
                ref={cmdInputRef}
                value={cmdInput}
                onChange={e => { setCmdInput(e.target.value); setCmdError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') runCommand() }}
                placeholder="A=(2, 3) · f(x)=sin(x) · Segmento(A, B)"
                className="flex-1 bg-transparent border-none outline-none text-sm font-mono text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500"
              />
            </div>
            <button onClick={runCommand} className="w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white shadow-md transition-all">
              <ArrowRight size={18} />
            </button>
            <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1" />
            
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              <button onClick={() => setZoom(z => Math.max(0.01, z / 1.25))} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-white dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                <Minus size={14} />
              </button>
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 w-12 text-center font-mono">
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom(z => Math.min(50, z * 1.25))} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-white dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                <ZoomIn size={14} />
              </button>
            </div>
            <button onClick={() => fitAll()} title="Ajustar vista" className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
              <Maximize size={16} />
            </button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} title="Restablecer" className="px-3 h-10 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-bold transition-colors">
              1:1
            </button>
          </div>
        </div>

        {/* Load panel overlay */}
        {showLoad && (
          <div className="absolute inset-0 z-50 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center" onClick={() => { setShowLoad(false); setConfirmLoad(null) }}>
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 w-[480px] max-w-[90vw] max-h-[80vh] flex flex-col gap-4 shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-pop" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <FolderOpen size={16} strokeWidth={2.5} />
                  </div>
                  Mis Construcciones
                </div>
                <button onClick={() => { setShowLoad(false); setConfirmLoad(null) }} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
              
              {loadingList ? (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-3">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-semibold">Cargando...</span>
                </div>
              ) : savedList.length === 0 ? (
                <div className="py-12 text-center text-sm font-semibold text-zinc-400">
                  No hay construcciones guardadas todavía.
                </div>
              ) : (
                <div className="overflow-y-auto flex flex-col gap-3 pr-2 custom-scrollbar">
                  {savedList.map(item => (
                    <div key={item.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${currentSavedId === item.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 hover:border-zinc-200 dark:hover:border-zinc-700'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">{item.nombre}</div>
                        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900">{item.n_puntos} pts</span>
                          <span className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900">{item.n_objetos} obj</span>
                          <span className="truncate opacity-70">{item.preview}</span>
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-2">
                          {new Date(item.created_at).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {confirmLoad === item.id ? (
                          <>
                            <button onClick={() => doLoad(item)} className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-all shadow-md">
                              ¿Sí, cargar?
                            </button>
                            <button onClick={() => setConfirmLoad(null)} className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">
                              No
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              const isEmpty = st.pts.length === 0 && st.segs.length === 0 && st.circles.length === 0
                              if (isEmpty) { doLoad(item) } else { setConfirmLoad(item.id) }
                            }}
                            className="px-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm">
                            Cargar
                          </button>
                        )}
                        <button onClick={() => doDelete(item.id)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 dark:bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Vista de Álgebra panel */}
        <div className="w-80 shrink-0 flex flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl z-10 shadow-xl overflow-hidden">
          
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Calculator size={16} strokeWidth={2.5} />
            </div>
            <div className="text-sm font-extrabold tracking-tight text-zinc-900 dark:text-white">Vista de Álgebra</div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4">
            
            {/* Expression input */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-3 border border-zinc-100 dark:border-zinc-800">
              <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-wider flex items-center gap-1.5"><PlaySquare size={12}/> Entrada Libre f(x)</div>
              <div className="flex gap-2">
                <input
                  value={fnInput}
                  onChange={e => { setFnInput(e.target.value); setFnError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') addFn(); if (e.key === 'Escape') { setFnInput(''); setFnError(null) } }}
                  placeholder="sin(x) o x^2+y^2=9"
                  className="flex-1 text-sm font-mono px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                />
                <button onClick={addFn} className="w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold transition-all shadow-md">
                  +
                </button>
              </div>
              {fnError && <div className="text-xs font-semibold text-red-500 mt-2 px-1">{fnError}</div>}
              
              {st.fns && st.fns.length > 0 && (
                <div className="flex flex-col gap-2 mt-3">
                  {st.fns.map(fn => (
                    <div key={fn.id} className="flex items-center gap-3 bg-white dark:bg-zinc-900 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 group">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${fn.implicit ? 'rounded-full' : 'rounded-[4px]'}`} style={{ background: fn.color || AC }} />
                      <span className="flex-1 text-sm font-mono text-zinc-800 dark:text-zinc-200 truncate" title={fn.expr}>{fn.expr}</span>
                      <button onClick={() => { pushHistory(st); setSt(prev => ({ ...prev, fns: prev.fns.filter(f => f.id !== fn.id) })) }} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 mt-2">
              {renderAlgebraGroup('Puntos', 'pts', ptItems)}
              {renderAlgebraGroup('Segmentos', 'segs', segItems)}
              {renderAlgebraGroup('Rectas', 'lines', lineItems)}
              {renderAlgebraGroup('Semirrectas', 'rays', rayItems)}
              {renderAlgebraGroup('Vectores', 'vectors', vectorItems)}
              {renderAlgebraGroup('Círculos', 'circles', circleItems)}
              {renderAlgebraGroup('Ángulos', 'angles', angleItems)}
              {renderAlgebraGroup('Polígonos', 'polys', polyItems)}

              {(st.pts.length === 0 && (st.fns ?? []).length === 0 && totalObjects === 0) && (
                <div className="py-8 text-center px-6">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-400">
                    <Move size={20} />
                  </div>
                  <div className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">El lienzo está vacío.</div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Crea objetos para ver su álgebra aquí.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

}

function actionBtn(color: string): React.CSSProperties {
  return { padding: '5px 13px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${color}40`, background: 'transparent', color, fontSize: 12, fontWeight: 700 }
}

function mCard(): React.CSSProperties {
  return { padding: '6px 10px', borderRadius: 8, background: 'var(--sepia-bg)', border: '1px solid var(--sepia-border)' }
}
