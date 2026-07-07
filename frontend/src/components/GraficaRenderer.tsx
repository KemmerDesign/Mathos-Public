import { useState, useMemo } from "react";

const COLORES_TEMA = ['#6A45DE', '#E84393', '#2E9E63', '#F59E0B', '#3B82F6'];

const W = 540;
const H = 280;
const PAD = { top: 28, right: 20, bottom: 52, left: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

type TipoGrafica = 'funcion' | 'barras' | 'linea' | 'dispersion';

interface Punto { etiqueta?: string; x?: number; valor?: number; y?: number }

interface EspecGrafica {
  tipo: TipoGrafica;
  titulo?: string;
  funciones?: string[];
  etiquetas?: string[];
  colores?: string[];
  rango_x?: [number, number];
  datos?: Punto[];
  eje_x?: string;
  eje_y?: string;
}

// Safe evaluator — blocks dangerous keywords
function evalFn(expr: string, x: number): number | null {
  if (/window|document|fetch|import|require|eval|alert|confirm|prompt|globalThis/.test(expr)) return null;
  try {
    const v = new Function('x', 'Math', `"use strict";return (${expr});`)(x, Math);
    return typeof v === 'number' && isFinite(v) ? v : null;
  } catch { return null; }
}

function generarPuntos(expr: string, xMin: number, xMax: number): Array<{ x: number; y: number }> {
  const pts = [];
  for (let i = 0; i <= 300; i++) {
    const x = xMin + (i / 300) * (xMax - xMin);
    const y = evalFn(expr, x);
    if (y !== null) pts.push({ x, y });
  }
  return pts;
}

function niceTicks(min: number, max: number, n = 5): number[] {
  const range = max - min || 1;
  const rough = range / (n - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice = [1, 2, 2.5, 5, 10].map(v => v * mag).find(v => v >= rough) ?? mag;
  const start = Math.ceil(min / nice) * nice;
  const ticks: number[] = [];
  for (let t = start; t <= max + nice * 0.01; t += nice)
    ticks.push(parseFloat(t.toFixed(10)));
  return ticks;
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(1);
  return parseFloat(v.toFixed(2)).toString();
}

// ── Gráfica de funciones matemáticas ───────────────────────────────────────
function GraficaFuncion({ spec, colores }: { spec: EspecGrafica; colores: string[] }) {
  const [hoverPlotX, setHoverPlotX] = useState<number | null>(null);

  const xMin = spec.rango_x?.[0] ?? -5;
  const xMax = spec.rango_x?.[1] ?? 5;
  const fns = spec.funciones ?? [];

  const allPts = useMemo(() => fns.map(f => generarPuntos(f, xMin, xMax)), [fns, xMin, xMax]);

  const allY = allPts.flat().map(p => p.y);
  const rawYMin = Math.min(...allY);
  const rawYMax = Math.max(...allY);
  const yPad = (rawYMax - rawYMin) * 0.12 || 1;
  const yMin = rawYMin - yPad;
  const yMax = rawYMax + yPad;

  const toSvgX = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin)) * PLOT_W;
  const toSvgY = (y: number) => PAD.top + PLOT_H - ((y - yMin) / (yMax - yMin)) * PLOT_H;

  const xTicks = niceTicks(xMin, xMax, 7);
  const yTicks = niceTicks(yMin, yMax, 6);

  const zeroX = toSvgX(0);
  const zeroY = toSvgY(0);
  const showZeroY = zeroX >= PAD.left && zeroX <= PAD.left + PLOT_W;
  const showZeroX = zeroY >= PAD.top && zeroY <= PAD.top + PLOT_H;

  const hoverX = hoverPlotX !== null ? xMin + (hoverPlotX / PLOT_W) * (xMax - xMin) : null;
  const hoverYs = hoverX !== null ? fns.map(f => evalFn(f, hoverX)) : [];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', userSelect: 'none', cursor: 'crosshair' }}
      onMouseMove={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W - PAD.left;
        setHoverPlotX(px >= 0 && px <= PLOT_W ? px : null);
      }}
      onMouseLeave={() => setHoverPlotX(null)}
    >
      <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="#F8F4EE" rx="4" />

      {xTicks.map(x => (
        <line key={`gx${x}`} x1={toSvgX(x)} y1={PAD.top} x2={toSvgX(x)} y2={PAD.top + PLOT_H}
          stroke="#D8D0C4" strokeWidth="0.7" />
      ))}
      {yTicks.map(y => (
        <line key={`gy${y}`} x1={PAD.left} y1={toSvgY(y)} x2={PAD.left + PLOT_W} y2={toSvgY(y)}
          stroke="#D8D0C4" strokeWidth="0.7" />
      ))}

      {showZeroY && <line x1={zeroX} y1={PAD.top} x2={zeroX} y2={PAD.top + PLOT_H} stroke="#A09080" strokeWidth="1.2" />}
      {showZeroX && <line x1={PAD.left} y1={zeroY} x2={PAD.left + PLOT_W} y2={zeroY} stroke="#A09080" strokeWidth="1.2" />}

      {xTicks.map(x => (
        <text key={`tx${x}`} x={toSvgX(x)} y={PAD.top + PLOT_H + 16} textAnchor="middle" fontSize="9" fill="#8B7B6B">
          {fmt(x)}
        </text>
      ))}
      {yTicks.map(y => (
        <text key={`ty${y}`} x={PAD.left - 6} y={toSvgY(y) + 3} textAnchor="end" fontSize="9" fill="#8B7B6B">
          {fmt(y)}
        </text>
      ))}

      {allPts.map((pts, fi) => {
        // split at vertical discontinuities
        const segs: Array<typeof pts> = [];
        let seg: typeof pts = [];
        const span = yMax - yMin;
        for (const p of pts) {
          if (p.y < yMin - span || p.y > yMax + span) {
            if (seg.length > 1) segs.push(seg);
            seg = [];
          } else seg.push(p);
        }
        if (seg.length > 1) segs.push(seg);
        return segs.map((s, si) => (
          <polyline key={`f${fi}s${si}`}
            points={s.map(p => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ')}
            fill="none" stroke={colores[fi % colores.length]} strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"
          />
        ));
      })}

      {hoverPlotX !== null && (
        <>
          <line x1={PAD.left + hoverPlotX} y1={PAD.top} x2={PAD.left + hoverPlotX} y2={PAD.top + PLOT_H}
            stroke="#6A45DE" strokeWidth="1" strokeDasharray="4,3" opacity="0.5" />
          {hoverYs.map((y, i) => y !== null && (
            <circle key={i} cx={PAD.left + hoverPlotX} cy={toSvgY(y)}
              r="4.5" fill={colores[i % colores.length]} stroke="white" strokeWidth="1.5" />
          ))}
          {hoverX !== null && (() => {
            const tipX = Math.min(PAD.left + hoverPlotX + 8, PAD.left + PLOT_W - 90);
            const tipY = PAD.top + 14;
            const lines = [`x = ${fmt(hoverX)}`, ...hoverYs.map((y, i) => y !== null ? `y${fns.length > 1 ? i + 1 : ''} = ${fmt(y)}` : '')].filter(Boolean);
            return (
              <g>
                <rect x={tipX - 3} y={tipY - 11} width={90} height={lines.length * 12 + 4}
                  fill="white" stroke="#D8D0C4" strokeWidth="0.8" rx="3" opacity="0.95" />
                {lines.map((l, i) => (
                  <text key={i} x={tipX + 2} y={tipY + i * 12} fontSize="9.5"
                    fill={i === 0 ? '#6A45DE' : colores[(i - 1) % colores.length]} fontWeight={i === 0 ? '600' : '500'}>
                    {l}
                  </text>
                ))}
              </g>
            );
          })()}
        </>
      )}

      <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H}
        fill="none" stroke="#C8BEB0" strokeWidth="0.8" rx="4" />
    </svg>
  );
}

