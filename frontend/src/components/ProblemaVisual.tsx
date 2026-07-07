import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";
import { useStore } from "@/services/store";
import katex from "katex";

// ── Tipos ──────────────────────────────────────────────────────────────────

type Primitive =
  | { t: "point";  x: number; y: number; label?: string }
  | { t: "line";   x1: number; y1: number; x2: number; y2: number; label?: string }
  | { t: "circle"; cx: number; cy: number; r: number; label?: string }
  | { t: "rect";   x: number; y: number; w: number; h: number; label?: string }
  | { t: "angle";  vx: number; vy: number; p1x?: number; p1y?: number; p2x?: number; p2y?: number; label?: string }
  | { t: "text";   x: number; y: number; text: string };

interface Problema {
  enunciado: string;
  pregunta: string;
  setup: Primitive[];
  datos: string[];
  pistas: string[];
  nivel: string;
  cached: boolean;
}

interface Result {
  puntuacion: number;
  correcto: boolean;
  feedback: string;
  errores: string[];
  aciertos: string[];
}

type DrawTool = "pencil" | "line" | "point" | "eraser";

interface Props {
  temaId: string;
  temaNombre: string;
  materiaNombre: string;
}

// ── LaTeX renderer (inline + display) ─────────────────────────────────────

function renderLatex(texto: string): React.ReactNode[] {
  const partes = texto.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
  return partes.map((p, i) => {
    if (p.startsWith("$$") && p.endsWith("$$")) {
      try {
        const html = katex.renderToString(p.slice(2, -2), { throwOnError: false, displayMode: true });
        return <div key={i} style={{ margin: "8px 0", overflowX: "auto", textAlign: "center" }} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch { return <span key={i} style={{ color: "#DC2626" }}>{p}</span>; }
    }
    if (p.startsWith("$") && p.endsWith("$")) {
      try {
        const html = katex.renderToString(p.slice(1, -1), { throwOnError: false, displayMode: false });
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch { return <span key={i} style={{ color: "#DC2626" }}>{p}</span>; }
    }
    return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{p}</span>;
  });
}

// ── Canvas renderer ────────────────────────────────────────────────────────

function dibujarSetup(ctx: CanvasRenderingContext2D, setup: Primitive[]) {
  const SEPIA = "#8B6914";
  const SEPIA_L = "#C4922A";

  ctx.save();
  ctx.strokeStyle = SEPIA;
  ctx.fillStyle = SEPIA;
  ctx.lineWidth = 2;
  ctx.font = "bold 12px sans-serif";

  for (const el of setup) {
    try {
      switch (el.t) {
        case "point": {
          ctx.beginPath();
          ctx.arc(el.x, el.y, 4, 0, Math.PI * 2);
          ctx.fill();
          if (el.label) {
            ctx.fillText(el.label, el.x + 8, el.y - 6);
          }
          break;
        }
        case "line": {
          ctx.beginPath();
          ctx.moveTo(el.x1, el.y1);
          ctx.lineTo(el.x2, el.y2);
          ctx.stroke();
          if (el.label) {
            const mx = (el.x1 + el.x2) / 2;
            const my = (el.y1 + el.y2) / 2;
            ctx.fillStyle = SEPIA_L;
            ctx.font = "11px sans-serif";
            ctx.fillText(el.label, mx + 6, my - 6);
            ctx.fillStyle = SEPIA;
            ctx.font = "bold 12px sans-serif";
          }
          break;
        }
        case "circle": {
          ctx.beginPath();
          ctx.arc(el.cx, el.cy, el.r, 0, Math.PI * 2);
          ctx.stroke();
          if (el.label) {
            ctx.fillStyle = SEPIA_L;
            ctx.font = "11px sans-serif";
            ctx.fillText(el.label, el.cx + el.r + 6, el.cy);
            ctx.fillStyle = SEPIA;
            ctx.font = "bold 12px sans-serif";
          }
          break;
        }
        case "rect": {
          ctx.strokeRect(el.x, el.y, el.w, el.h);
          // small square for right angle marker
          const s = 10;
          ctx.strokeRect(el.x, el.y + el.h - s, s, s);
          if (el.label) {
            ctx.fillStyle = SEPIA_L;
            ctx.font = "11px sans-serif";
            ctx.fillText(el.label, el.x + el.w / 2, el.y - 6);
            ctx.fillStyle = SEPIA;
            ctx.font = "bold 12px sans-serif";
          }
          break;
        }
        case "angle": {
          const S = 16;
          if (el.p1x !== undefined && el.p1y !== undefined && el.p2x !== undefined && el.p2y !== undefined) {
            // Draw proper right-angle square oriented toward the two neighboring vertices
            const dx1 = el.p1x - el.vx, dy1 = el.p1y - el.vy;
            const dx2 = el.p2x - el.vx, dy2 = el.p2y - el.vy;
            const len1 = Math.hypot(dx1, dy1) || 1;
            const len2 = Math.hypot(dx2, dy2) || 1;
            const u1x = (dx1 / len1) * S, u1y = (dy1 / len1) * S;
            const u2x = (dx2 / len2) * S, u2y = (dy2 / len2) * S;
            // L-shape: P1 → Corner → P2 (two sides of the right-angle square)
            ctx.beginPath();
            ctx.moveTo(el.vx + u1x, el.vy + u1y);
            ctx.lineTo(el.vx + u1x + u2x, el.vy + u1y + u2y);
            ctx.lineTo(el.vx + u2x, el.vy + u2y);
            ctx.stroke();
            if (el.label) {
              ctx.fillStyle = SEPIA_L;
              ctx.font = "11px sans-serif";
              ctx.fillText(el.label, el.vx + u1x + u2x + 4, el.vy + u1y + u2y + 4);
              ctx.fillStyle = SEPIA;
              ctx.font = "bold 12px sans-serif";
            }
          } else {
            // Fallback: generic arc when neighbor points are missing
            ctx.beginPath();
            ctx.arc(el.vx, el.vy, S, -Math.PI / 4, Math.PI / 4);
            ctx.stroke();
            if (el.label) {
              ctx.fillStyle = SEPIA_L;
              ctx.font = "11px sans-serif";
              ctx.fillText(el.label, el.vx + S + 6, el.vy + 4);
              ctx.fillStyle = SEPIA;
              ctx.font = "bold 12px sans-serif";
            }
          }
          break;
        }
        case "text": {
          ctx.fillStyle = SEPIA_L;
          ctx.font = "11px sans-serif";
          ctx.fillText(el.text, el.x, el.y);
          ctx.fillStyle = SEPIA;
          ctx.font = "bold 12px sans-serif";
          break;
        }
      }
    } catch {
      // skip invalid primitives silently
    }
  }
  ctx.restore();
}

function dibujarGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(180,140,80,0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.restore();
}

// ── Component ──────────────────────────────────────────────────────────────

const CANVAS_W = 480;
const CANVAS_H = 320;

export default function ProblemaVisual({ temaId, temaNombre, materiaNombre }: Props) {
  const navigate = useNavigate();
  const selectedMateriaId = useStore(s => s.selectedMateriaId);
  const setPendingChatImage = useStore(s => s.setPendingChatImage);

  const [problema, setProblema] = useState<Problema | null>(null);
  const [loading, setLoading] = useState(false);
  const [dificultad, setDificultad] = useState<"basico" | "intermedio" | "avanzado">("basico");
  const [showPistas, setShowPistas] = useState(false);
  const [tool, setTool] = useState<DrawTool>("pencil");
  const [drawColor, setDrawColor] = useState("#1D4ED8");
  const [lineWidth, setLineWidth] = useState(2);
  const [explicacion, setExplicacion] = useState("");
  const [evaluando, setEvaluando] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [archivoBase64, setArchivoBase64] = useState<string | null>(null);
  const [archivoMime, setArchivoMime] = useState("");
  const [archivoNombre, setArchivoNombre] = useState("");

  // Canvas refs
  const setupRef = useRef<HTMLCanvasElement>(null);
  const drawRef  = useRef<HTMLCanvasElement>(null);

  // Drawing state (not in React state to avoid re-renders)
  const isDrawing = useRef(false);
  const lastPt    = useRef<{ x: number; y: number } | null>(null);
  const lineStart = useRef<{ x: number; y: number } | null>(null);

  // ── Redraw setup layer whenever problema changes ───────────────────
  useEffect(() => {
    if (!setupRef.current || !problema) return;
    const ctx = setupRef.current.getContext("2d")!;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    dibujarGrid(ctx, CANVAS_W, CANVAS_H);
    dibujarSetup(ctx, problema.setup || []);
    // Clear draw canvas when a new problem loads
    if (drawRef.current) {
      drawRef.current.getContext("2d")!.clearRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }, [problema]);

  // ── Drawing handlers ────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = drawRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (e.clientY - rect.top)  * (CANVAS_H / rect.height),
    };
  };

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    const pt = getPos(e);
    lastPt.current = pt;
    if (tool === "line") { lineStart.current = pt; return; }
    if (tool === "point") {
      const ctx = drawRef.current!.getContext("2d")!;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = drawColor;
      ctx.fill();
    }
  }, [tool, drawColor]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const pt = getPos(e);
    const ctx = drawRef.current!.getContext("2d")!;

    if (tool === "pencil" && lastPt.current) {
      ctx.beginPath();
      ctx.moveTo(lastPt.current.x, lastPt.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.stroke();
    } else if (tool === "eraser" && lastPt.current) {
      ctx.beginPath();
      ctx.moveTo(lastPt.current.x, lastPt.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.strokeStyle = "#FFF8EC";
      ctx.lineWidth = 16;
      ctx.lineCap = "round";
      ctx.stroke();
    }
    lastPt.current = pt;
  }, [tool, drawColor, lineWidth]);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const pt = getPos(e);
    const ctx = drawRef.current!.getContext("2d")!;

    if (tool === "line" && lineStart.current) {
      ctx.beginPath();
      ctx.moveTo(lineStart.current.x, lineStart.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      lineStart.current = null;
    }
    lastPt.current = null;
  }, [tool, drawColor, lineWidth]);

  function clearDraw() {
    const ctx = drawRef.current!.getContext("2d")!;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // ── Merge canvases for evaluation ────────────────────────────────────
  function exportCanvas(): string {
    const merged = document.createElement("canvas");
    merged.width  = CANVAS_W;
    merged.height = CANVAS_H;
    const ctx = merged.getContext("2d")!;
    // White background
    ctx.fillStyle = "#FFF8EC";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (setupRef.current) ctx.drawImage(setupRef.current, 0, 0);
    if (drawRef.current)  ctx.drawImage(drawRef.current,  0, 0);
    return merged.toDataURL("image/png");
  }

  // ── API calls ─────────────────────────────────────────────────────────
  async function generarProblema(regen = false) {
    setLoading(true);
    setResult(null);
    setExplicacion("");
    setShowPistas(false);
    setErrorMsg(null);
    setArchivoBase64(null);
    setArchivoMime("");
    setArchivoNombre("");
    try {
      const r = await api.post(`/temas/${temaId}/problema-visual?dificultad=${dificultad}&regenerar=${regen}`);
      setProblema(r.data);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || "Error al generar el problema.";
      setErrorMsg(msg);
      setProblema(null);
    }
    setLoading(false);
  }

  async function evaluar() {
    if (!problema) return;
    setEvaluando(true);
    setResult(null);
    try {
      const png = exportCanvas();
      const r = await api.post("/taller/evaluar-canvas", {
        canvas_base64: png,
        enunciado: problema.enunciado,
        pregunta: problema.pregunta,
        tema_nombre: temaNombre,
        materia_nombre: materiaNombre,
        explicacion,
        archivo_base64: archivoBase64 ?? "",
        archivo_mime: archivoMime,
      });
      setResult(r.data);
      // Auto-registrar en Libro de Errores cuando el resultado es bajo
      if (r.data.puntuacion < 70 && selectedMateriaId) {
        api.post("/srs/error", {
          materia_id: selectedMateriaId,
          tema_id: temaId,
          pregunta_texto: `[${temaNombre}] ${problema.pregunta}`,
          respuesta_correcta: r.data.aciertos?.join(". ") || r.data.feedback || "",
          respuesta_estudiante: explicacion,
          fuente: "problema_visual",
        }).catch(() => { /* non-critical */ });
      }
    } catch {
      setResult({ puntuacion: 0, correcto: false, feedback: "Error al evaluar. Intenta de nuevo.", errores: [], aciertos: [] });
    }
    setEvaluando(false);
  }

  // ── Render ────────────────────────────────────────────────────────────

  const t = {
    bg:     "var(--sepia-bg)",
    panel:  "var(--sepia-panel)",
    border: "var(--sepia-border)",
    text:   "var(--sepia-text)",
    sec:    "var(--sepia-text-secondary)",
    accent: "var(--sepia-accent)",
  };

  const TOOLS: { id: DrawTool; icon: string; title: string }[] = [
    { id: "pencil", icon: "✏️", title: "Lápiz libre" },
    { id: "line",   icon: "📏", title: "Segmento" },
    { id: "point",  icon: "●",  title: "Punto" },
    { id: "eraser", icon: "🗑️", title: "Borrador" },
  ];

  const COLORS = ["#1D4ED8", "#DC2626", "#059669", "#7C3AED", "#000000"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Resolución visual de problemas</div>
          <div style={{ fontSize: 12, color: t.sec, marginTop: 2 }}>Dibuja tu solución sobre la figura</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(["basico", "intermedio", "avanzado"] as const).map(d => (
            <button
              key={d}
              onClick={() => setDificultad(d)}
              style={{
                padding: "5px 12px", borderRadius: 8, fontWeight: 700, fontSize: 11,
                cursor: "pointer", textTransform: "capitalize",
                background: dificultad === d ? t.accent : "none",
                color: dificultad === d ? "#fff" : t.sec,
                border: `1px solid ${dificultad === d ? t.accent : t.border}`,
              }}
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => generarProblema(false)}
            disabled={loading}
            style={{
              padding: "7px 16px", borderRadius: 10, background: t.accent,
              color: "#fff", fontWeight: 700, fontSize: 12, border: "none",
              cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Generando..." : problema ? "Nuevo problema" : "+ Generar problema visual"}
          </button>
        </div>
      </div>

      {!problema && !loading && !errorMsg && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: t.sec, fontSize: 13 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📐</div>
          Genera un problema visual y dibuja tu solución directamente sobre la figura.<br />
          Ikaro evalúa tu dibujo con IA.
        </div>
      )}

      {errorMsg && (
        <div style={{
          padding: "12px 16px", borderRadius: 12,
          background: "#FEF2F2", border: "1px solid #FECACA",
          color: "#DC2626", fontSize: 13,
        }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: t.sec }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: `3px solid ${t.accent}`, borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
          }} />
          <div style={{ fontSize: 13 }}>Generando problema visual con IA...</div>
        </div>
      )}

      {problema && !loading && (
        <>
          {/* Enunciado + datos */}
          <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: t.accent, marginBottom: 6, letterSpacing: "0.07em" }}>
              Problema
            </div>
            <div style={{ fontSize: 14, color: t.text, lineHeight: 1.6, marginBottom: 10 }}>
              {problema.enunciado}
            </div>
            <div style={{
              background: `${t.accent}10`, borderLeft: `3px solid ${t.accent}`,
              borderRadius: "0 10px 10px 0", padding: "8px 12px",
              fontSize: 13, fontWeight: 700, color: t.text,
            }}>
              ❓ {problema.pregunta}
            </div>
            {problema.datos?.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {problema.datos.map((d, i) => (
                  <span key={i} style={{
                    padding: "3px 10px", borderRadius: 6,
                    background: t.bg, border: `1px solid ${t.border}`,
                    fontSize: 12, color: t.sec,
                  }}>
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Canvas area */}
          <div style={{
            background: t.panel, border: `1px solid ${t.border}`,
            borderRadius: 16, overflow: "hidden",
          }}>
            {/* Toolbar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
              borderBottom: `1px solid ${t.border}`, flexWrap: "wrap",
            }}>
              {TOOLS.map(toolItem => (
                <button
                  key={toolItem.id}
                  onClick={() => setTool(toolItem.id)}
                  title={toolItem.title}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: "none",
                    background: tool === toolItem.id ? t.accent : t.bg,
                    color: tool === toolItem.id ? "#fff" : t.text,
                    fontSize: 14, cursor: "pointer",
                    boxShadow: tool === toolItem.id ? `0 0 0 2px ${t.accent}40` : "none",
                  }}
                >
                  {toolItem.icon}
                </button>
              ))}

              <div style={{ width: 1, height: 20, background: t.border, margin: "0 4px" }} />

              {/* Line width */}
              <input
                type="range" min={1} max={6} value={lineWidth}
                onChange={e => setLineWidth(+e.target.value)}
                style={{ width: 60, accentColor: t.accent }}
                title="Grosor"
              />

              {/* Colors */}
              <div style={{ display: "flex", gap: 4 }}>
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setDrawColor(c)}
                    style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: c, border: drawColor === c ? "2.5px solid var(--sepia-text)" : "2px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>

              <div style={{ flex: 1 }} />
              <button
                onClick={clearDraw}
                style={{
                  padding: "5px 12px", borderRadius: 8, border: `1px solid ${t.border}`,
                  background: "none", color: t.sec, fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}
              >
                Limpiar dibujo
              </button>
            </div>

            {/* Canvas stack */}
            <div style={{ position: "relative", width: CANVAS_W, maxWidth: "100%", margin: "0 auto" }}>
              <canvas
                ref={setupRef}
                width={CANVAS_W} height={CANVAS_H}
                style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", background: "#FFF8EC" }}
              />
              <canvas
                ref={drawRef}
                width={CANVAS_W} height={CANVAS_H}
                style={{
                  position: "relative", display: "block",
                  cursor: tool === "eraser" ? "cell" : "crosshair",
                  background: "transparent",
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => { isDrawing.current = false; lastPt.current = null; }}
              />
            </div>
          </div>

          {/* Pistas + explicación + evaluar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {problema.pistas?.length > 0 && (
              <div>
                <button
                  onClick={() => setShowPistas(!showPistas)}
                  style={{
                    background: "none", border: `1px dashed ${t.border}`, borderRadius: 10,
                    padding: "7px 14px", fontSize: 12, color: t.sec,
                    cursor: "pointer", fontWeight: 700,
                  }}
                >
                  {showPistas ? "▲ Ocultar pistas" : "💬 Mostrar pistas"}
                </button>
                {showPistas && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {problema.pistas.map((p, i) => (
                      <div key={i} style={{
                        padding: "8px 12px", borderRadius: 10, fontSize: 12, color: t.text,
                        background: `${t.accent}10`, border: `1px solid ${t.accent}30`,
                      }}>
                        💡 {p}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Área de explicación con soporte LaTeX */}
            <div style={{
              border: `1px solid ${t.border}`, borderRadius: 14,
              overflow: "hidden", background: t.bg,
            }}>
              {/* Barra de herramientas LaTeX */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 12px", borderBottom: `1px solid ${t.border}`,
                background: t.panel,
              }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { label: "x²",   insert: "^{2}" },
                    { label: "√",    insert: "\\sqrt{}" },
                    { label: "π",    insert: "\\pi" },
                    { label: "±",    insert: "\\pm" },
                    { label: "∴",    insert: "\\therefore " },
                    { label: "frac", insert: "\\frac{}{}" },
                  ].map(({ label, insert }) => (
                    <button
                      key={label}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const el = e.currentTarget.closest("div")?.querySelector("textarea") as HTMLTextAreaElement | null;
                        if (!el) return;
                        const start = el.selectionStart ?? explicacion.length;
                        const end = el.selectionEnd ?? explicacion.length;
                        const before = explicacion.slice(0, start);
                        const after = explicacion.slice(end);
                        const cursor = insert.indexOf("{}");
                        const newVal = cursor >= 0
                          ? before + insert.slice(0, cursor + 1) + insert.slice(cursor + 2) + after
                          : before + insert + after;
                        setExplicacion(newVal);
                      }}
                      style={{
                        padding: "2px 8px", borderRadius: 6, border: `1px solid ${t.border}`,
                        background: t.bg, color: t.text, fontSize: 11, fontWeight: 700,
                        cursor: "pointer", fontFamily: "monospace",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  style={{
                    padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700,
                    border: `1px solid ${showPreview ? t.accent : t.border}`,
                    background: showPreview ? `${t.accent}15` : "none",
                    color: showPreview ? t.accent : t.sec, cursor: "pointer",
                  }}
                >
                  {showPreview ? "✓ Preview" : "👁 Preview"}
                </button>
              </div>

              {/* Textarea */}
              <textarea
                value={explicacion}
                onChange={e => setExplicacion(e.target.value)}
                placeholder={"Explica tu razonamiento. Usa $...$ para LaTeX inline o $$...$$ para bloque.\nEj: Por el teorema de Pitágoras, $BC = \\sqrt{AB^2 - AC^2} = \\sqrt{100 - 36} = 8$ cm"}
                rows={4}
                style={{
                  width: "100%", padding: "10px 14px", border: "none",
                  background: "transparent", color: t.text, fontSize: 13,
                  resize: "vertical", outline: "none", fontFamily: "monospace",
                  lineHeight: 1.6, display: "block",
                }}
              />

              {/* Preview LaTeX */}
              {showPreview && explicacion.trim() && (
                <div style={{
                  padding: "10px 14px", borderTop: `1px solid ${t.border}`,
                  background: "#FFFBF2", fontSize: 14, color: t.text, lineHeight: 1.7,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: t.sec, marginBottom: 6, letterSpacing: "0.06em" }}>
                    Vista previa
                  </div>
                  {renderLatex(explicacion)}
                </div>
              )}
            </div>

            {/* Adjuntar trabajo manuscrito */}
            <div style={{
              border: `1.5px dashed ${archivoBase64 ? t.accent : t.border}`,
              borderRadius: 12, overflow: "hidden",
              background: archivoBase64 ? `${t.accent}08` : t.bg,
              transition: "all .2s",
            }}>
              {!archivoBase64 ? (
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}>
                  <span style={{ fontSize: 20 }}>📎</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Adjuntar trabajo manuscrito</div>
                    <div style={{ fontSize: 11, color: t.sec }}>Foto del papel, imagen o PDF · hasta 15 MB · JPG, PNG, WEBP, PDF</div>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    style={{ display: "none" }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const result = ev.target?.result as string;
                        setArchivoBase64(result);
                        setArchivoMime(f.type);
                        setArchivoNombre(f.name);
                      };
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                  {archivoMime.startsWith("image/") ? (
                    <img src={archivoBase64} alt="trabajo" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: `1px solid ${t.border}` }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 8, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>📄</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{archivoNombre}</div>
                    <div style={{ fontSize: 11, color: "#16A34A", fontWeight: 600 }}>✓ Adjunto — se enviará con tu solución</div>
                  </div>
                  <button
                    onClick={() => { setArchivoBase64(null); setArchivoMime(""); setArchivoNombre(""); }}
                    style={{ padding: "4px 10px", borderRadius: 7, border: `1px solid ${t.border}`, background: "none", color: t.sec, fontSize: 11, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={evaluar}
                disabled={evaluando}
                style={{
                  padding: "10px 28px", borderRadius: 12, background: t.accent,
                  color: "#fff", fontWeight: 700, fontSize: 13, border: "none",
                  cursor: evaluando ? "wait" : "pointer", opacity: evaluando ? 0.7 : 1,
                }}
              >
                {evaluando ? "Evaluando con IA..." : "Evaluar mi solución"}
              </button>
              <button
                onClick={() => generarProblema(true)}
                style={{
                  padding: "10px 16px", borderRadius: 12, border: `1px solid ${t.border}`,
                  background: "none", color: t.sec, fontSize: 12, fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Otro problema
              </button>
            </div>
          </div>

          {/* Resultado */}
          {result && (
            <div style={{
              background: result.correcto ? "#F0F9F4" : "#FEF9EE",
              border: `1.5px solid ${result.correcto ? "#BCE3CC" : "#E8C97A"}`,
              borderRadius: 16, padding: "18px 22px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: result.correcto ? "#DCFCE7" : "#FEF3C7",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 900,
                  color: result.correcto ? "#059669" : "#D97706",
                }}>
                  {result.puntuacion}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: result.correcto ? "#059669" : "#D97706" }}>
                    {result.correcto ? "¡Correcto!" : "Necesita revisión"}
                  </div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>/ 100 puntos</div>
                </div>
              </div>

              <div style={{ fontSize: 13, color: "#333", lineHeight: 1.65, marginBottom: 12 }}>
                {result.feedback}
              </div>

              {result.aciertos?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", marginBottom: 4 }}>✓ Lo que hiciste bien</div>
                  {result.aciertos.map((a, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#166534", paddingLeft: 12 }}>· {a}</div>
                  ))}
                </div>
              )}
              {result.errores?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", marginBottom: 4 }}>✗ Revisar</div>
                  {result.errores.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#7F1D1D", paddingLeft: 12 }}>· {e}</div>
                  ))}
                </div>
              )}

              {/* Cuando el resultado es bajo: ofrecer consultar a Ikaro con contexto completo */}
              {result.puntuacion < 70 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #E8C97A", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#92400E" }}>
                    📖 Guardado en tu <strong>Libro de Errores</strong>
                  </span>
                  <button
                    onClick={() => {
                      const png = exportCanvas();
                      const hint = `Acabo de resolver un problema de ${temaNombre} y obtuve ${result.puntuacion}/100.\n\nProblema: "${problema?.enunciado ?? ""}"\nPregunta: "${problema?.pregunta ?? ""}"\nMi explicación: "${explicacion || "(sin texto)"}"\nFeedback recibido: "${result.feedback}"\n\n¿Puedes explicarme dónde fallé y cómo debería haberlo resuelto?`;
                      setPendingChatImage({ base64: png, filename: `problema-${temaNombre}.png`, mime: "image/png", hint });
                      navigate(selectedMateriaId ? `/materia/${selectedMateriaId}` : "/");
                    }}
                    style={{
                      padding: "6px 14px", borderRadius: 9, border: "1.5px solid #6A45DE",
                      background: "#EFEAFD", color: "#6A45DE", fontSize: 12,
                      fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    🧠 Consultar a Ikaro
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
