import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronLeft, ChevronRight, Send, RotateCcw, Trophy } from "lucide-react";
import api from "@/services/api";
import RichAnswerInput, { type RichAnswer } from "./RichAnswerInput";

interface Pregunta {
  id: number;
  tema: string;
  tipo: string;
  enunciado: string;
  puntuacion_maxima: number;
  opciones?: string[];
  respuesta_correcta?: string;
  explicacion?: string;
}

interface PreguntaCorregida {
  id: number;
  puntuacion: number;
  puntuacion_maxima: number;
  feedback: string;
  respuesta_modelo: string;
  acertada?: boolean;
  respuesta_estudiante?: string;
  respuesta_correcta?: string;
}

interface Correccion {
  puntuacion_total: number;
  aprobado: boolean;
  feedback_general: string;
  tipo?: string;
  correctas?: number;
  total?: number;
  preguntas: PreguntaCorregida[];
}

interface TopicQuizProps {
  materiaId: string;
  materiaNombre: string;
  temaId: string;
  temaNombre: string;
  esMCQ: boolean;
  onAprobado?: (puntuacion: number) => void;
}

type Fase = "idle" | "generando" | "quiz" | "corrigiendo" | "resultado";

export default function TopicQuiz({
  materiaId, materiaNombre, temaId, temaNombre, esMCQ, onAprobado,
}: TopicQuizProps) {
  const [fase, setFase] = useState<Fase>("idle");
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [respuestas, setRespuestas] = useState<Record<number, string>>({});
  const [richRespuestas, setRichRespuestas] = useState<Record<number, RichAnswer>>({});
  const [actual, setActual] = useState(0);
  const [correccion, setCorreccion] = useState<Correccion | null>(null);
  const [error, setError] = useState("");
  const [transcribiendo, setTranscribiendo] = useState(false);

  const NUM_PREGUNTAS = esMCQ ? 7 : 5;

  async function generar() {
    setFase("generando");
    setError("");
    setRespuestas({});
    setActual(0);
    try {
      const res = await api.post("/simulacro/generar", {
        materia_id: materiaId,
        num_preguntas: NUM_PREGUNTAS,
        tipo_examen: esMCQ ? "mcq" : "desarrollo",
        tema_ids: [temaId],
      });
      setPreguntas(res.data.preguntas || []);
      setFase("quiz");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Error al generar el quiz. Intenta de nuevo.");
      setFase("idle");
    }
  }

  async function corregir() {
    setTranscribiendo(true);
    setFase("corrigiendo");

    // Pre-procesar archivos/dibujos: transcribir con Gemini Vision
    const respuestasFinales: Record<number, string> = { ...respuestas };
    if (!esMCQ) {
      for (const pregunta of preguntas) {
        const rich = richRespuestas[pregunta.id];
        if (rich?.archivo) {
          try {
            const form = new FormData();
            form.append("archivo", rich.archivo);
            form.append("tema_nombre", temaNombre);
            const tr = await api.post("/vision/transcribir", form, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            const transcripcion = tr.data?.respuesta || "";
            const textoExtra = rich.texto ? `\n\n${rich.texto}` : "";
            respuestasFinales[pregunta.id] = `[Transcripción automática]:\n${transcripcion}${textoExtra}`;
          } catch {
            // fallback al texto disponible
            respuestasFinales[pregunta.id] = rich.texto || respuestas[pregunta.id] || "";
          }
        } else if (rich?.texto) {
          respuestasFinales[pregunta.id] = rich.texto;
        }
      }
    }

    setTranscribiendo(false);
    const respuestasArr = preguntas.map((p) => ({
      pregunta_id: p.id,
      respuesta_texto: esMCQ ? (respuestas[p.id] || "") : (respuestasFinales[p.id] || ""),
    }));
    try {
      const res = await api.post("/simulacro/corregir", {
        materia_id: materiaId,
        materia_nombre: materiaNombre,
        preguntas,
        respuestas: respuestasArr,
        tipo_examen: esMCQ ? "mcq" : "desarrollo",
      });
      setCorreccion(res.data);
      setFase("resultado");
      if (res.data.aprobado) onAprobado?.(res.data.puntuacion_total);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Error al corregir. Intenta de nuevo.");
      setFase("quiz");
    }
  }

  function reiniciar() {
    setFase("idle");
    setPreguntas([]);
    setRespuestas({});
    setRichRespuestas({});
    setCorreccion(null);
    setActual(0);
    setError("");
  }

  const pregunta = preguntas[actual];
  const respondidas = preguntas.filter(p =>
    (respuestas[p.id] && respuestas[p.id].trim()) ||
    richRespuestas[p.id]?.archivo != null
  ).length;
  const todasRespondidas = respondidas === preguntas.length;

  // ── IDLE ──────────────────────────────────────────────────
  if (fase === "idle") return (
    <div className="text-center space-y-5 py-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--sepia-accent)]/10 flex items-center justify-center">
        <span className="text-3xl">📝</span>
      </div>
      <div>
        <h4 className="text-base font-bold text-[var(--sepia-text)]">Quiz de {temaNombre}</h4>
        <p className="text-sm text-[var(--sepia-text-secondary)] mt-1">
          {NUM_PREGUNTAS} preguntas · solo este tema · {esMCQ ? "opción múltiple" : "desarrollo"}
        </p>
      </div>
      {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>}
      <button
        onClick={generar}
        className="inline-flex items-center gap-2 px-8 py-3 bg-[var(--sepia-accent)] text-white font-bold text-sm rounded-2xl hover:brightness-110 transition-all shadow-lg"
      >
        Generar quiz →
      </button>
    </div>
  );

  // ── GENERANDO ─────────────────────────────────────────────
  if (fase === "generando") return (
    <div className="text-center py-12 space-y-3">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--sepia-accent)] mx-auto" />
      <p className="text-sm text-[var(--sepia-text-secondary)]">Generando preguntas sobre {temaNombre}…</p>
    </div>
  );

  // ── CORRIGIENDO ───────────────────────────────────────────
  if (fase === "corrigiendo") return (
    <div className="text-center py-12 space-y-3">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--sepia-accent)] mx-auto" />
      <p className="text-sm text-[var(--sepia-text-secondary)]">
        {esMCQ
          ? "Calculando resultado…"
          : transcribiendo
          ? "Transcribiendo dibujos e imágenes con Gemini Vision…"
          : "Corrigiendo con IA…"
        }
      </p>
    </div>
  );

  // ── QUIZ ──────────────────────────────────────────────────
  if (fase === "quiz" && pregunta) return (
    <div className="space-y-5">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] text-[var(--sepia-text-secondary)]">
          <span>Pregunta {actual + 1} de {preguntas.length}</span>
          <span>{respondidas} respondida{respondidas !== 1 ? "s" : ""}</span>
        </div>
        <div className="h-1.5 bg-[var(--sepia-border)] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-[var(--sepia-accent)] rounded-full"
            animate={{ width: `${((actual + 1) / preguntas.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Pregunta */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pregunta.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-[var(--sepia-bg)]/60 border border-[var(--sepia-border)] rounded-2xl p-6 space-y-4"
        >
          <p className="text-base text-[var(--sepia-text)] leading-relaxed font-serif">{pregunta.enunciado}</p>

          {/* MCQ */}
          {esMCQ && pregunta.opciones ? (
            <div className="space-y-2">
              {pregunta.opciones.map((op) => {
                const letra = op.charAt(0);
                const sel = respuestas[pregunta.id] === letra;
                return (
                  <button
                    key={letra}
                    onClick={() => setRespuestas(r => ({ ...r, [pregunta.id]: letra }))}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all flex items-center gap-3 ${
                      sel
                        ? "border-[var(--sepia-accent)] bg-[var(--sepia-accent)]/8 font-semibold"
                        : "border-[var(--sepia-border)] hover:border-[var(--sepia-accent)]/40"
                    }`}
                  >
                    <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      sel ? "bg-[var(--sepia-accent)] text-white" : "bg-[var(--sepia-border)] text-[var(--sepia-text-secondary)]"
                    }`}>{letra}</span>
                    <span className="text-[var(--sepia-text)]">{op.slice(3)}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Desarrollo — rich input */
            <RichAnswerInput
              value={richRespuestas[pregunta.id] ?? { texto: respuestas[pregunta.id] || "", archivo: null, modo: "texto" }}
              onChange={(v) => {
                setRichRespuestas(r => ({ ...r, [pregunta.id]: v }));
                setRespuestas(r => ({ ...r, [pregunta.id]: v.texto }));
              }}
              placeholder="Escribe tu respuesta aquí…"
              temaNombre={temaNombre}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navegación */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActual(a => Math.max(0, a - 1))}
          disabled={actual === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-[var(--sepia-text-secondary)] border border-[var(--sepia-border)] rounded-xl disabled:opacity-30 hover:bg-[var(--sepia-card)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>

        {actual < preguntas.length - 1 ? (
          <button
            onClick={() => setActual(a => a + 1)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-[var(--sepia-accent)] border border-[var(--sepia-accent)]/40 rounded-xl hover:bg-[var(--sepia-accent)]/5 transition-colors"
          >
            Siguiente <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={corregir}
            disabled={!todasRespondidas}
            className="flex items-center gap-2 px-6 py-2 bg-[var(--sepia-accent)] text-white text-sm font-bold rounded-xl disabled:opacity-40 hover:brightness-110 transition-all shadow"
          >
            <Send className="w-3.5 h-3.5" /> Entregar
          </button>
        )}
      </div>

      {/* Dot navigator */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        {preguntas.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setActual(i)}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              i === actual ? "bg-[var(--sepia-accent)] scale-110" :
              respuestas[p.id] ? "bg-[var(--sepia-accent)]/40" : "bg-[var(--sepia-border)]"
            }`}
          />
        ))}
      </div>

      {!todasRespondidas && actual === preguntas.length - 1 && (
        <p className="text-xs text-center text-[var(--sepia-text-secondary)]">
          Faltan {preguntas.length - respondidas} respuesta{preguntas.length - respondidas !== 1 ? "s" : ""} — usa los puntos para navegar
        </p>
      )}
    </div>
  );

  // ── RESULTADO ─────────────────────────────────────────────
  if (fase === "resultado" && correccion) {
    const aprobado = correccion.aprobado;
    const pct = correccion.puntuacion_total;

    return (
      <div className="space-y-5">
        {/* Score header */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`text-center py-6 rounded-2xl border-2 ${
            aprobado ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
          }`}
        >
          {aprobado && <Trophy className="w-8 h-8 text-amber-500 mx-auto mb-2" />}
          <div className={`text-5xl font-bold font-serif mb-1 ${aprobado ? "text-green-700" : "text-red-600"}`}>
            {esMCQ ? `${correccion.correctas}/${correccion.total}` : `${Math.round(pct)}`}
          </div>
          <p className={`text-sm font-bold uppercase tracking-wider ${aprobado ? "text-green-700" : "text-red-600"}`}>
            {aprobado ? "✅ Aprobado" : "❌ No aprobado"}
          </p>
          {esMCQ && (
            <p className="text-xs text-[var(--sepia-text-secondary)] mt-1">{Math.round(pct)}% · umbral 63%</p>
          )}
        </motion.div>

        {/* Feedback general */}
        {correccion.feedback_general && (
          <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-xl px-5 py-4">
            <p className="text-sm text-[var(--sepia-text-secondary)] leading-relaxed">{correccion.feedback_general}</p>
          </div>
        )}

        {/* Desglose */}
        <div className="space-y-2">
          {correccion.preguntas.map((pc, i) => {
            const p = preguntas.find(x => x.id === pc.id);
            const ok = esMCQ ? pc.acertada : (pc.puntuacion / pc.puntuacion_maxima) >= 0.6;
            return (
              <motion.div
                key={pc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-xl border p-4 text-sm ${ok ? "bg-green-50/50 border-green-200" : "bg-red-50/50 border-red-200"}`}
              >
                <div className="flex gap-2 items-start">
                  <span className="shrink-0 mt-0.5">{ok ? "✅" : "❌"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--sepia-text)] leading-snug">{p?.enunciado}</p>
                    {esMCQ && !pc.acertada && (
                      <p className="text-xs mt-1">
                        <span className="text-red-600">Tu respuesta: <strong>{pc.respuesta_estudiante || "—"}</strong></span>
                        <span className="text-green-700 ml-3">Correcta: <strong>{pc.respuesta_correcta}</strong></span>
                      </p>
                    )}
                    {pc.respuesta_modelo && (
                      <details className="mt-1.5">
                        <summary className="text-[11px] text-[var(--sepia-accent)] cursor-pointer font-bold">
                          {esMCQ ? "Ver explicación" : "Ver respuesta modelo"}
                        </summary>
                        <p className="mt-1 text-xs text-[var(--sepia-text-secondary)] leading-relaxed">{pc.respuesta_modelo}</p>
                      </details>
                    )}
                  </div>
                  {!esMCQ && (
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {pc.puntuacion}/{pc.puntuacion_maxima}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        <button
          onClick={reiniciar}
          className="w-full flex items-center justify-center gap-2 py-3 border border-[var(--sepia-border)] text-[var(--sepia-text-secondary)] text-sm rounded-xl hover:bg-[var(--sepia-card)] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Repetir quiz
        </button>
      </div>
    );
  }

  return null;
}
