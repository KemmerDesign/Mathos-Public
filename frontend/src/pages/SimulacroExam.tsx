import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "@/services/store";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, Send, AlertTriangle, CheckCircle2, Circle, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/services/api";

interface Pregunta {
  id: number;
  tema: string;
  tipo: string;
  enunciado: string;
  puntuacion_maxima: number;
  criterios_evaluacion: string[];
  // MCQ fields
  opciones?: string[];
  respuesta_correcta?: string;
  explicacion?: string;
}

interface ExamenData {
  examen_id: string;
  materia_id: string;
  titulo: string;
  instrucciones: string;
  duracion_minutos: number;
  preguntas: Pregunta[];
  generado_en: string;
}

interface Respuesta {
  pregunta_id: number;
  respuesta_texto: string;
}

interface CorreccionData {
  puntuacion_total: number;
  aprobado: boolean;
  feedback_general: string;
  tipo?: string;
  correctas?: number;
  total?: number;
  preguntas: {
    id: number;
    puntuacion: number;
    puntuacion_maxima: number;
    feedback: string;
    respuesta_modelo: string;
    // MCQ extras
    acertada?: boolean;
    respuesta_estudiante?: string;
    respuesta_correcta?: string;
  }[];
}

type Fase = "carga" | "instrucciones" | "examen" | "corrigiendo" | "resultado";

