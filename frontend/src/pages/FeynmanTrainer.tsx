import { useState, useEffect } from "react";
import { useStore } from "@/services/store";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Lightbulb, Send, RotateCcw, Trophy, ArrowRight, ArrowLeft, Sparkles, BookOpen } from "lucide-react";
import api from "@/services/api";

interface EvaluacionFeynman {
  puntuacion: number;
  claridad: number;
  analogia: number;
  precision: number;
  simplicidad: number;
  feedback: string;
  huecos: string[];
  aprobado: boolean;
}

interface FeynmanProps {
  materiaId?: string | null
  temaId?: string | null
  compact?: boolean  // modo inline en MateriaContent (sin header standalone)
}

export default function FeynmanTrainer({ materiaId = null, temaId = null, compact = false }: FeynmanProps) {
  const materias = useStore((s) => s.materias);
  const temas = materias.flatMap((m) => m.temas);

  const [selectedTema, setSelectedTema] = useState(temaId || "");
  const [explicacion, setExplicacion] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [resultado, setResultado] = useState<EvaluacionFeynman | null>(null);
  const [ejemplos, setEjemplos] = useState<string[]>([]);
  const [pasoActual, setPasoActual] = useState(1);

  // Sincronizar con prop externa cuando se usa embebido
  useEffect(() => {
    if (temaId && temaId !== selectedTema) {
      setSelectedTema(temaId);
      setExplicacion("");
      setResultado(null);
      setPasoActual(1);
    }
  }, [temaId]);

  const temaSeleccionado = temas.find((t) => t.id === selectedTema);

  async function cargarEjemplos() {
    if (!temaSeleccionado) return;
    try {
      const res = await api.get("/feynman/ejemplos", {
        params: { tema: temaSeleccionado.nombre },
      });
      setEjemplos(res.data.ejemplos || []);
    } catch {
      setEjemplos([]);
    }
  }

  async function handleEvaluar() {
    if (!explicacion || explicacion.length < 20 || !temaSeleccionado) return;
    setIsEvaluating(true);
    setPasoActual(2);
    try {
      const res = await api.post("/feynman/evaluar", {
        tema_nombre: temaSeleccionado.nombre,
        explicacion,
        nivel: "normal",
      });
      setResultado(res.data);
    } catch {
      setResultado({
        puntuacion: 0,
        claridad: 0,
        analogia: 0,
        precision: 0,
        simplicidad: 0,
        feedback: "**Error de conexión.** No se pudo evaluar tu explicación. Intenta de nuevo.",
        huecos: [],
        aprobado: false,
      });
    }
    setIsEvaluating(false);
  }

  function handleReintentar() {
    setPasoActual(1);
    setResultado(null);
    setExplicacion("");
  }

  function handleSelectTema(id: string) {
    setSelectedTema(id);
    setExplicacion("");
    setResultado(null);
    setEjemplos([]);
    setPasoActual(1);
  }

  const barraWidth = resultado
    ? `${resultado.puntuacion}%`
    : "0%";

  return (
    <div className={compact ? "" : "min-h-screen bg-[var(--sepia-bg)]"}>
      <div className={compact ? "space-y-6" : "max-w-4xl mx-auto px-8 py-16 space-y-12"}>
        {/* Back link — solo standalone */}
        {!compact && (
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-accent)] uppercase tracking-wider transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver al inicio
        </Link>
        )}

        {/* Header — solo standalone */}
        {!compact && (
        <header className="text-center space-y-6">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-full">
            <BrainIcon />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--sepia-accent)]">
              Técnica Feynman
            </span>
          </div>
          <h1 className="text-5xl font-serif text-[var(--sepia-text)] leading-tight">
            Aprende a Explicar<br />
            <span className="text-[var(--sepia-accent)]">Como un Maestro</span>
          </h1>
          <p className="text-lg text-[var(--sepia-text-secondary)] max-w-2xl mx-auto font-light leading-relaxed">
            Richard Feynman creía que si no puedes explicar algo de forma simple,
            es que no lo entiendes realmente. Aquí entrenarás esa habilidad.
          </p>
        </header>
        )}

        {/* Paso 1: Seleccionar tema — solo standalone */}
        {!compact && (
        <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-3xl p-8 space-y-6">
          <h2 className="text-lg font-serif text-[var(--sepia-text)] flex items-center gap-3">
            <span className="w-8 h-8 bg-[var(--sepia-accent)]/10 text-[var(--sepia-accent)] rounded-xl flex items-center justify-center text-sm font-bold">
              1
            </span>
            Elige un tema para practicar
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto custom-scrollbar">
            {temas.map((tema) => (
              <button
                key={tema.id}
                onClick={() => handleSelectTema(tema.id)}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  selectedTema === tema.id
                    ? "border-[var(--sepia-accent)] bg-[var(--sepia-accent)]/5 shadow-lg"
                    : "border-[var(--sepia-border)] hover:border-[var(--sepia-accent)]/30 bg-[var(--sepia-bg)]"
                }`}
              >
                <div className="text-sm font-bold text-[var(--sepia-text)]">{tema.nombre}</div>
                {tema.descripcion && (
                  <div className="text-xs text-[var(--sepia-text-secondary)] mt-1 line-clamp-2">
                    {tema.descripcion}
                  </div>
                )}
              </button>
            ))}
          </div>

          {selectedTema && (
            <button
              onClick={cargarEjemplos}
              className="flex items-center gap-2 text-xs text-[var(--sepia-accent)] hover:underline font-bold uppercase tracking-wider"
            >
              <Lightbulb className="w-3.5 h-3.5" /> Ver ejemplos de analogías
            </button>
          )}

          {ejemplos.length > 0 && (
            <div className="bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-2xl p-5 space-y-2">
              <h4 className="text-xs font-bold text-[var(--sepia-text-secondary)] uppercase tracking-widest">
                💡 Ejemplos para inspirarte
              </h4>
              {ejemplos.map((ej, i) => (
                <p key={i} className="text-sm text-[var(--sepia-text)] italic leading-relaxed pl-4 border-l-2 border-[var(--sepia-accent)]/20">
                  "{ej}"
                </p>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Paso 2: Escribir explicación */}
        <AnimatePresence>
          {selectedTema && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-3xl p-8 space-y-6"
            >
              <h2 className="text-lg font-serif text-[var(--sepia-text)] flex items-center gap-3">
                <span className="w-8 h-8 bg-[var(--sepia-chart)]/10 text-[var(--sepia-chart)] rounded-xl flex items-center justify-center text-sm font-bold">
                  2
                </span>
                Explícalo como a un niño de 10 años
              </h2>

              <div className="bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-2xl p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-[var(--sepia-chart)] mt-0.5 shrink-0" />
                  <div className="text-sm text-[var(--sepia-text-secondary)] leading-relaxed">
                    <strong className="text-[var(--sepia-text)]">Imagina que...</strong> estás enseñándole{" "}
                    <strong>"{temaSeleccionado?.nombre}"</strong> a alguien que nunca ha estudiado el tema.
                    Usa objetos cotidianos, situaciones familiares, y evita palabras técnicas.
                  </div>
                </div>
              </div>

              <textarea
                value={explicacion}
                onChange={(e) => setExplicacion(e.target.value)}
                placeholder="Ejemplo: 'Imagina que tienes una caja de galletas. Cada galleta es un dato, y la caja es la memoria que las guarda...'"
                rows={7}
                className="w-full bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-2xl p-6 text-sm text-[var(--sepia-text)] placeholder:text-gray-400 resize-y focus:outline-none focus:border-[var(--sepia-chart)]/50 transition-colors"
                disabled={pasoActual === 2 && isEvaluating}
              />

              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--sepia-text-secondary)]">
                  {explicacion.length < 20
                    ? `Mínimo 20 caracteres (${explicacion.length}/20)`
                    : `${explicacion.length} caracteres — ¡Listo para evaluar!`}
                </span>
                <button
                  onClick={handleEvaluar}
                  disabled={isEvaluating || explicacion.length < 20}
                  className="flex items-center gap-2 px-8 py-3 bg-[var(--sepia-chart)] text-white text-xs font-bold rounded-2xl uppercase tracking-widest shadow-xl shadow-[var(--sepia-chart)]/20 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isEvaluating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Evaluando...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" /> Enviar explicación
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Paso 3: Resultado */}
        <AnimatePresence>
          {resultado && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-3xl p-8 space-y-8"
            >
              <h2 className="text-lg font-serif text-[var(--sepia-text)] flex items-center gap-3">
                <span className="w-8 h-8 bg-[var(--sepia-chart)]/10 text-[var(--sepia-chart)] rounded-xl flex items-center justify-center text-sm font-bold">
                  3
                </span>
                Resultado de tu explicación
              </h2>

              {/* Score */}
              <div className="text-center space-y-4">
                <div
                  className={`inline-flex items-center justify-center w-32 h-32 rounded-[40px] border-4 text-5xl font-serif shadow-inner ${
                    resultado.aprobado
                      ? "border-[var(--sepia-chart)] text-[var(--sepia-chart)] bg-[var(--sepia-chart)]/5"
                      : "border-red-400 text-red-400 bg-red-50/10"
                  }`}
                >
                  {resultado.puntuacion}
                </div>
                <div className="text-sm font-bold uppercase tracking-widest text-[var(--sepia-text)]">
                  {resultado.aprobado ? (
                    <span className="flex items-center justify-center gap-2 text-[var(--sepia-chart)]">
                      <Trophy className="w-4 h-4" /> ¡Dominas la técnica!
                    </span>
                  ) : (
                    <span className="text-red-400">Sigue practicando</span>
                  )}
                </div>
              </div>

              {/* Barras de detalle */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Claridad", value: resultado.claridad, max: 25, color: "bg-blue-400" },
                  { label: "Analogía", value: resultado.analogia, max: 30, color: "bg-[var(--sepia-chart)]" },
                  { label: "Precisión", value: resultado.precision, max: 25, color: "bg-purple-400" },
                  { label: "Simplicidad", value: resultado.simplicidad, max: 20, color: "bg-orange-400" },
                ].map((item) => (
                  <div key={item.label} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                      <span className="text-[var(--sepia-text-secondary)]">{item.label}</span>
                      <span className="text-[var(--sepia-text)]">
                        {item.value}/{item.max}
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--sepia-bg)] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full transition-all duration-700`}
                        style={{ width: `${(item.value / item.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Feedback */}
              <div className="bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-2xl p-6 space-y-4">
                <h4 className="text-xs font-bold text-[var(--sepia-accent)] uppercase tracking-widest flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5" /> Feedback del tutor
                </h4>
                <div className="text-sm text-[var(--sepia-text)] leading-relaxed whitespace-pre-wrap">
                  {resultado.feedback}
                </div>

                {resultado.huecos && resultado.huecos.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--sepia-border)]">
                    <h5 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
                      🔍 Conceptos que necesitas reforzar
                    </h5>
                    <ul className="space-y-1">
                      {resultado.huecos.map((h, i) => (
                        <li key={i} className="text-sm text-[var(--sepia-text-secondary)] flex items-start gap-2">
                          <ArrowRight className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex justify-center gap-4">
                <button
                  onClick={handleReintentar}
                  className="flex items-center gap-2 px-8 py-3 bg-[var(--sepia-bg)] border border-[var(--sepia-border)] text-[var(--sepia-text)] text-xs font-bold rounded-2xl uppercase tracking-widest hover:bg-[var(--sepia-card)] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Intentar otra explicación
                </button>
                {resultado.aprobado && (
                  <button className="flex items-center gap-2 px-8 py-3 bg-[var(--sepia-chart)] text-white text-xs font-bold rounded-2xl uppercase tracking-widest shadow-lg">
                    <Trophy className="w-3.5 h-3.5" /> Siguiente tema
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Guía rápida */}
        <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-3xl p-8">
          <h3 className="text-sm font-bold text-[var(--sepia-text)] uppercase tracking-widest mb-6">
            📖 Los 4 pasos de la Técnica Feynman
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: "1", title: "Elige", desc: "Selecciona un concepto que quieras dominar" },
              { step: "2", title: "Explica", desc: "Enséñalo con analogías cotidianas, sin jerga" },
              { step: "3", title: "Identifica", desc: "Encuentra lo que no puedes explicar simplemente" },
              { step: "4", title: "Refina", desc: "Vuelve a estudiar y simplifica aún más" },
            ].map((s) => (
              <div key={s.step} className="text-center space-y-3">
                <div className="w-12 h-12 bg-[var(--sepia-accent)]/10 text-[var(--sepia-accent)] rounded-2xl flex items-center justify-center text-lg font-bold mx-auto">
                  {s.step}
                </div>
                <div>
                  <div className="text-sm font-bold text-[var(--sepia-text)]">{s.title}</div>
                  <div className="text-xs text-[var(--sepia-text-secondary)] mt-1 leading-relaxed">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Icono cerebral simple
function BrainIcon() {
  return (
    <svg className="w-5 h-5 text-[var(--sepia-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4a4 4 0 0 1 4 4v1h-2a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h2v4a4 4 0 0 1-8 0v-4h2a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H8V8a4 4 0 0 1 4-4z" />
      <path d="M12 2a6 6 0 0 0-6 6c0 3 2 5 6 5s6-2 6-5a6 6 0 0 0-6-6z" opacity="0.3" fill="currentColor" />
    </svg>
  );
}
