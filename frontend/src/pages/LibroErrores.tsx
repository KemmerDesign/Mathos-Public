import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, AlertTriangle, BookOpen, ChevronDown, ChevronUp,
  Flame, Target, ClipboardList, Zap
} from "lucide-react";
import api from "@/services/api";

interface ErrorEntry {
  id: string;
  tema_id: string | null;
  pregunta: string;
  respuesta_correcta: string;
  veces_fallada: number;
  fuente: string;
  ultima_vez: string;
}

interface Tema {
  id: string;
  nombre: string;
}

type FuenteFiltro = "todas" | "simulacro_mcq" | "taller" | "srs";
type Orden = "frecuencia" | "reciente";

function heatColor(veces: number): { bg: string; border: string; text: string; badge: string } {
  if (veces >= 5) return {
    bg: "bg-red-50", border: "border-red-200",
    text: "text-red-700", badge: "bg-red-500 text-white"
  };
  if (veces >= 3) return {
    bg: "bg-orange-50", border: "border-orange-200",
    text: "text-orange-700", badge: "bg-orange-400 text-white"
  };
  return {
    bg: "bg-yellow-50", border: "border-yellow-200",
    text: "text-yellow-700", badge: "bg-yellow-400 text-white"
  };
}

function fuenterLabel(fuente: string): string {
  const m: Record<string, string> = {
    simulacro_mcq: "Simulacro",
    taller: "Taller",
    srs: "Repaso SRS",
  };
  return m[fuente] ?? fuente;
}