// ── Gráfica de barras ───────────────────────────────────────────────────────
function GraficaBarras({ spec, colores }: { spec: EspecGrafica; colores: string[] }) {
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  const datos = spec.datos ?? [];
  if (!datos.length) return null;

  const valores = datos.map(d => d.valor ?? d.y ?? 0);
  const maxVal = Math.max(...valores);
  const yTicks = niceTicks(0, maxVal * 1.1 || 1, 5);
  const topTick = Math.max(...yTicks);

  const barW = Math.max(16, Math.min(56, (PLOT_W / datos.length) * 0.55));
  const gap = PLOT_W / datos.length;
  const toSvgY = (v: number) => PAD.top + PLOT_H - (v / topTick) * PLOT_H;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', userSelect: 'none' }}>
      <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="#F8F4EE" rx="4" />

      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD.left} y1={toSvgY(v)} x2={PAD.left + PLOT_W} y2={toSvgY(v)}
            stroke="#D8D0C4" strokeWidth="0.7" />
          <text x={PAD.left - 6} y={toSvgY(v) + 3} textAnchor="end" fontSize="9" fill="#8B7B6B">{fmt(v)}</text>
        </g>
      ))}

      {datos.map((d, i) => {
        const v = d.valor ?? d.y ?? 0;
        const cx = PAD.left + gap * i + gap / 2;
        const bh = Math.max(2, (v / topTick) * PLOT_H);
        const isHov = hovIdx === i;
        const color = colores[i % colores.length];
        return (
          <g key={i} style={{ cursor: 'default' }}
            onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(null)}>
            <rect x={cx - barW / 2} y={PAD.top + PLOT_H - bh} width={barW} height={bh}
              fill={color + (isHov ? 'FF' : 'CC')} rx="3"
              style={{ transition: 'fill 0.15s, transform 0.1s' }} />
            {isHov && (
              <text x={cx} y={PAD.top + PLOT_H - bh - 5} textAnchor="middle"
                fontSize="10.5" fill={color} fontWeight="700">{fmt(v)}</text>
            )}
            <text x={cx} y={PAD.top + PLOT_H + 14} textAnchor="middle" fontSize="9" fill="#8B7B6B">
              {(d.etiqueta ?? String(i + 1)).slice(0, 11)}
            </text>
          </g>
        );
      })}

      <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H}
        stroke="#A09080" strokeWidth="1.2" />
      <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H}
        fill="none" stroke="#C8BEB0" strokeWidth="0.8" rx="4" />
    </svg>
  );
}

