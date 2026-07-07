import { useState, useRef, useEffect, useCallback } from "react";
import {
  Type, Sigma, Pencil, Paperclip, Trash2, Undo2, Eraser,
  Minus, ArrowRight, Square, Circle, Triangle, X,
} from "lucide-react";
import katex from "katex";

type Modo = "texto" | "latex" | "dibujar" | "archivo";
type Herramienta =
  | "lapiz" | "goma"
  | "linea" | "flecha"
  | "rectangulo" | "circulo" | "circulo_centro" | "triangulo"
  | "arco" | "angulo_recto"
  | "texto_canvas";

export interface RichAnswer {
  texto: string;
  archivo: File | null;
  modo: Modo;
}

interface Props {
  value: RichAnswer;
  onChange: (v: RichAnswer) => void;
  placeholder?: string;
  temaNombre?: string;
}

// ── Inline SVG icons ──────────────────────────────────────────
const ArcIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M2 12 A8 8 0 0 1 12 2" />
    <circle cx="2" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="2" r="1.2" fill="currentColor" />
  </svg>
);
const RightAngleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12 L2 2 L12 2" />
    <polyline points="2,5.5 5.5,5.5 5.5,2" />
  </svg>
);
const AxesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="1" y1="7" x2="13" y2="7" />
    <line x1="7" y1="13" x2="7" y2="1" />
    <polyline points="11,5 13,7 11,9" />
    <polyline points="5,3 7,1 9,3" />
  </svg>
);
const CircleCenterIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="7" cy="7" r="5" />
    <circle cx="7" cy="7" r="1.3" fill="currentColor" stroke="none" />
    <line x1="7" y1="7" x2="11.5" y2="4.7" strokeDasharray="1.5 1" />
  </svg>
);
const TextToolIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="3.5" x2="12" y2="3.5" />
    <line x1="7" y1="3.5" x2="7" y2="11.5" />
    <line x1="4.5" y1="11.5" x2="9.5" y2="11.5" />
  </svg>
);

// ── Canvas constants ──────────────────────────────────────────
const COLORES = ["#1a1a1a", "#e53e3e", "#2563eb", "#059669", "#d97706", "#7c3aed"];
const GROSORES = [1.5, 3, 6, 10];
const GRID_PASO = 25;

// ── LaTeX preview ──────────────────────────────────────────────
function LatexPreview({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const lineas = src.split("\n");
    ref.current.innerHTML = lineas.map((l) => {
      try {
        return katex.renderToString(l || "\\phantom{x}", {
          displayMode: l.trim().startsWith("$$") || l.trim().startsWith("\\["),
          throwOnError: false,
          trust: false,
        });
      } catch {
        return `<span style="color:#e53e3e">${l}</span>`;
      }
    }).join("<br/>");
  }, [src]);
  return (
    <div ref={ref}
      className="min-h-[120px] p-4 bg-white border border-[var(--sepia-border)] rounded-xl text-[var(--sepia-text)] text-sm leading-relaxed overflow-auto" />
  );
}

// ── Canvas helpers ─────────────────────────────────────────────
interface Punto { x: number; y: number }

