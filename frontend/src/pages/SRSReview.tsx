import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useStore } from "@/services/store";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Brain, CheckCircle2, XCircle, AlertCircle, Flame, BookOpen } from "lucide-react";
import api from "@/services/api";

interface Flashcard {
  id: string;
  tema_id: string | null;
  pregunta: string;
  respuesta: string;
  repeticiones: number;
  intervalo: number;
}

interface SRSStats {
  total: number;
  pendientes_hoy: number;
  aprendidas: number;
  nuevas: number;
  errores_registrados: number;
}

type Fase = "cargando" | "vacia" | "frente" | "dorso" | "fin";

const CALIFICACIONES = [
  { label: "No lo sé", valor: 0, color: "bg-red-500 hover:bg-red-600", icono: "💀" },
  { label: "Difícil", valor: 2, color: "bg-orange-400 hover:bg-orange-500", icono: "😅" },
  { label: "Bien", valor: 4, color: "bg-[var(--sepia-chart)] hover:brightness-110", icono: "✅" },
  { label: "Fácil", valor: 5, color: "bg-[var(--sepia-accent)] hover:brightness-110", icono: "⚡" },
];

export default function SRSReview() {
  const { materiaId } = useParams<{ materiaId: string }>();
  const fetchMaterias = useStore((s) => s.fetchMaterias);

  const [cola, setCola] = useState<Flashcard[]>([]);
  const [stats, setStats] = useState<SRSStats | null>(null);
  const [indice, setIndice] = useState(0);
  const [fase, setFase] = useState<Fase>("cargando");
  const [mostrandoRespuesta, setMostrandoRespuesta] = useState(false);
  const [resultados, setResultados] = useState<{ correcto: number; incorrecto: number }>({ correcto: 0, incorrecto: 0 });
  const [materiaNombre, setMateriaNombre] = useState("");

  const cargarCola = useCallback(async () => {
    if (!materiaId) return;
    setFase("cargando");
    try {
      const [colaRes, statsRes, materiaRes] = await Promise.all([
        api.get(`/srs/cola/${materiaId}`),
        api.get(`/srs/stats/${materiaId}`),
        api.get(`/materias/${materiaId}`),
      ]);
      setCola(colaRes.data.flashcards || []);
      setStats(statsRes.data);
      setMateriaNombre(materiaRes.data.nombre || "");
      setFase(colaRes.data.flashcards?.length > 0 ? "frente" : "vacia");
      setIndice(0);
      setResultados({ correcto: 0, incorrecto: 0 });
    } catch {
      setFase("vacia");
    }
  }, [materiaId]);

  useEffect(() => { cargarCola(); }, [cargarCola]);

  const tarjeta = cola[indice];

  const calificar = async (valor: number) => {
    if (!tarjeta) return;
    try {
      await api.post("/srs/revisar", { flashcard_id: tarjeta.id, calificacion: valor });
    } catch { /* silencioso */ }

    setResultados(prev => ({
      correcto: prev.correcto + (valor >= 3 ? 1 : 0),
      incorrecto: prev.incorrecto + (valor < 3 ? 1 : 0),
    }));

    const siguiente = indice + 1;
    if (siguiente >= cola.length) {
      setFase("fin");
      // Refrescar dominio en el store (el backend ya lo actualizó)
      fetchMaterias().catch(() => {});
    } else {
      setIndice(siguiente);
      setMostrandoRespuesta(false);
    }
  };

  const progreso = cola.length > 0 ? Math.round((indice / cola.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[var(--sepia-bg)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center px-6 py-4 border-b border-[var(--sepia-border)] bg-[var(--sepia-card)]">
        <Link
          to={`/materias/${materiaId}`}
          className="flex items-center gap-2 text-sm text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-text)] transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" /> {materiaNombre || "Materia"}
        </Link>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Brain className="w-4 h-4 text-[var(--sepia-accent)]" />
          <span className="text-sm font-bold text-[var(--sepia-text)]">Repaso diario</span>
        </div>
        {stats && (
          <div className="flex items-center gap-3 text-xs text-[var(--sepia-text-secondary)] shrink-0">
            <span><strong className="text-[var(--sepia-text)]">{stats.aprendidas}</strong> dominadas</span>
            <span><strong className="text-[var(--sepia-accent)]">{stats.pendientes_hoy}</strong> hoy</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {fase !== "cargando" && fase !== "vacia" && fase !== "fin" && cola.length > 0 && (
        <div className="h-1 bg-[var(--sepia-border)]">
          <motion.div
            className="h-full bg-[var(--sepia-accent)]"
            animate={{ width: `${progreso}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-6">
        <AnimatePresence mode="wait">

          {/* Cargando */}
          {fase === "cargando" && (
            <motion.div key="cargando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--sepia-accent)]/10 flex items-center justify-center animate-pulse">
                <Brain className="w-6 h-6 text-[var(--sepia-accent)]" />
              </div>
              <p className="text-sm text-[var(--sepia-text-secondary)]">Cargando tarjetas...</p>
            </motion.div>
          )}

          {/* Cola vacía */}
          {fase === "vacia" && (
            <motion.div key="vacia" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-6 max-w-sm">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-green-50 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div>
                <h2 className="text-xl font-serif text-[var(--sepia-text)] mb-2">
                  {stats?.total === 0 ? "Sin flashcards aún" : "¡Todo al día!"}
                </h2>
                <p className="text-sm text-[var(--sepia-text-secondary)]">
                  {stats?.total === 0
                    ? "Estudia un tema y genera flashcards desde la pestaña Teoría."
                    : `No tienes tarjetas pendientes. Tienes ${stats?.aprendidas} tarjetas dominadas.`}
                </p>
              </div>
              {stats && stats.total > 0 && (
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Total", value: stats.total, color: "text-[var(--sepia-text)]" },
                    { label: "Dominadas", value: stats.aprendidas, color: "text-green-600" },
                    { label: "Errores", value: stats.errores_registrados, color: "text-red-500" },
                  ].map(s => (
                    <div key={s.label} className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-2xl p-3">
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-[var(--sepia-text-secondary)] uppercase tracking-wider mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
              <Link
                to={`/materias/${materiaId}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--sepia-accent)] text-white text-sm font-bold rounded-2xl"
              >
                <BookOpen className="w-4 h-4" /> Ir a estudiar
              </Link>
            </motion.div>
          )}

          {/* Tarjeta — frente */}
          {(fase === "frente" || fase === "dorso") && tarjeta && (
            <motion.div
              key={`card-${tarjeta.id}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="w-full max-w-xl space-y-6"
            >
              {/* Contador */}
              <div className="flex items-center justify-between text-xs text-[var(--sepia-text-secondary)]">
                <span>{indice + 1} / {cola.length}</span>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-green-600 font-bold">{resultados.correcto}</span>
                  <XCircle className="w-3.5 h-3.5 text-red-400 ml-2" />
                  <span className="text-red-500 font-bold">{resultados.incorrecto}</span>
                </div>
              </div>

              {/* Card body */}
              <div className="bg-[var(--sepia-card)] border-2 border-[var(--sepia-border)] rounded-3xl overflow-hidden shadow-xl">
                {/* Pregunta — siempre visible */}
                <div className="p-8">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--sepia-accent)] mb-4">Pregunta</p>
                  <p className="text-lg text-[var(--sepia-text)] leading-relaxed font-serif">
                    {tarjeta.pregunta}
                  </p>
                </div>

                {/* Respuesta — se revela */}
                <AnimatePresence>
                  {mostrandoRespuesta && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t-2 border-[var(--sepia-border)] bg-[var(--sepia-bg)]/50"
                    >
                      <div className="p-8">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--sepia-chart)] mb-4">Respuesta</p>
                        <p className="text-base text-[var(--sepia-text)] leading-relaxed whitespace-pre-wrap">
                          {tarjeta.respuesta}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Botones */}
              {!mostrandoRespuesta ? (
                <button
                  onClick={() => setMostrandoRespuesta(true)}
                  className="w-full py-4 bg-[var(--sepia-accent)] text-white font-bold rounded-2xl text-sm uppercase tracking-widest hover:brightness-110 transition-all shadow-lg"
                >
                  Ver respuesta
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-center text-[var(--sepia-text-secondary)] uppercase tracking-wider">¿Cómo te fue?</p>
                  <div className="grid grid-cols-4 gap-2">
                    {CALIFICACIONES.map(c => (
                      <button
                        key={c.valor}
                        onClick={() => calificar(c.valor)}
                        className={`py-3 rounded-2xl text-white font-bold text-xs ${c.color} transition-all shadow-md flex flex-col items-center gap-1`}
                      >
                        <span className="text-lg">{c.icono}</span>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-center text-[var(--sepia-text-secondary)]">
                    Fácil = próxima revisión en {Math.round(tarjeta.intervalo * 2.5)} días · Difícil = 1 día
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Fin de sesión */}
          {fase === "fin" && (
            <motion.div key="fin" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6 max-w-sm">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-[var(--sepia-accent)]/10 flex items-center justify-center">
                <Flame className="w-10 h-10 text-[var(--sepia-accent)]" />
              </div>
              <div>
                <h2 className="text-2xl font-serif text-[var(--sepia-text)] mb-2">Sesión completada</h2>
                <p className="text-sm text-[var(--sepia-text-secondary)]">
                  Repasaste {cola.length} tarjeta{cola.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{resultados.correcto}</p>
                  <p className="text-xs text-green-700 uppercase tracking-wider mt-1">Correctas</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-bold text-red-500">{resultados.incorrecto}</p>
                  <p className="text-xs text-red-600 uppercase tracking-wider mt-1">A repasar</p>
                </div>
              </div>
              {stats && (
                <p className="text-xs text-[var(--sepia-text-secondary)]">
                  {stats.aprendidas} tarjetas dominadas de {stats.total} totales
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={cargarCola}
                  className="flex-1 py-3 bg-[var(--sepia-accent)]/10 border border-[var(--sepia-accent)]/30 text-[var(--sepia-accent)] font-bold text-sm rounded-2xl hover:bg-[var(--sepia-accent)]/20 transition-all"
                >
                  Repasar de nuevo
                </button>
                <Link
                  to={`/materias/${materiaId}`}
                  className="flex-1 py-3 bg-[var(--sepia-accent)] text-white font-bold text-sm rounded-2xl text-center"
                >
                  Volver a estudiar
                </Link>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
