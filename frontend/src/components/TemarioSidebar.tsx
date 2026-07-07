import { useState } from "react";
import { useStore, type Tema } from "@/services/store";
import { Link } from "react-router-dom";

const statusColor = {
  no_iniciado: { bg: '#ECE4D7', fg: '#A89C8B' },
  en_curso: { bg: '#EFEAFD', fg: '#6A45DE' },
  practicando: { bg: '#EFEAFD', fg: '#6A45DE' },
  dominado: { bg: '#E8F4ED', fg: '#2E9E63' },
};

export default function TemarioSidebar({ drawerMode = false, onClose }: { drawerMode?: boolean; onClose?: () => void } = {}) {
  const materias = useStore((s) => s.materias);
  const selectedMateriaId = useStore((s) => s.selectedMateriaId);
  const temaActualId = useStore((s) => s.temaActualId);
  const setTemaActual = useStore((s) => s.setTemaActual);
  const sidebarIzquierdoAbierto = useStore((s) => s.sidebarIzquierdoAbierto);
  const layoutEstudio = useStore((s) => s.layoutEstudio);

  const materia = materias.find((m) => m.id === selectedMateriaId);
  const [mensajePuerta, setMensajePuerta] = useState<string | null>(null);

  if ((!drawerMode && !sidebarIzquierdoAbierto) || !materia) return null;

  // Puerta de maestría: el tema anterior debe tener puntuacion >= 60
  // (equivale a 'practicando' o superior — demuestra comprensión real)
  const UMBRAL_DESBLOQUEO = 60;

  const isTemaBloqueado = (index: number): boolean => {
    if (index === 0) return false;
    const anterior = materia.temas[index - 1];
    return (anterior.puntuacion ?? 0) < UMBRAL_DESBLOQUEO && anterior.nivel !== "dominado";
  };

  const handleTemaBloqueado = (index: number) => {
    const anterior = materia.temas[index - 1];
    const actual = materia.temas[index];
    const puntuacion = Math.round(anterior.puntuacion ?? 0);
    setMensajePuerta(
      `Para abrir "${actual.nombre}" necesitas conseguir al menos ${UMBRAL_DESBLOQUEO}% en "${anterior.nombre}". Tu mejor resultado: ${puntuacion}%.`
    );
    setTimeout(() => setMensajePuerta(null), 5000);
  };

  // Glyph por materia
  const glyphMap: Record<string, { glyph: string; color: string; tint: string }> = {
    'Cálculo': { glyph: '∫', color: '#6A45DE', tint: '#EFEAFD' },
    'Programación': { glyph: '{ }', color: '#D8587F', tint: '#FCEDF3' },
    'Python': { glyph: '{ }', color: '#D8587F', tint: '#FCEDF3' },
    'Geometría': { glyph: 'Φ', color: '#D38A2C', tint: '#FBEFDD' },
    'Física': { glyph: 'λ', color: '#2E9E63', tint: '#E8F4ED' },
    'Oracle': { glyph: '⬡', color: '#f97316', tint: '#FEF0E6' },
    'SQL': { glyph: '⬡', color: '#f97316', tint: '#FEF0E6' },
    'Ética': { glyph: 'Φ', color: '#D38A2C', tint: '#FBEFDD' },
  };
  const glyphEntry = Object.entries(glyphMap).find(([k]) => materia.nombre.includes(k));
  const { glyph, color, tint } = glyphEntry?.[1] || { glyph: materia.nombre.charAt(0), color: '#6A45DE', tint: '#EFEAFD' };

  // ─── Layout C: Rail icónico 72px (solo desktop, no en drawer tablet) ───
  if (layoutEstudio === 'C' && !drawerMode) {
    return (
      <aside
        className="shrink-0 h-full border-r border-[var(--sepia-border)] flex flex-col items-center gap-3 py-4 relative z-20"
        style={{ width: 72, background: '#FBF7F0' }}
      >
        {/* Back to home */}
        <Link
          to="/"
          title="Mis materias"
          className="w-10 h-10 rounded-[12px] bg-white border border-[var(--sepia-border)] flex items-center justify-center text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-accent)] hover:border-[#C9B6F2] transition-colors"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </Link>

        {/* Subject glyph */}
        <div
          className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[19px] font-bold font-mono flex-shrink-0"
          style={{ background: tint, color }}
        >
          {glyph}
        </div>

        <div className="w-7 h-px bg-[var(--sepia-border)]" />

        {/* Topic rails */}
        <div className="flex flex-col gap-2 items-center flex-1 overflow-y-auto custom-scrollbar py-1">
          {materia.temas.map((tema: Tema, index) => {
            const bloqueado = isTemaBloqueado(index);
            const isActive = temaActualId === tema.id;
            const st = statusColor[tema.nivel] || statusColor.no_iniciado;
            const badge = tema.nivel === 'dominado' ? '✓' : String(tema.orden);
            return (
              <button
                key={tema.id}
                onClick={() => bloqueado ? handleTemaBloqueado(index) : setTemaActual(tema.id)}
                title={tema.nombre}
                disabled={false}
                className="w-[38px] h-[38px] rounded-[11px] border-none font-mono text-[13px] font-bold transition-all cursor-pointer flex items-center justify-center"
                style={{
                  background: isActive ? tint : (tema.nivel === 'dominado' ? '#E8F4ED' : '#ECE4D7'),
                  color: isActive ? color : (tema.nivel === 'dominado' ? '#2E9E63' : '#A89C8B'),
                  boxShadow: isActive ? `0 0 0 2px ${color}` : 'none',
                  opacity: bloqueado && !isActive ? 0.6 : 1,
                  cursor: bloqueado ? 'default' : 'pointer',
                }}
              >
                {bloqueado ? '🔒' : badge}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  // ─── Layout A: Sidebar clásico 290px ───
  return (
    <aside
      className="shrink-0 h-full border-r border-[var(--sepia-border)] flex flex-col overflow-hidden shadow-2xl relative z-20"
      style={{ width: 290, background: '#FBF7F0' }}
    >
      {/* Header */}
      <div className="px-[18px] pt-5 pb-4 border-b border-[var(--sepia-border)]">
        <div className="flex items-center justify-between mb-[18px]">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-accent)] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            Mis materias
          </Link>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-[8px] flex items-center justify-center border-none cursor-pointer text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-text)] hover:bg-[#ECE4D7] transition-colors"
              style={{ background: 'transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-[42px] h-[42px] rounded-[13px] flex items-center justify-center text-[21px] font-bold font-mono flex-shrink-0"
            style={{ background: tint, color }}
          >
            {glyph}
          </div>
          <div>
            <div className="text-[16px] font-bold text-[var(--sepia-text)] leading-snug">{materia.nombre}</div>
            <div className="text-[12px] text-[var(--sepia-text-secondary)] mt-0.5">{materia.temas.length} temas</div>
          </div>
        </div>

        {/* Progress */}
        <div>
          <div className="flex justify-between text-[11.5px] font-semibold text-[var(--sepia-text-secondary)] mb-1.5">
            <span>Progreso del curso</span>
            <span style={{ color }}>{materia.progreso}%</span>
          </div>
          <div className="h-[7px] rounded-full overflow-hidden" style={{ background: '#ECE4D7' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${materia.progreso}%`, background: color }}
            />
          </div>
        </div>
      </div>

      {/* Temario list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
        <div className="text-[11px] font-bold text-[#A89C8B] uppercase tracking-[.07em] mb-2 px-2">Temario</div>
        <div className="flex flex-col gap-1">
          {materia.temas.map((tema: Tema, index) => {
            const bloqueado = isTemaBloqueado(index);
            const isActive = temaActualId === tema.id;
            const badge = tema.nivel === 'dominado' ? '✓' : String(tema.orden);
            const badgeBg = tema.nivel === 'dominado' ? '#E8F4ED' : isActive ? tint : '#ECE4D7';
            const badgeFg = tema.nivel === 'dominado' ? '#2E9E63' : isActive ? color : '#A89C8B';
            const pip = (n: number) => n <= (tema.nivel === 'dominado' ? 3 : tema.nivel === 'practicando' ? 2 : tema.nivel === 'en_curso' ? 1 : 0)
              ? color : '#E2D9CB';

            return (
              <button
                key={tema.id}
                disabled={false}
                onClick={() => bloqueado ? handleTemaBloqueado(index) : setTemaActual(tema.id)}
                className="w-full flex items-center gap-3 px-2.5 py-[9px] rounded-[12px] border-none font-sans transition-all cursor-pointer"
                style={{
                  background: isActive ? tint : 'transparent',
                  opacity: bloqueado ? 0.55 : 1,
                  cursor: bloqueado ? 'not-allowed' : 'pointer',
                }}
              >
                {/* Badge */}
                <div
                  className="w-[26px] h-[26px] rounded-[8px] flex-shrink-0 flex items-center justify-center text-[12px] font-bold"
                  style={{ background: badgeBg, color: badgeFg }}
                >
                  {bloqueado ? '🔒' : badge}
                </div>
                {/* Title + pips */}
                <div className="flex-1 min-w-0 text-left">
                  <div
                    className="text-[13px] font-semibold leading-snug truncate"
                    style={{ color: bloqueado ? '#A89C8B' : '#322B23' }}
                  >
                    {tema.nombre}
                  </div>
                  <div className="flex gap-[3px] mt-1.5">
                    <div className="w-4 h-1 rounded-full" style={{ background: pip(1) }} />
                    <div className="w-4 h-1 rounded-full" style={{ background: pip(2) }} />
                    <div className="w-4 h-1 rounded-full" style={{ background: pip(3) }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Banner puerta de maestría */}
      {mensajePuerta && (
        <div style={{
          position: 'absolute', bottom: 16, left: 8, right: 8,
          background: '#1C1410', color: '#F5ECD7',
          borderRadius: 10, padding: '10px 12px',
          fontSize: 12, lineHeight: 1.5,
          boxShadow: '0 4px 16px rgba(0,0,0,.35)',
          zIndex: 50,
        }}>
          🔒 {mensajePuerta}
        </div>
      )}
    </aside>
  );
}