// ── Gráfica de línea ────────────────────────────────────────────────────────
function GraficaLinea({ spec, colores }: { spec: EspecGrafica; colores: string[] }) {
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  const datos = spec.datos ?? [];
  if (datos.length < 2) return null;

  const valores = datos.map(d => d.valor ?? d.y ?? 0);
  const maxVal = Math.max(...valores);
  const minVal = Math.min(...valores);
  const range = maxVal - minVal || 1;
  const yMin = minVal - range * 0.12;
  const yMax = maxVal + range * 0.12;
  const yTicks = niceTicks(yMin, yMax, 5);
  const color = colores[0];

  const toSvgX = (i: number) => PAD.left + (i / (datos.length - 1)) * PLOT_W;
  const toSvgY = (v: number) => PAD.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  const linePath = datos.map((d, i) => {
    const v = d.valor ?? d.y ?? 0;
    return `${i === 0 ? 'M' : 'L'}${toSvgX(i)},${toSvgY(v)}`;
  }).join(' ');

  const areaPath = `${linePath} L${toSvgX(datos.length - 1)},${PAD.top + PLOT_H} L${PAD.left},${PAD.top + PLOT_H}Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', userSelect: 'none' }}>
      <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="#F8F4EE" rx="4" />

      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD.left} y1={toSvgY(v)} x2={PAD.left + PLOT_W} y2={toSvgY(v)}
            stroke="#D8D0C4" strokeWidth="0.7" />
          <text x={PAD.left - 6} y={toSvgY(v) + 3} textAnchor="end" fontSize="9" fill="#8B7B6B">{fmt(v)}</text>
        </g>
      ))}

      <path d={areaPath} fill={color} opacity="0.08" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

      {datos.map((d, i) => {
        const v = d.valor ?? d.y ?? 0;
        const isHov = hovIdx === i;
        return (
          <g key={i} onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(null)}
            style={{ cursor: 'default' }}>
            <circle cx={toSvgX(i)} cy={toSvgY(v)} r={isHov ? 5.5 : 3.5}
              fill={isHov ? color : 'white'} stroke={color} strokeWidth="1.8" />
            {isHov && (
              <text x={toSvgX(i)} y={toSvgY(v) - 9} textAnchor="middle"
                fontSize="10.5" fill={color} fontWeight="700">{fmt(v)}</text>
            )}
            {datos.length <= 14 && (
              <text x={toSvgX(i)} y={PAD.top + PLOT_H + 14} textAnchor="middle" fontSize="9" fill="#8B7B6B">
                {(d.etiqueta ?? String(i + 1)).slice(0, 8)}
              </text>
            )}
          </g>
        );
      })}

      <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H}
        stroke="#A09080" strokeWidth="1.2" />
      <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H}
        fill="none" stroke="#C8BEB0" strokeWidth="0.8" rx="4" />
    </svg>
  );
}

// ── Gráfica de dispersión ───────────────────────────────────────────────────
function GraficaDispersion({ spec, colores }: { spec: EspecGrafica; colores: string[] }) {
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  const datos = spec.datos ?? [];
  if (!datos.length) return null;

  const xs = datos.map(d => d.x ?? 0);
  const ys = datos.map(d => d.y ?? d.valor ?? 0);
  const xRange = Math.max(...xs) - Math.min(...xs) || 1;
  const yRange = Math.max(...ys) - Math.min(...ys) || 1;
  const xMin = Math.min(...xs) - xRange * 0.1;
  const xMax = Math.max(...xs) + xRange * 0.1;
  const yMin = Math.min(...ys) - yRange * 0.1;
  const yMax = Math.max(...ys) + yRange * 0.1;

  const xTicks = niceTicks(xMin, xMax, 6);
  const yTicks = niceTicks(yMin, yMax, 5);
  const toSvgX = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin)) * PLOT_W;
  const toSvgY = (y: number) => PAD.top + PLOT_H - ((y - yMin) / (yMax - yMin)) * PLOT_H;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', userSelect: 'none' }}>
      <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="#F8F4EE" rx="4" />

      {xTicks.map(x => (
        <g key={x}>
          <line x1={toSvgX(x)} y1={PAD.top} x2={toSvgX(x)} y2={PAD.top + PLOT_H}
            stroke="#D8D0C4" strokeWidth="0.7" />
          <text x={toSvgX(x)} y={PAD.top + PLOT_H + 16} textAnchor="middle" fontSize="9" fill="#8B7B6B">{fmt(x)}</text>
        </g>
      ))}
      {yTicks.map(y => (
        <g key={y}>
          <line x1={PAD.left} y1={toSvgY(y)} x2={PAD.left + PLOT_W} y2={toSvgY(y)}
            stroke="#D8D0C4" strokeWidth="0.7" />
          <text x={PAD.left - 6} y={toSvgY(y) + 3} textAnchor="end" fontSize="9" fill="#8B7B6B">{fmt(y)}</text>
        </g>
      ))}

      {datos.map((d, i) => {
        const x = d.x ?? 0;
        const y = d.y ?? d.valor ?? 0;
        const isHov = hovIdx === i;
        const color = colores[i % colores.length];
        return (
          <g key={i} onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(null)}
            style={{ cursor: 'default' }}>
            <circle cx={toSvgX(x)} cy={toSvgY(y)} r={isHov ? 7 : 5}
              fill={color + (isHov ? 'FF' : 'BB')} stroke={color} strokeWidth="1.2" />
            {isHov && (
              <text x={toSvgX(x) + 8} y={toSvgY(y) - 6} fontSize="9.5" fill={color} fontWeight="700">
                {d.etiqueta ? `${d.etiqueta} ` : ''}({fmt(x)}, {fmt(y)})
              </text>
            )}
          </g>
        );
      })}

      <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H}
        fill="none" stroke="#C8BEB0" strokeWidth="0.8" rx="4" />
    </svg>
  );
}

// ── Export principal ────────────────────────────────────────────────────────
export default function GraficaRenderer({ spec: rawSpec }: { spec: string }) {
  const spec = useMemo<EspecGrafica | null>(() => {
    try { return JSON.parse(rawSpec); } catch { return null; }
  }, [rawSpec]);

  if (!spec) return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-500 my-2">
      Gráfica: JSON inválido
    </div>
  );

  const colores = spec.colores?.length ? spec.colores : COLORES_TEMA;
  const etiquetas = spec.etiquetas?.length
    ? spec.etiquetas
    : spec.datos?.map(d => d.etiqueta ?? '').filter(Boolean) ?? [];

  return (
    <div className="my-4 rounded-xl border border-[var(--sepia-border)] overflow-hidden bg-white shadow-sm">
      {spec.titulo && (
        <div className="px-4 py-2.5 border-b border-[var(--sepia-border)] bg-[#F8F4EE] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--sepia-text)]">{spec.titulo}</span>
          <span className="text-[10px] text-[var(--sepia-text-secondary)] bg-white border border-[var(--sepia-border)] px-2 py-0.5 rounded-full">
            interactivo
          </span>
        </div>
      )}
      <div className="px-3 py-3">
        {spec.tipo === 'funcion' && <GraficaFuncion spec={spec} colores={colores} />}
        {spec.tipo === 'barras' && <GraficaBarras spec={spec} colores={colores} />}
        {spec.tipo === 'linea' && <GraficaLinea spec={spec} colores={colores} />}
        {spec.tipo === 'dispersion' && <GraficaDispersion spec={spec} colores={colores} />}

        {(etiquetas.length > 0 || spec.eje_x || spec.eje_y) && (
          <div className="mt-3 px-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            {etiquetas.map((label, i) => label && (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-3 h-[3px] rounded-full" style={{ background: colores[i % colores.length] }} />
                <span className="text-[11px] text-[var(--sepia-text-secondary)]">{label}</span>
              </div>
            ))}
            {spec.eje_x && (
              <span className="text-[10px] text-[var(--sepia-text-secondary)] ml-auto">↔ {spec.eje_x}</span>
            )}
            {spec.eje_y && (
              <span className="text-[10px] text-[var(--sepia-text-secondary)]">↕ {spec.eje_y}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
