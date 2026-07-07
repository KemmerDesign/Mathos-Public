import re

with open("frontend/src/pages/GeoMathos.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update imports
if "import { MousePointer2" not in content:
    content = content.replace(
        "import { Link, useNavigate } from 'react-router-dom'",
        "import { Link, useNavigate } from 'react-router-dom'\nimport { MousePointer2, Circle as CircleIcon, Minus, SquareSlash, ArrowRight, Grid3X3, Focus, ZoomIn, ZoomOut, Save, FolderOpen, RotateCcw, Image, Trash2, ArrowRightCircle, Move, MousePointerClick, RefreshCcw, Hand, Eye, Settings, Search, Keyboard, Info, Calculator, MessageSquare, PlaySquare, Maximize } from 'lucide-react'"
    )

# 2. Re-write the TOOLS array to use lucide icons.
tools_regex = r"const TOOLS: \{ id: Tool; icon: string; label: string; hint: string \}\[\] = \[\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\{[^\}]+},\s*\]"

new_tools = """const TOOLS: { id: Tool; icon: any; label: string; hint: string }[] = [
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
  ]"""

content = re.sub(tools_regex, new_tools, content, flags=re.MULTILINE)

# 3. Replace the JSX Render block

jsx_start = content.find("  // ── Render ─────────────────────────────────────────────────────────────")
jsx_end = content.find("\n}\n\nfunction actionBtn")

new_jsx = """  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-white dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100">

      {/* Header Glassmorphism */}
      <div className="flex items-center gap-3 px-5 py-3 shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-md z-10 shadow-sm relative">
        <div className="flex items-center gap-3 mr-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Calculator size={18} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-sm tracking-tight text-zinc-800 dark:text-zinc-100">GeoMathos</span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 dark:text-zinc-500">Geometría Dinámica</span>
          </div>
        </div>

        {stepHint && (
          <div className="ml-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 shadow-sm animate-msg-in">
            <Info size={14} /> {stepHint}
          </div>
        )}

        {tool === 'rotate' && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 italic">θ =</span>
            <input
              type="number"
              value={rotateAngle}
              onChange={e => setRotateAngle(parseFloat(e.target.value) || 0)}
              onFocus={e => e.currentTarget.select()}
              className="w-14 text-xs px-2 py-1 rounded bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-500/30 outline-none focus:ring-2 focus:ring-amber-500/40 text-zinc-800 dark:text-zinc-200 font-mono"
            />
            <span className="text-xs font-bold text-amber-600/70 dark:text-amber-400/70">°</span>
          </div>
        )}

        {tool === 'poly' && pending.length >= 3 && (
          <button onClick={closePoly} className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm">
            ⬡ Cerrar polígono ({pending.length} v.)
          </button>
        )}

        <div className="flex-1" />

        {/* Global Toolbar */}
        <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-xl">
          <button
            onClick={() => setSnapGrid(s => !s)}
            title={snapGrid ? 'Snap activo' : 'Snap inactivo'}
            className={`p-2 rounded-lg transition-all flex items-center justify-center ${snapGrid ? 'bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700'}`}
          >
            <Grid3X3 size={18} />
          </button>
          <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
          <button onClick={undo} className="p-2 rounded-lg transition-all text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700" title="Deshacer">
            <RotateCcw size={18} />
          </button>
          <button onClick={() => { pushHistory(st); setSt(EMPTY); setPending([]); setPendingSeg(null); setCurrentSavedId(null); setSaveName('') }} className="p-2 rounded-lg transition-all text-red-500 hover:text-red-600 hover:bg-white dark:hover:bg-zinc-700" title="Limpiar todo">
            <Trash2 size={18} />
          </button>
          <button onClick={exportPNG} className="p-2 rounded-lg transition-all text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700" title="Exportar PNG">
            <Image size={18} />
          </button>
        </div>

        {st.pts.length > 0 && (
          <button
            onClick={() => { setShowSave(s => !s); if (!saveName) setSaveName(currentSavedId ? '' : `Construcción ${new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'short' })}`) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${currentSavedId ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-zinc-800 hover:bg-zinc-900 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900'}`}
          >
            <Save size={14} /> {currentSavedId ? 'Guardar' : 'Guardar…'}
          </button>
        )}
        <button onClick={openLoadPanel} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
          <FolderOpen size={14} /> Abrir
        </button>

        {st.pts.length > 0 && (
          <button onClick={enviarAIkaro} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-md shadow-indigo-500/20">
            <MessageSquare size={14} /> Consultar a Ikaro
          </button>
        )}

        <Link to="/" className="flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 ml-2 transition-colors">
          Cerrar
        </Link>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative bg-zinc-50 dark:bg-zinc-950">

        {/* Sidebar Tools */}
        <div className="w-[72px] shrink-0 flex flex-col items-center py-4 border-r border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl overflow-y-auto z-10 custom-scrollbar gap-2">
          {([
            { ids: ['select', 'point', 'delete'] as Tool[] },
            { ids: ['segment', 'line', 'ray', 'vector'] as Tool[] },
            { ids: ['circle', 'poly'] as Tool[] },
            { ids: ['midpoint', 'perp', 'parallel', 'perpto', 'angle', 'bisector', 'intersect'] as Tool[] },
            { ids: ['reflect_line', 'reflect_pt', 'rotate', 'translate'] as Tool[] },
          ] as { ids: Tool[] }[]).map((group, gi) => (
            <div key={gi} className="flex flex-col items-center gap-1.5 mb-2 w-full px-2">
              {group.ids.map(id => {
                const t = TOOLS.find(tt => tt.id === id)!
                const active = tool === t.id
                return (
                  <button key={t.id} onClick={() => changeTool(t.id)}
                    title={`${t.label} — ${t.hint}`}
                    className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-200 relative group
                      ${active 
                        ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30' 
                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
                  >
                    {t.icon}
                    {/* Tooltip on hover */}
                    <div className="absolute left-[calc(100%+8px)] px-3 py-1.5 bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity shadow-xl z-50">
                      {t.label}
                    </div>
                  </button>
                )
              })}
              {gi < 4 && <div className="w-8 h-px bg-zinc-200 dark:bg-zinc-800 my-1" />}
            </div>
          ))}
          
          <div className="flex-1" />
          
          {/* Color Picker inside Sidebar */}
          <div className="w-full px-2 flex flex-col items-center gap-2 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <div className="grid grid-cols-2 gap-2">
              {COLOR_PRESETS.map(c => (
                <button key={c} onClick={() => setCurrentColor(c)}
                  className={`w-5 h-5 rounded-full transition-all flex-shrink-0 ${currentColor === c ? 'ring-2 ring-offset-2 ring-zinc-800 dark:ring-zinc-200 dark:ring-offset-zinc-900 scale-110' : 'hover:scale-110'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>

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
"""

content = content[:jsx_start] + new_jsx + content[jsx_end:]

with open("frontend/src/pages/GeoMathos.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Patch applied successfully.")