export default function SimulacroExam() {
  const { materiaId } = useParams<{ materiaId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fetchMaterias = useStore((s) => s.fetchMaterias);
  // tema_ids pasados desde Libro de errores (?temas=id1,id2,id3)
  const temaIdsParam = searchParams.get("temas");
  const temaIds: string[] | undefined = temaIdsParam ? temaIdsParam.split(",").filter(Boolean) : undefined;

  const [fase, setFase] = useState<Fase>("carga");
  const [examen, setExamen] = useState<ExamenData | null>(null);
  const [respuestas, setRespuestas] = useState<Record<number, string>>({});
  const [preguntaActual, setPreguntaActual] = useState(0);
  const [tiempoRestante, setTiempoRestante] = useState(0);
  const [correccion, setCorreccion] = useState<CorreccionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [materiaNombre, setMateriaNombre] = useState("");

  // Cargar nombre de la materia
  useEffect(() => {
    api.get(`/materias/${materiaId}`)
      .then(res => setMateriaNombre(res.data.nombre))
      .catch(() => {});
  }, [materiaId]);

  // Generar examen
  const esOracle = materiaNombre.toLowerCase().includes("oracle") || materiaNombre.toLowerCase().includes("sql");
  const tipoExamen = esOracle ? "mcq" : "desarrollo";
  const numPreguntas = esOracle ? 20 : 10;

  const generarExamen = useCallback(async () => { // eslint-disable-line react-hooks/exhaustive-deps
    setFase("carga");
    setError(null);
    try {
      const res = await api.post("/simulacro/generar", {
        materia_id: materiaId,
        num_preguntas: numPreguntas,
        tipo_examen: tipoExamen,
        ...(temaIds ? { tema_ids: temaIds } : {}),
      });
      setExamen(res.data);
      setTiempoRestante((res.data.duracion_minutos || 120) * 60);
      setRespuestas({});
      setPreguntaActual(0);
      setFase("instrucciones");
    } catch (e: any) {
      setError(e.message || "Error al generar el examen");
      setFase("carga");
    }
  }, [materiaId, temaIds?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (materiaId) generarExamen();
  }, [materiaId, generarExamen]);

  // Timer
  useEffect(() => {
    if (fase !== "examen" || tiempoRestante <= 0) return;
    const timer = setInterval(() => {
      setTiempoRestante(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          entregarExamen();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fase, tiempoRestante]);

  const formatTiempo = (segundos: number) => {
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const iniciarExamen = () => setFase("examen");

  const actualizarRespuesta = (preguntaId: number, texto: string) => {
    setRespuestas(prev => ({ ...prev, [preguntaId]: texto }));
  };

  const respondidas = Object.values(respuestas).filter(r => r.trim().length > 0).length;
  const totalPreguntas = examen?.preguntas.length || 0;

  const entregarExamen = async () => {
    if (!examen) return;
    setFase("corrigiendo");

    const respuestasList: Respuesta[] = examen.preguntas.map(p => ({
      pregunta_id: p.id,
      respuesta_texto: respuestas[p.id] || "",
    }));

    try {
      const res = await api.post("/simulacro/corregir", {
        materia_id: materiaId,
        materia_nombre: materiaNombre || examen.titulo,
        preguntas: examen.preguntas,
        respuestas: respuestasList,
        tipo_examen: tipoExamen,
      });
      setCorreccion(res.data);
      setFase("resultado");
      // Refrescar dominio en el store (el backend ya lo actualizó)
      fetchMaterias().catch(() => {});
    } catch (e: any) {
      setError(e.message || "Error al corregir");
      setFase("examen"); // Volver al examen si falla
    }
  };

  // ── Carga ──
  if (fase === "carga") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--sepia-bg)]">
        <div className="text-center space-y-6">
          <div className="animate-spin w-12 h-12 border-3 border-[var(--sepia-accent)]/20 border-t-[var(--sepia-accent)] rounded-full mx-auto" />
          <p className="text-lg text-[var(--sepia-text-secondary)] font-light">
            {error ? "Reintentando..." : "Generando examen con IA..."}
          </p>
          {error && (
            <div className="space-y-4">
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={generarExamen} className="px-6 py-2 bg-[var(--sepia-accent)] text-white rounded-xl font-bold">
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Instrucciones ──
  if (fase === "instrucciones" && examen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--sepia-bg)] p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl w-full bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-[40px] p-12 shadow-2xl space-y-8">
          <div className="text-center space-y-4">
            <span className="text-6xl">📝</span>
            <h1 className="text-3xl font-serif text-[var(--sepia-text)]">{examen.titulo}</h1>
            <p className="text-[var(--sepia-text-secondary)]">{materiaNombre}</p>
          </div>

          <div className="bg-[var(--sepia-bg)]/50 border border-[var(--sepia-border)] rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--sepia-accent)]">Instrucciones</h3>
            <p className="text-sm text-[var(--sepia-text-secondary)] leading-relaxed whitespace-pre-line">
              {examen.instrucciones || "Responde a todas las preguntas. Tienes tiempo limitado."}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[var(--sepia-bg)]/50 border border-[var(--sepia-border)] rounded-2xl p-4 text-center">
              <div className="text-2xl font-bold text-[var(--sepia-accent)]">{examen.preguntas.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--sepia-text-secondary)] mt-1">Preguntas</div>
            </div>
            <div className="bg-[var(--sepia-bg)]/50 border border-[var(--sepia-border)] rounded-2xl p-4 text-center">
              <div className="text-2xl font-bold text-[var(--sepia-accent)]">{Math.floor(examen.duracion_minutos / 60)}h {examen.duracion_minutos % 60}m</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--sepia-text-secondary)] mt-1">Duración</div>
            </div>
            <div className="bg-[var(--sepia-bg)]/50 border border-[var(--sepia-border)] rounded-2xl p-4 text-center">
              <div className="text-2xl font-bold text-[var(--sepia-accent)]">100</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--sepia-text-secondary)] mt-1">Pts Total</div>
            </div>
          </div>

          <div className="flex gap-4">
            <Link to="/" className="flex-1 px-6 py-3 border border-[var(--sepia-border)] text-[var(--sepia-text-secondary)] rounded-xl font-bold text-center hover:bg-[var(--sepia-bg)] transition-colors">
              Cancelar
            </Link>
            <button onClick={iniciarExamen} className="flex-1 px-6 py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-colors">
              Iniciar Examen
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Examen ──
  if (fase === "examen" && examen) {
    const pregunta = examen.preguntas[preguntaActual];

    return (
      <div className="min-h-screen flex flex-col bg-[var(--sepia-bg)]">
        {/* Header / Barra superior */}
        <div className="shrink-0 bg-[var(--sepia-card)] border-b border-[var(--sepia-border)] px-6 py-3 flex items-center shadow-sm">
          <Link to="/" className="text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-accent)] transition-colors shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1 flex flex-col items-center">
            <h2 className="text-sm font-bold text-[var(--sepia-text)]">{examen.titulo}</h2>
            <p className="text-[10px] text-[var(--sepia-text-secondary)] uppercase tracking-wider">
              Pregunta {preguntaActual + 1} de {totalPreguntas}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--sepia-text-secondary)] shrink-0">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full font-mono font-bold ${tiempoRestante < 300 ? "bg-red-50 text-red-600" : "bg-[var(--sepia-bg)] text-[var(--sepia-text)]"}`}>
              <Clock size={13} />
              {formatTiempo(tiempoRestante)}
            </div>
            <span className="font-bold">{respondidas}</span>/{totalPreguntas}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 flex overflow-hidden">
          {/* Panel principal - pregunta */}
          <div className="flex-1 overflow-y-auto p-8">
            <motion.div key={preguntaActual} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-3xl mx-auto space-y-6">
              {/* Badges */}
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-[var(--sepia-accent)]/10 text-[var(--sepia-accent)] text-[10px] font-bold rounded-full uppercase tracking-wider">
                  {pregunta.tipo}
                </span>
                <span className="px-3 py-1 bg-[var(--sepia-bg)] text-[var(--sepia-text-secondary)] text-[10px] font-bold rounded-full">
                  {pregunta.puntuacion_maxima} pts
                </span>
                <span className="text-[10px] text-[var(--sepia-text-secondary)] uppercase tracking-wider">
                  {pregunta.tema}
                </span>
              </div>

              {/* Enunciado */}
              <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-2xl p-8">
                <h3 className="text-lg font-serif text-[var(--sepia-text)] leading-relaxed whitespace-pre-line">
                  {pregunta.enunciado}
                </h3>

                {pregunta.criterios_evaluacion && pregunta.criterios_evaluacion.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-[var(--sepia-border)]/50">
                    <p className="text-[10px] font-bold text-[var(--sepia-text-secondary)] uppercase tracking-wider mb-2">Criterios de evaluación</p>
                    <ul className="list-disc list-inside text-xs text-[var(--sepia-text-secondary)] space-y-1">
                      {pregunta.criterios_evaluacion.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Área de respuesta */}
              {pregunta.tipo === "mcq" && pregunta.opciones ? (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-[var(--sepia-text-secondary)] uppercase tracking-wider">
                    Elige una opción
                  </label>
                  <div className="space-y-2">
                    {pregunta.opciones.map((opcion) => {
                      const letra = opcion.charAt(0);
                      const seleccionada = respuestas[pregunta.id] === letra;
                      return (
                        <button
                          key={letra}
                          onClick={() => actualizarRespuesta(pregunta.id, letra)}
                          className={`w-full text-left px-5 py-4 rounded-2xl border-2 text-sm leading-relaxed transition-all cursor-pointer ${
                            seleccionada
                              ? "border-[var(--sepia-accent)] bg-[var(--sepia-accent)]/8 text-[var(--sepia-text)] font-medium"
                              : "border-[var(--sepia-border)] bg-[var(--sepia-card)] text-[var(--sepia-text)] hover:border-[var(--sepia-accent)]/40 hover:bg-[var(--sepia-bg)]"
                          }`}
                        >
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold mr-3 shrink-0 ${
                            seleccionada
                              ? "bg-[var(--sepia-accent)] text-white"
                              : "bg-[var(--sepia-bg)] border border-[var(--sepia-border)] text-[var(--sepia-text-secondary)]"
                          }`}>{letra}</span>
                          {opcion.slice(3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-[var(--sepia-text-secondary)] uppercase tracking-wider">
                    Tu respuesta
                  </label>
                  <textarea
                    value={respuestas[pregunta.id] || ""}
                    onChange={e => actualizarRespuesta(pregunta.id, e.target.value)}
                    placeholder="Escribe tu respuesta aquí... Incluye fórmulas en LaTeX si es necesario."
                    rows={12}
                    className="w-full bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-2xl p-6 text-[var(--sepia-text)] placeholder:text-[var(--sepia-text-secondary)]/40 focus:outline-none focus:border-[var(--sepia-accent)]/50 focus:ring-4 focus:ring-[var(--sepia-accent)]/5 resize-none transition-all text-sm leading-relaxed"
                  />
                </div>
              )}

              {/* Navegación */}
              <div className="flex items-center justify-between pt-4">
                <button
                  onClick={() => setPreguntaActual(prev => Math.max(0, prev - 1))}
                  disabled={preguntaActual === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-accent)] disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={16} /> Anterior
                </button>

                <div className="flex gap-2">
                  {examen.preguntas.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPreguntaActual(i)}
                      className={`w-3 h-3 rounded-full transition-all ${
                        i === preguntaActual
                          ? "bg-[var(--sepia-accent)] scale-125"
                          : respuestas[examen.preguntas[i].id]?.trim()
                          ? "bg-[var(--sepia-chart)]"
                          : "bg-[var(--sepia-border)]"
                      }`}
                    />
                  ))}
                </div>

                {preguntaActual < totalPreguntas - 1 ? (
                  <button
                    onClick={() => setPreguntaActual(prev => Math.min(totalPreguntas - 1, prev + 1))}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-accent)] transition-colors"
                  >
                    Siguiente <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={entregarExamen}
                    className="flex items-center gap-2 px-6 py-2 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors"
                  >
                    <Send size={14} /> Entregar Examen
                  </button>
                )}
              </div>
            </motion.div>
          </div>

          {/* Sidebar de navegación */}
          <aside className="w-64 shrink-0 border-l border-[var(--sepia-border)] bg-[var(--sepia-card)]/50 p-4 overflow-y-auto hidden lg:block">
            <h3 className="text-[10px] font-bold text-[var(--sepia-text-secondary)] uppercase tracking-wider mb-3">Preguntas</h3>
            <div className="space-y-1">
              {examen.preguntas.map((p, i) => {
                const respondida = respuestas[p.id]?.trim()?.length > 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPreguntaActual(i)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center gap-2 transition-all ${
                      i === preguntaActual
                        ? "bg-[var(--sepia-accent)]/10 border border-[var(--sepia-accent)]/20 font-bold text-[var(--sepia-accent)]"
                        : respondida
                        ? "bg-[var(--sepia-chart)]/5 hover:bg-[var(--sepia-bg)] text-[var(--sepia-text)]"
                        : "text-[var(--sepia-text-secondary)] hover:bg-[var(--sepia-bg)]"
                    }`}
                  >
                    {respondida ? (
                      <CheckCircle2 size={12} className="text-[var(--sepia-chart)] shrink-0" />
                    ) : (
                      <Circle size={12} className="text-[var(--sepia-border)] shrink-0" />
                    )}
                    <span className="truncate">P{p.id} — {p.tema.substring(0, 20)}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 pt-6 border-t border-[var(--sepia-border)]/50">
              <button
                onClick={entregarExamen}
                disabled={respondidas === 0}
                className="w-full px-4 py-3 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                <Send size={14} /> Entregar
              </button>
              {respondidas < totalPreguntas && (
                <p className="text-[9px] text-[var(--sepia-text-secondary)] text-center mt-2">
                  <AlertTriangle size={10} className="inline mr-1" />
                  {totalPreguntas - respondidas} preguntas sin responder
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // ── Corrigiendo ──
  if (fase === "corrigiendo") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--sepia-bg)]">
        <div className="text-center space-y-6">
          <div className="animate-spin w-12 h-12 border-3 border-[var(--sepia-chart)]/20 border-t-[var(--sepia-chart)] rounded-full mx-auto" />
          <p className="text-lg text-[var(--sepia-text-secondary)] font-light">Corrigiendo examen con IA...</p>
          <p className="text-xs text-[var(--sepia-text-secondary)]/60">Esto puede tardar hasta un minuto</p>
        </div>
      </div>
    );
  }

  // ── Resultado ──
  if (fase === "resultado" && correccion && examen) {
    const puntColor = correccion.aprobado ? "text-[var(--sepia-chart)]" : "text-red-500";
    const puntBg = correccion.aprobado ? "bg-[var(--sepia-chart)]/10" : "bg-red-50";

    return (
      <div className="min-h-screen bg-[var(--sepia-bg)]">
        <div className="max-w-4xl mx-auto p-8 space-y-8">
          {/* Header resultado */}
          <div className="text-center space-y-4 py-8">
            <span className="text-6xl">{correccion.aprobado ? "🎉" : "📚"}</span>
            <h1 className="text-4xl font-serif text-[var(--sepia-text)]">
              {correccion.aprobado ? "¡Aprobado!" : "Sigue practicando"}
            </h1>
            <div className={`inline-flex items-center gap-2 px-6 py-3 ${puntBg} rounded-full`}>
              <span className={`text-3xl font-bold ${puntColor}`}>{correccion.puntuacion_total}</span>
              <span className="text-sm text-[var(--sepia-text-secondary)]">/ 100 puntos</span>
            </div>
          </div>

          {/* Feedback general */}
          <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-2xl p-8">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--sepia-accent)] mb-4">Feedback General</h3>
            <p className="text-[var(--sepia-text-secondary)] leading-relaxed whitespace-pre-line">
              {correccion.feedback_general}
            </p>
          </div>

          {/* Desglose MCQ */}
          {correccion.tipo === "mcq" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--sepia-text-secondary)]">Desglose</h3>
                <span className="text-xs text-[var(--sepia-text-secondary)]">
                  {correccion.correctas}/{correccion.total} correctas · umbral Oracle: 63%
                </span>
              </div>
              {correccion.preguntas.map((pc, i) => {
                const pregunta = examen.preguntas.find(p => p.id === pc.id);
                return (
                  <motion.div
                    key={pc.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`rounded-2xl border p-4 ${
                      pc.acertada
                        ? "bg-green-50/60 border-green-200"
                        : "bg-red-50/60 border-red-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg shrink-0 mt-0.5">{pc.acertada ? "✅" : "❌"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-[var(--sepia-text-secondary)] uppercase tracking-wider mb-1">
                          P{pc.id} · {pregunta?.tema}
                        </p>
                        <p className="text-sm text-[var(--sepia-text)] leading-snug mb-2">{pregunta?.enunciado}</p>
                        {!pc.acertada && (
                          <div className="flex gap-3 text-xs mt-1">
                            <span className="text-red-600">Tu respuesta: <strong>{pc.respuesta_estudiante || "—"}</strong></span>
                            <span className="text-green-700">Correcta: <strong>{pc.respuesta_correcta}</strong></span>
                          </div>
                        )}
                        {pc.respuesta_modelo && (
                          <details className="mt-2">
                            <summary className="text-[11px] text-[var(--sepia-accent)] cursor-pointer font-bold">Ver explicación</summary>
                            <p className="mt-1 text-xs text-[var(--sepia-text-secondary)] leading-relaxed">{pc.respuesta_modelo}</p>
                          </details>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* Desglose desarrollo (original) */
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--sepia-text-secondary)]">Desglose por Pregunta</h3>
              {correccion.preguntas.map((pc, i) => {
                const pregunta = examen.preguntas.find(p => p.id === pc.id);
                return (
                  <motion.div
                    key={pc.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-2xl p-6"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-[10px] font-bold text-[var(--sepia-text-secondary)] uppercase tracking-wider">
                          Pregunta {pc.id} — {pregunta?.tema || "?"}
                        </span>
                        <p className="text-sm text-[var(--sepia-text)] mt-1 line-clamp-2">{pregunta?.enunciado}</p>
                      </div>
                      <div className={`shrink-0 px-3 py-1 rounded-full text-sm font-bold ${
                        pc.puntuacion / pc.puntuacion_maxima >= 0.7 ? "bg-[var(--sepia-chart)]/10 text-[var(--sepia-chart)]" :
                        pc.puntuacion / pc.puntuacion_maxima >= 0.4 ? "bg-yellow-50 text-yellow-600" : "bg-red-50 text-red-600"
                      }`}>
                        {pc.puntuacion}/{pc.puntuacion_maxima}
                      </div>
                    </div>

                    <div className="bg-[var(--sepia-bg)]/50 border border-[var(--sepia-border)] rounded-xl p-4 mb-3">
                      <p className="text-[10px] font-bold text-[var(--sepia-accent)] uppercase tracking-wider mb-2">Feedback</p>
                      <p className="text-sm text-[var(--sepia-text-secondary)] leading-relaxed whitespace-pre-line">{pc.feedback}</p>
                    </div>

                    {pc.respuesta_modelo && (
                      <details className="text-xs">
                        <summary className="text-[var(--sepia-accent)] cursor-pointer font-bold uppercase tracking-wider">
                          Ver respuesta modelo
                        </summary>
                        <div className="mt-2 bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-xl p-4 whitespace-pre-line text-[var(--sepia-text-secondary)] leading-relaxed">
                          {pc.respuesta_modelo}
                        </div>
                      </details>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-4 pt-8">
            <Link to="/" className="flex-1 px-6 py-3 border border-[var(--sepia-border)] text-[var(--sepia-text-secondary)] rounded-xl font-bold text-center hover:bg-[var(--sepia-bg)] transition-colors">
              Volver al inicio
            </Link>
            <button onClick={generarExamen} className="flex-1 px-6 py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-colors">
              Nuevo Simulacro
            </button>
            <Link
              to={`/materia/${materiaId}`}
              className="flex-1 px-6 py-3 bg-[var(--sepia-accent)]/10 border border-[var(--sepia-accent)]/20 text-[var(--sepia-accent)] rounded-xl font-bold text-center hover:bg-[var(--sepia-accent)]/20 transition-colors"
            >
              Seguir Estudiando
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
