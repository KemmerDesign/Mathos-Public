import React from 'react'
import type { Tool } from '../pages/GeoMathos'

interface GeoMathosToolsSidebarProps {
  tool: Tool
  changeTool: (id: Tool) => void
  TOOLS: { id: Tool; icon: any; label: string; hint: string }[]
  currentColor: string
  setCurrentColor: (color: string) => void
  COLOR_PRESETS: string[]
}

export default function GeoMathosToolsSidebar({
  tool, changeTool, TOOLS, currentColor, setCurrentColor, COLOR_PRESETS
}: GeoMathosToolsSidebarProps) {
  return (
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
  )
}
