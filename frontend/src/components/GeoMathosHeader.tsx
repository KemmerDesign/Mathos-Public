import React from 'react'
import { Link } from 'react-router-dom'
import { Calculator, Info, Grid3X3, RotateCcw, Trash2, Image, Save, FolderOpen, MessageSquare } from 'lucide-react'
import type { Tool } from '../pages/GeoMathos'

interface GeoMathosHeaderProps {
  stepHint: string | null
  tool: Tool
  rotateAngle: number
  setRotateAngle: (val: number) => void
  pendingCount: number
  closePoly: () => void
  snapGrid: boolean
  toggleSnapGrid: () => void
  undo: () => void
  clearAll: () => void
  exportPNG: () => void
  ptsCount: number
  setShowSave: React.Dispatch<React.SetStateAction<boolean>>
  saveName: string
  setSaveName: (val: string) => void
  currentSavedId: string | null
  openLoadPanel: () => void
  enviarAIkaro: () => void
}

export default function GeoMathosHeader({
  stepHint, tool, rotateAngle, setRotateAngle, pendingCount, closePoly,
  snapGrid, toggleSnapGrid, undo, clearAll, exportPNG, ptsCount,
  setShowSave, saveName, setSaveName, currentSavedId, openLoadPanel, enviarAIkaro
}: GeoMathosHeaderProps) {
  return (
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

      {tool === 'poly' && pendingCount >= 3 && (
        <button onClick={closePoly} className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm">
          ⬡ Cerrar polígono ({pendingCount} v.)
        </button>
      )}

      <div className="flex-1" />

      {/* Global Toolbar */}
      <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-xl">
        <button
          onClick={toggleSnapGrid}
          title={snapGrid ? 'Snap activo' : 'Snap inactivo'}
          className={`p-2 rounded-lg transition-all flex items-center justify-center ${snapGrid ? 'bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700'}`}
        >
          <Grid3X3 size={18} />
        </button>
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <button onClick={undo} className="p-2 rounded-lg transition-all text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700" title="Deshacer">
          <RotateCcw size={18} />
        </button>
        <button onClick={clearAll} className="p-2 rounded-lg transition-all text-red-500 hover:text-red-600 hover:bg-white dark:hover:bg-zinc-700" title="Limpiar todo">
          <Trash2 size={18} />
        </button>
        <button onClick={exportPNG} className="p-2 rounded-lg transition-all text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700" title="Exportar PNG">
          <Image size={18} />
        </button>
      </div>

      {ptsCount > 0 && (
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

      {ptsCount > 0 && (
        <button onClick={enviarAIkaro} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-md shadow-indigo-500/20">
          <MessageSquare size={14} /> Consultar a Ikaro
        </button>
      )}

      <Link to="/" className="flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 ml-2 transition-colors">
        Cerrar
      </Link>
    </div>
  )
}