function dibujarForma(
  ctx: CanvasRenderingContext2D,
  tipo: Herramienta,
  p1: Punto,
  p2: Punto,
  grosor: number,
  color: string,
) {
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  switch (tipo) {
    case "linea": {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      break;
    }
    case "flecha": {
      const headLen = Math.max(14, grosor * 4);
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(
        p2.x - headLen * Math.cos(angle - Math.PI / 6),
        p2.y - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(
        p2.x - headLen * Math.cos(angle + Math.PI / 6),
        p2.y - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
      break;
    }
    case "rectangulo": {
      ctx.beginPath();
      ctx.strokeRect(p1.x, p1.y, dx, dy);
      break;
    }
    case "circulo": {
      const rx = Math.abs(dx) / 2;
      const ry = Math.abs(dy) / 2;
      const cx = p1.x + dx / 2;
      const cy = p1.y + dy / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "triangulo": {
      // Base from p1 to p2 bottom, apex at top-center
      ctx.beginPath();
      ctx.moveTo(p1.x, p2.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p1.x + dx / 2, p1.y);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "arco": {
      const r = Math.hypot(dx, dy);
      const endAngle = Math.atan2(dy, dx);
      if (r < 2) break;
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, r, 0, endAngle, endAngle < 0);
      ctx.stroke();
      // small dot at center
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, Math.max(2, grosor * 1.2), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      break;
    }
    case "angulo_recto": {
      const len = Math.hypot(dx, dy);
      if (len < 2) break;
      const angle = Math.atan2(dy, dx);
      const perpAngle = angle - Math.PI / 2;
      const markSize = Math.min(len * 0.25, 18);

      // Two arms from vertex p1
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(
        p1.x + len * Math.cos(perpAngle),
        p1.y + len * Math.sin(perpAngle),
      );
      ctx.stroke();

      // Square corner mark
      const s1 = { x: p1.x + markSize * Math.cos(angle),    y: p1.y + markSize * Math.sin(angle) };
      const s2 = { x: p1.x + markSize * Math.cos(perpAngle), y: p1.y + markSize * Math.sin(perpAngle) };
      const s3 = { x: s1.x + markSize * Math.cos(perpAngle), y: s1.y + markSize * Math.sin(perpAngle) };
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      break;
    }
    case "circulo_centro": {
      // Perfect circle: p1=center, radius=distance to p2
      const r = Math.hypot(dx, dy);
      if (r < 1) break;
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // Center dot + dashed radius
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = Math.max(1, grosor * 0.5);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, Math.max(2, grosor * 0.9), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      break;
    }
  }
}

function dibujarEjes(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  const tick = 4;

  ctx.save();
  ctx.strokeStyle = "#4a4a6a";
  ctx.fillStyle = "#4a4a6a";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.font = "11px monospace";
  ctx.textAlign = "center";

  // X axis
  ctx.beginPath(); ctx.moveTo(16, cy); ctx.lineTo(w - 16, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w - 10, cy - 4); ctx.lineTo(w - 16, cy); ctx.lineTo(w - 10, cy + 4); ctx.stroke();
  ctx.fillText("x", w - 6, cy - 6);

  // Y axis
  ctx.beginPath(); ctx.moveTo(cx, h - 16); ctx.lineTo(cx, 16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 4, 22); ctx.lineTo(cx, 16); ctx.lineTo(cx + 4, 22); ctx.stroke();
  ctx.textAlign = "left"; ctx.fillText("y", cx + 6, 20);

  // Tick marks every 2 grid cells (50px)
  ctx.lineWidth = 1;
  for (let x = cx + GRID_PASO * 2; x < w - 20; x += GRID_PASO * 2) {
    ctx.beginPath(); ctx.moveTo(x, cy - tick); ctx.lineTo(x, cy + tick); ctx.stroke();
  }
  for (let x = cx - GRID_PASO * 2; x > 20; x -= GRID_PASO * 2) {
    ctx.beginPath(); ctx.moveTo(x, cy - tick); ctx.lineTo(x, cy + tick); ctx.stroke();
  }
  for (let y = cy + GRID_PASO * 2; y < h - 20; y += GRID_PASO * 2) {
    ctx.beginPath(); ctx.moveTo(cx - tick, y); ctx.lineTo(cx + tick, y); ctx.stroke();
  }
  for (let y = cy - GRID_PASO * 2; y > 20; y -= GRID_PASO * 2) {
    ctx.beginPath(); ctx.moveTo(cx - tick, y); ctx.lineTo(cx + tick, y); ctx.stroke();
  }

  ctx.restore();
}

function dibujarGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#e8e4dc";
  ctx.lineWidth = 0.7;
  for (let x = GRID_PASO; x < w; x += GRID_PASO) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = GRID_PASO; y < h; y += GRID_PASO) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

// ── Toolbar ────────────────────────────────────────────────────
const GRUPOS_HERRAMIENTAS: {
  label: string;
  tools: { id: Herramienta; icon: React.ReactNode; title: string }[];
}[] = [
  {
    label: "Trazo",
    tools: [
      { id: "lapiz",        icon: <Pencil className="w-3.5 h-3.5" />,    title: "Lápiz libre" },
      { id: "goma",         icon: <Eraser className="w-3.5 h-3.5" />,    title: "Goma de borrar" },
    ],
  },
  {
    label: "Líneas",
    tools: [
      { id: "linea",  icon: <Minus className="w-3.5 h-3.5" />,           title: "Línea recta" },
      { id: "flecha", icon: <ArrowRight className="w-3.5 h-3.5" />,      title: "Flecha / Vector" },
    ],
  },
  {
    label: "Figuras",
    tools: [
      { id: "rectangulo",    icon: <Square className="w-3.5 h-3.5" />,  title: "Rectángulo" },
      { id: "circulo",       icon: <Circle className="w-3.5 h-3.5" />,  title: "Elipse — arrastra desde esquina a esquina" },
      { id: "circulo_centro",icon: <CircleCenterIcon />,                 title: "Círculo desde centro — clic en centro, arrastra el radio" },
      { id: "triangulo",     icon: <Triangle className="w-3.5 h-3.5" />,title: "Triángulo" },
    ],
  },
  {
    label: "Geom.",
    tools: [
      { id: "arco",         icon: <ArcIcon />,         title: "Arco — arrastra desde el centro" },
      { id: "angulo_recto", icon: <RightAngleIcon />,  title: "Ángulo recto" },
    ],
  },
  {
    label: "Texto",
    tools: [
      { id: "texto_canvas", icon: <TextToolIcon />, title: "Texto — clic para colocar una etiqueta" },
    ],
  },
];

const TOOL_HINT: Record<Herramienta, string> = {
  lapiz:          "Dibuja libremente",
  goma:           "Arrastra para borrar",
  linea:          "Clic y arrastra — línea recta",
  flecha:         "Clic y arrastra — flecha / vector",
  rectangulo:     "Arrastra desde una esquina a la opuesta",
  circulo:        "Arrastra para definir el bounding box de la elipse",
  circulo_centro: "Clic en el centro del círculo, arrastra para definir el radio — se muestra el radio punteado",
  triangulo:      "Arrastra — base en el borde inferior, vértice arriba",
  arco:           "Clic en el centro del ángulo, arrastra hasta el radio deseado",
  angulo_recto:   "Clic en el vértice y arrastra para orientar el ángulo recto",
  texto_canvas:   "Clic en el lienzo para insertar texto — Enter para confirmar, Esc para cancelar",
};

// ── Main component ─────────────────────────────────────────────
export default function RichAnswerInput({
  value, onChange, placeholder = "Escribe tu respuesta…",
}: Props) {
  const [modo, setModo] = useState<Modo>(value.modo || "texto");
  const [latexPreview, setLatexPreview] = useState(false);
  const [archivoPreview, setArchivoPreview] = useState<string>("");

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dibujando, setDibujando] = useState(false);
  const [color, setColor]           = useState(COLORES[0]);
  const [grosor, setGrosor]         = useState(GROSORES[1]);
  const [herramienta, setHerramienta] = useState<Herramienta>("lapiz");

  const historial     = useRef<ImageData[]>([]);
  const puntoAnterior = useRef<Punto | null>(null);
  const puntoInicio   = useRef<Punto | null>(null);
  const puntoFin      = useRef<Punto | null>(null);
  const snapshotAntes = useRef<ImageData | null>(null);

  // Texto sobre canvas
  const [textoPos, setTextoPos]     = useState<Punto | null>(null);
  const [textoValor, setTextoValor] = useState("");
  const textoInputRef = useRef<HTMLInputElement>(null);

  const set = useCallback((partial: Partial<RichAnswer>) => {
    onChange({ ...value, modo, ...partial });
  }, [value, modo, onChange]);

  function cambiarModo(m: Modo) {
    setModo(m);
    onChange({ ...value, modo: m });
  }

  // Init grid when entering draw tab
  useEffect(() => {
    if (modo !== "dibujar") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    dibujarGrid(ctx, canvas.width, canvas.height);
  }, [modo]);

  function getPunto(e: React.MouseEvent | React.TouchEvent): Punto {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const sx     = canvas.width  / rect.width;
    const sy     = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  const esFreehand = herramienta === "lapiz" || herramienta === "goma";

  function commitTexto() {
    if (!textoPos) return;
    const v = textoValor.trim();
    if (v) {
      const canvas = canvasRef.current;
      const ctx    = canvas?.getContext("2d");
      if (ctx && canvas) {
        historial.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        const fontSize = Math.round(10 + grosor * 2.5);
        ctx.save();
        ctx.font          = `${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle     = color;
        ctx.textBaseline  = "middle";
        ctx.fillText(v, textoPos.x, textoPos.y);
        ctx.restore();
        exportarCanvas();
      }
    }
    setTextoPos(null);
    setTextoValor("");
  }

  function iniciarTrazo(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const p = getPunto(e);

    // Text tool: just record click position, show floating input
    if (herramienta === "texto_canvas") {
      if (textoPos) commitTexto(); // commit any pending text first
      setTextoPos(p);
      setTextoValor("");
      setTimeout(() => textoInputRef.current?.focus(), 20);
      return;
    }

    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historial.current.push(snap);
    if (historial.current.length > 50) historial.current.shift();

    puntoInicio.current = p;
    puntoFin.current    = p;
    setDibujando(true);

    if (esFreehand) {
      puntoAnterior.current = p;
    } else {
      snapshotAntes.current = snap;
    }
  }

  function mover(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!dibujando) return;
    const ctx    = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPunto(e);
    puntoFin.current = p;

    if (esFreehand) {
      ctx.beginPath();
      ctx.lineCap  = "round";
      ctx.lineJoin = "round";
      if (herramienta === "goma") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth   = grosor * 5;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
        ctx.lineWidth   = grosor;
      }
      ctx.moveTo(puntoAnterior.current?.x ?? p.x, puntoAnterior.current?.y ?? p.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      puntoAnterior.current = p;
    } else {
      if (snapshotAntes.current) ctx.putImageData(snapshotAntes.current, 0, 0);
      if (puntoInicio.current) {
        dibujarForma(ctx, herramienta, puntoInicio.current, p, grosor, color);
      }
    }
  }

  function terminarTrazo() {
    if (!dibujando) return;
    setDibujando(false);

    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    if (ctx && canvas && !esFreehand && snapshotAntes.current && puntoInicio.current && puntoFin.current) {
      ctx.putImageData(snapshotAntes.current, 0, 0);
      dibujarForma(ctx, herramienta, puntoInicio.current, puntoFin.current, grosor, color);
      snapshotAntes.current = null;
    }

    puntoAnterior.current = null;
    puntoInicio.current   = null;
    puntoFin.current      = null;
    exportarCanvas();
  }

  function exportarCanvas() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "dibujo.png", { type: "image/png" });
      onChange({ ...value, modo: "dibujar", archivo: file, texto: value.texto });
    }, "image/png");
  }

  function deshacer() {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const prev = historial.current.pop();
    if (prev) ctx.putImageData(prev, 0, 0);
    exportarCanvas();
  }

  function limpiarCanvas() {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    dibujarGrid(ctx, canvas.width, canvas.height);
    historial.current = [];
    onChange({ ...value, modo: "dibujar", archivo: null, texto: value.texto });
  }

  function insertarEjes() {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    historial.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    dibujarEjes(ctx, canvas.width, canvas.height);
    exportarCanvas();
  }

  function handleArchivo(f: File | null) {
    if (!f) { setArchivoPreview(""); onChange({ ...value, archivo: null }); return; }
    onChange({ ...value, modo: "archivo", archivo: f });
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setArchivoPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setArchivoPreview("");
    }
  }

  const TABS: { id: Modo; icon: React.ReactNode; label: string }[] = [
    { id: "texto",   icon: <Type className="w-3.5 h-3.5" />,      label: "Texto"   },
    { id: "latex",   icon: <Sigma className="w-3.5 h-3.5" />,     label: "LaTeX"   },
    { id: "dibujar", icon: <Pencil className="w-3.5 h-3.5" />,    label: "Dibujar" },
    { id: "archivo", icon: <Paperclip className="w-3.5 h-3.5" />, label: "Archivo" },
  ];

  return (
    <div className="space-y-2">

      {/* ── Mode tabs ── */}
      <div className="flex items-center gap-1 bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => cambiarModo(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12px] font-semibold transition-all ${
              modo === t.id
                ? "bg-white shadow text-[var(--sepia-accent)] border border-[var(--sepia-border)]"
                : "text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-text)]"
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── TEXTO ── */}
      {modo === "texto" && (
        <textarea value={value.texto} onChange={(e) => set({ texto: e.target.value })}
          placeholder={placeholder} rows={5}
          className="w-full bg-white border border-[var(--sepia-border)] rounded-xl px-4 py-3 text-sm text-[var(--sepia-text)] resize-none focus:outline-none focus:border-[var(--sepia-accent)] transition-colors leading-relaxed" />
      )}

      {/* ── LATEX ── */}
      {modo === "latex" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-[var(--sepia-text-secondary)]">
              <code className="bg-[var(--sepia-bg)] px-1 rounded">$...$</code> inline ·{" "}
              <code className="bg-[var(--sepia-bg)] px-1 rounded">$$...$$</code> bloque
            </p>
            <button onClick={() => setLatexPreview(p => !p)}
              className="text-[11px] text-[var(--sepia-accent)] font-bold hover:underline">
              {latexPreview ? "Editar" : "Vista previa"}
            </button>
          </div>
          {!latexPreview ? (
            <textarea value={value.texto} onChange={(e) => set({ texto: e.target.value })}
              placeholder={"Ejemplo:\n$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$\n$\\angle ABC = 60°$"}
              rows={6}
              className="w-full bg-white border border-[var(--sepia-border)] rounded-xl px-4 py-3 text-sm text-[var(--sepia-text)] resize-none focus:outline-none focus:border-[var(--sepia-accent)] transition-colors font-mono leading-relaxed" />
          ) : (
            <LatexPreview src={value.texto} />
          )}
        </div>
      )}

      {/* ── DIBUJAR ── */}
      {modo === "dibujar" && (
        <div className="space-y-2">

          {/* Row 1 — Tool groups */}
          <div className="flex flex-wrap items-center gap-1.5">
            {GRUPOS_HERRAMIENTAS.map((grupo) => (
              <div key={grupo.label} className="flex items-center gap-1">
                <div className="flex items-center gap-0.5 bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-xl p-0.5">
                  {grupo.tools.map((t) => (
                    <button key={t.id} onClick={() => setHerramienta(t.id)} title={t.title}
                      className={`p-1.5 rounded-[9px] transition-all ${
                        herramienta === t.id
                          ? "bg-white shadow text-[var(--sepia-accent)] border border-[var(--sepia-border)]/60"
                          : "text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-text)]"
                      }`}>
                      {t.icon}
                    </button>
                  ))}
                </div>
                <span className="text-[9px] font-bold text-[var(--sepia-text-secondary)] uppercase tracking-wider">
                  {grupo.label}
                </span>
              </div>
            ))}
          </div>

          {/* Row 2 — Colors + widths + actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Colors */}
            <div className="flex items-center gap-1">
              {COLORES.map((c) => (
                <button key={c} onClick={() => { setColor(c); if (herramienta === "goma") setHerramienta("lapiz"); }}
                  title={c}
                  style={{ width: 18, height: 18, background: c }}
                  className={`rounded-full border-2 transition-all hover:scale-110 ${
                    color === c && herramienta !== "goma"
                      ? "border-[var(--sepia-accent)] scale-125 shadow"
                      : "border-transparent"
                  }`} />
              ))}
            </div>

            {/* Stroke widths */}
            <div className="flex items-center gap-1">
              {GROSORES.map((g) => (
                <button key={g} onClick={() => setGrosor(g)} title={`Grosor ${g}px`}
                  className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-all ${
                    grosor === g
                      ? "border-[var(--sepia-accent)] bg-[var(--sepia-accent)]/10"
                      : "border-[var(--sepia-border)]"
                  }`}>
                  <div className="rounded-full bg-[var(--sepia-text)]"
                    style={{ width: Math.min(g + 2, 12), height: Math.min(g + 2, 12) }} />
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={insertarEjes} title="Insertar ejes coordenados X-Y"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--sepia-border)] hover:border-[var(--sepia-accent)]/50 hover:text-[var(--sepia-accent)] text-[var(--sepia-text-secondary)] text-[11px] font-semibold transition-colors">
                <AxesIcon /> Ejes
              </button>
              <button onClick={deshacer} title="Deshacer"
                className="p-1.5 rounded-lg border border-[var(--sepia-border)] hover:bg-[var(--sepia-card)] text-[var(--sepia-text-secondary)] transition-colors">
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={limpiarCanvas} title="Limpiar lienzo"
                className="p-1.5 rounded-lg border border-[var(--sepia-border)] hover:bg-red-50 hover:border-red-300 hover:text-red-500 text-[var(--sepia-text-secondary)] transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Canvas wrapper — relative for floating text input */}
          <div style={{ position: "relative" }}>
            <canvas ref={canvasRef} width={700} height={400}
              className="w-full rounded-xl border border-[var(--sepia-border)] touch-none select-none"
              style={{
                cursor: herramienta === "texto_canvas"
                  ? "text"
                  : herramienta === "goma"
                  ? "cell"
                  : "crosshair",
                background: "#fff",
              }}
              onMouseDown={iniciarTrazo}
              onMouseMove={mover}
              onMouseUp={terminarTrazo}
              onMouseLeave={terminarTrazo}
              onTouchStart={iniciarTrazo}
              onTouchMove={mover}
              onTouchEnd={terminarTrazo}
            />

            {/* Floating text input */}
            {textoPos && (
              <div style={{
                position: "absolute",
                left: `${(textoPos.x / 700) * 100}%`,
                top: `${(textoPos.y / 400) * 100}%`,
                transform: "translateY(-50%)",
                zIndex: 20,
                pointerEvents: "auto",
              }}>
                <input
                  ref={textoInputRef}
                  value={textoValor}
                  onChange={(e) => setTextoValor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitTexto(); }
                    if (e.key === "Escape") { setTextoPos(null); setTextoValor(""); }
                  }}
                  onBlur={commitTexto}
                  size={Math.max(5, textoValor.length + 3)}
                  style={{
                    fontSize: `${Math.round(10 + grosor * 2.5)}px`,
                    color: color,
                    background: "rgba(255,255,255,0.92)",
                    border: "none",
                    borderBottom: `2px solid ${color}`,
                    outline: "none",
                    padding: "1px 3px",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    minWidth: 40,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                    borderRadius: "3px 3px 0 0",
                  }}
                  placeholder="texto…"
                />
              </div>
            )}
          </div>

          {/* Context hint */}
          <p className="text-[10px] text-[var(--sepia-text-secondary)] text-center">
            {TOOL_HINT[herramienta]}
            {herramienta === "texto_canvas" && (
              <span className="ml-2 font-semibold">
                · tamaño = grosor selector
              </span>
            )}
          </p>

          {/* Optional text */}
          <textarea value={value.texto} onChange={(e) => set({ texto: e.target.value })}
            placeholder="Notas o explicación complementaria (opcional)…" rows={2}
            className="w-full bg-white border border-[var(--sepia-border)] rounded-xl px-4 py-2 text-xs text-[var(--sepia-text)] resize-none focus:outline-none focus:border-[var(--sepia-accent)] transition-colors" />
        </div>
      )}

      {/* ── ARCHIVO ── */}
      {modo === "archivo" && (
        <div className="space-y-3">
          {!value.archivo ? (
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[var(--sepia-border)] rounded-xl p-8 cursor-pointer hover:border-[var(--sepia-accent)]/40 hover:bg-[var(--sepia-accent)]/3 transition-all">
              <Paperclip className="w-7 h-7 text-[var(--sepia-text-secondary)]" />
              <div className="text-center">
                <p className="text-sm font-semibold text-[var(--sepia-text)]">Sube tu respuesta</p>
                <p className="text-xs text-[var(--sepia-text-secondary)] mt-0.5">Foto, escaneo o PDF — máx 15 MB</p>
              </div>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                className="hidden" onChange={(e) => handleArchivo(e.target.files?.[0] ?? null)} />
            </label>
          ) : (
            <div className="space-y-2">
              {archivoPreview ? (
                <img src={archivoPreview} alt="Preview"
                  className="w-full max-h-48 object-contain rounded-xl border border-[var(--sepia-border)]" />
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-xl">
                  <span className="text-2xl">📄</span>
                  <span className="text-sm font-medium text-[var(--sepia-text)]">{value.archivo.name}</span>
                </div>
              )}
              <button onClick={() => handleArchivo(null)}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600">
                <X className="w-3 h-3" /> Quitar archivo
              </button>
            </div>
          )}
          <textarea value={value.texto} onChange={(e) => set({ texto: e.target.value })}
            placeholder="Texto complementario al archivo (opcional)…" rows={2}
            className="w-full bg-white border border-[var(--sepia-border)] rounded-xl px-4 py-2 text-xs text-[var(--sepia-text)] resize-none focus:outline-none focus:border-[var(--sepia-accent)] transition-colors" />
        </div>
      )}
    </div>
  );
}