function tiempoRelativo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} días`;
}

export default function LibroErrores() {
  const { materiaId } = useParams<{ materiaId: string }>();
  const navigate = useNavigate();

  const [errores, setErrores] = useState<ErrorEntry[]>([]);
  const [temas, setTemas] = useState<Record<string, string>>({});
  const [materiaNombre, setMateriaNombre] = useState("");
  const [cargando, setCargando] = useState(true);
  const [filtroFuente, setFiltroFuente] = useState<FuenteFiltro>("todas");
  const [orden, setOrden] = useState<Orden>("frecuencia");
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [lanzando, setLanzando] = useState(false);

  const cargar = useCallback(async () => {
    if (!materiaId) return;
    setCargando(true);
    try {
      const [errRes, matRes, temasRes] = await Promise.all([
        api.get(`/srs/errores/${materiaId}`),
        api.get(`/materias/${materiaId}`),
        api.get(`/materias/${materiaId}/temas`),
      ]);
      setErrores(errRes.data.errores || []);
      setMateriaNombre(matRes.data.nombre || "");
      const mapaT: Record<string, string> = {};
      for (const t of (temasRes.data.temas || [])) {
        mapaT[t.id] = t.nombre;
      }
      setTemas(mapaT);
    } catch { /* silencioso */ }
    setCargando(false);
  }, [materiaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const erroresFiltrados = errores
    .filter(e => filtroFuente === "todas" || e.fuente === filtroFuente)
    .sort((a, b) =>
      orden === "frecuencia"
        ? b.veces_fallada - a.veces_fallada
        : new Date(b.ultima_vez).getTime() - new Date(a.ultima_vez).getTime()
    );

  const totalFallos = errores.reduce((s, e) => s + e.veces_fallada, 0);
  const masRepetido = errores.reduce<ErrorEntry | null>((m, e) => (!m || e.veces_fallada > m.veces_fallada) ? e : m, null);
  const temasAfectados = new Set(errores.map(e => e.tema_id).filter(Boolean)).size;

  // Top 3 temas más fallados para simulacro dirigido
  const temasDebiles = [...new Set(
    [...errores]
      .sort((a, b) => b.veces_fallada - a.veces_fallada)
      .map(e => e.tema_id)
      .filter(Boolean)
  )].slice(0, 3) as string[];

  const lanzarSimulacro = () => {
    if (!materiaId) return;
    setLanzando(true);
    const params = temasDebiles.length ? `?temas=${temasDebiles.join(",")}` : "";
    navigate(`/simulacro/${materiaId}${params}`);
  };

  const toggleExpandir = (id: string) =>
    setExpandido(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--sepia-bg)" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center px-6 py-4 border-b"
        style={{ borderColor: "var(--sepia-border)", background: "var(--sepia-card)" }}
      >
        <Link
          to={`/materia/${materiaId}`}
          className="flex items-center gap-2 text-sm font-semibold transition-colors shrink-0"
          style={{ color: "var(--sepia-text-secondary)" }}
        >
          <ArrowLeft className="w-4 h-4" />
          {materiaNombre || "Materia"}
        </Link>

        <div className="flex-1 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" style={{ color: "var(--sepia-accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--sepia-text)" }}>
            Libro de errores
          </span>
        </div>

        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 shrink-0">
          {errores.length} conceptos
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

          {cargando ? (
            <div className="flex items-center justify-center py-24">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-8 h-8 rounded-full border-2 border-t-transparent"
                style={{ borderColor: "var(--sepia-accent)" }}
              />
            </div>
          ) : errores.length === 0 ? (
            /* ── Estado vacío ─────────────────────────────────────────── */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-24 space-y-4"
            >
              <div
                className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center"
                style={{ background: "var(--sepia-card)", border: "2px solid var(--sepia-border)" }}
              >
                <BookOpen className="w-10 h-10" style={{ color: "var(--sepia-accent)" }} />
              </div>
              <h2 className="text-xl font-serif" style={{ color: "var(--sepia-text)" }}>
                Sin errores registrados
              </h2>
              <p className="text-sm" style={{ color: "var(--sepia-text-secondary)" }}>
                Los errores de simulacros, talleres y repaso SRS aparecerán aquí.
              </p>
              <Link
                to={`/simulacro/${materiaId}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-2xl"
                style={{ background: "var(--sepia-accent)" }}
              >
                <ClipboardList className="w-4 h-4" /> Hacer un simulacro
              </Link>
            </motion.div>
          ) : (
            <>
              {/* ── Stats ──────────────────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    icon: <Flame className="w-5 h-5 text-red-500" />,
                    value: totalFallos,
                    label: "Fallos totales",
                    bg: "bg-red-50",
                    border: "border-red-100",
                  },
                  {
                    icon: <Target className="w-5 h-5 text-orange-500" />,
                    value: temasAfectados,
                    label: "Temas con errores",
                    bg: "bg-orange-50",
                    border: "border-orange-100",
                  },
                  {
                    icon: <Zap className="w-5 h-5 text-yellow-500" />,
                    value: masRepetido?.veces_fallada ?? 0,
                    label: "Máx. repeticiones",
                    bg: "bg-yellow-50",
                    border: "border-yellow-100",
                  },
                ].map(s => (
                  <div
                    key={s.label}
                    className={`${s.bg} border ${s.border} rounded-2xl p-4 text-center`}
                  >
                    <div className="flex justify-center mb-1">{s.icon}</div>
                    <p className="text-2xl font-bold" style={{ color: "var(--sepia-text)" }}>
                      {s.value}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--sepia-text-secondary)" }}>
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* ── CTA simulacro dirigido ─────────────────────────────── */}
              {temasDebiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between px-5 py-4 rounded-2xl border"
                  style={{
                    background: "linear-gradient(135deg, #F3EEFE 0%, #FEF0F0 100%)",
                    borderColor: "#E0D0FA",
                  }}
                >
                  <div>
                    <p className="text-sm font-bold" style={{ color: "var(--sepia-text)" }}>
                      Simulacro dirigido
                    </p>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--sepia-text-secondary)" }}>
                      Enfocado en los {temasDebiles.length} tema{temasDebiles.length > 1 ? "s" : ""} con más errores:{" "}
                      {temasDebiles.map(id => temas[id] ?? id).join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={lanzarSimulacro}
                    disabled={lanzando}
                    className="flex-shrink-0 ml-4 flex items-center gap-1.5 px-4 py-2.5 text-white text-sm font-bold rounded-xl cursor-pointer border-none transition-all hover:brightness-110 disabled:opacity-60"
                    style={{ background: "var(--sepia-accent)" }}
                  >
                    <Target className="w-4 h-4" />
                    {lanzando ? "Iniciando…" : "Iniciar"}
                  </button>
                </motion.div>
              )}

              {/* ── Filtros ────────────────────────────────────────────── */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: "var(--sepia-border)" }}>
                  {(["todas", "simulacro_mcq", "taller", "srs"] as FuenteFiltro[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setFiltroFuente(f)}
                      className="px-3 py-1.5 text-[12px] font-bold border-none cursor-pointer transition-colors"
                      style={{
                        background: filtroFuente === f ? "var(--sepia-accent)" : "var(--sepia-card)",
                        color: filtroFuente === f ? "#fff" : "var(--sepia-text-secondary)",
                      }}
                    >
                      {f === "todas" ? "Todos" : fuenterLabel(f)}
                    </button>
                  ))}
                </div>

                <div className="flex rounded-xl border overflow-hidden ml-auto" style={{ borderColor: "var(--sepia-border)" }}>
                  {([["frecuencia", "Más fallados"], ["reciente", "Más recientes"]] as [Orden, string][]).map(([o, lbl]) => (
                    <button
                      key={o}
                      onClick={() => setOrden(o)}
                      className="px-3 py-1.5 text-[12px] font-bold border-none cursor-pointer transition-colors"
                      style={{
                        background: orden === o ? "#6B6155" : "var(--sepia-card)",
                        color: orden === o ? "#fff" : "var(--sepia-text-secondary)",
                      }}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Lista de errores ────────────────────────────────────── */}
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {erroresFiltrados.map((e, i) => {
                    const heat = heatColor(e.veces_fallada);
                    const abierto = expandido[e.id];
                    const temaNombre = e.tema_id ? (temas[e.tema_id] ?? e.tema_id) : null;

                    return (
                      <motion.div
                        key={e.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ delay: i * 0.03 }}
                        className={`${heat.bg} border ${heat.border} rounded-2xl overflow-hidden`}
                      >
                        {/* Cabecera del error */}
                        <button
                          onClick={() => toggleExpandir(e.id)}
                          className="w-full flex items-start gap-3 p-4 text-left cursor-pointer bg-transparent border-none"
                        >
                          {/* Badge veces_fallada */}
                          <span className={`flex-shrink-0 mt-0.5 text-[11px] font-black px-2 py-0.5 rounded-full ${heat.badge}`}>
                            ×{e.veces_fallada}
                          </span>

                          <div className="flex-1 min-w-0">
                            <p className={`text-[13.5px] font-semibold leading-snug ${heat.text} line-clamp-2`}>
                              {e.pregunta}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {temaNombre && (
                                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/60 border border-white/80"
                                  style={{ color: "var(--sepia-text-secondary)" }}>
                                  {temaNombre}
                                </span>
                              )}
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/60 border border-white/80"
                                style={{ color: "var(--sepia-text-secondary)" }}>
                                {fuenterLabel(e.fuente)}
                              </span>
                              <span className="text-[11px]" style={{ color: "var(--sepia-text-secondary)" }}>
                                {tiempoRelativo(e.ultima_vez)}
                              </span>
                            </div>
                          </div>

                          <div className="flex-shrink-0 ml-2 mt-0.5" style={{ color: "var(--sepia-text-secondary)" }}>
                            {abierto
                              ? <ChevronUp className="w-4 h-4" />
                              : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </button>

                        {/* Respuesta correcta expandible */}
                        <AnimatePresence>
                          {abierto && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-4 pt-0">
                                <div className="bg-white/70 border border-white rounded-xl p-4">
                                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
                                    style={{ color: "var(--sepia-accent)" }}>
                                    Respuesta correcta
                                  </p>
                                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap"
                                    style={{ color: "var(--sepia-text)" }}>
                                    {e.respuesta_correcta}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {erroresFiltrados.length === 0 && (
                  <p className="text-center py-8 text-sm" style={{ color: "var(--sepia-text-secondary)" }}>
                    Sin errores para este filtro.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
