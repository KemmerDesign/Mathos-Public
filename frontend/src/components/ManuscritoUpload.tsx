import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileImage, FileText, X, Loader2, CheckCircle, AlertCircle, RefreshCw, Wand2, Clock, FileCheck, Save, HelpCircle } from "lucide-react";
import api from "@/services/api";
import { useStore } from "@/services/store";

interface RubricaItem {
  criterio: string;
  peso: number;
  descripcion: string;
}

interface GeneratedWorkshop {
  titulo: string;
  enunciado: string;
  formato_esperado: string;
  tiempo_estimado: string;
  rubrica: RubricaItem[];
}

interface EvaluationResult {
  puntuacion: number;
  correccion: number;
  desarrollo: number;
  claridad: number;
  completitud: number;
  transcripcion: string;
  feedback: string;
  aprobado: boolean;
  saved_path?: string;
}

interface ManuscritoUploadProps {
  temaNombre: string;
  materiaNombre: string;
  dificultad?: string;
  sandboxTipo?: string;
  onEvaluationComplete?: (result: EvaluationResult) => void;
  onAbrirChat?: () => void;
}

export default function ManuscritoUpload({
  temaNombre,
  materiaNombre,
  dificultad = "intermedio",
  sandboxTipo,
  onEvaluationComplete,
  onAbrirChat,
}: ManuscritoUploadProps) {
  const enviarMensajeAlChat = useStore((s) => s.enviarMensajeAlChat);
  const selectedMateriaId = useStore((s) => s.selectedMateriaId);
  const materias = useStore((s) => s.materias);
  const materia = materias.find((m) => m.id === selectedMateriaId);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [workshop, setWorkshop] = useState<GeneratedWorkshop | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGenerateWorkshop = async () => {
    setIsGenerating(true);
    setError("");
    try {
      const res = await api.post("/taller/generar", {
        tema_nombre: temaNombre,
        materia_nombre: materiaNombre,
        dificultad,
        sandbox_tipo: sandboxTipo ?? null,
      });
      setWorkshop(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "Error al generar taller");
    }
    setIsGenerating(false);
  };

  const handleFile = useCallback((f: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (!allowed.includes(f.type)) {
      setError(`Formato no soportado: ${f.type}. Usa JPEG, PNG, WebP, GIF o PDF.`);
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setError("El archivo excede 15 MB.");
      return;
    }
    setError("");
    setFile(f);
    setResult(null);

    // Preview para imágenes
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview("");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (!file) return;
    setIsUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("archivo", file);
    formData.append("tema_nombre", temaNombre);
    formData.append("materia_nombre", materiaNombre);
    formData.append("dificultad", dificultad);

    try {
      const res = await api.post("/taller/manuscrito", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      setResult(res.data);
      onEvaluationComplete?.(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "Error al evaluar");
    }
    setIsUploading(false);
  };

  const reset = () => {
    setFile(null);
    setPreview("");
    setResult(null);
    setError("");
  };

  return (
    <div className="space-y-6">
      {/* Generar Taller */}
      {!workshop && (
        <div className="text-center space-y-4">
          <p className="text-sm text-[var(--sepia-text-secondary)]">
            ¿No sabes qué ejercicio resolver? La IA te genera uno basado en este tema.
          </p>
          <button
            onClick={handleGenerateWorkshop}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-500/10 border border-purple-300 text-purple-600 text-xs font-bold rounded-2xl uppercase tracking-wider hover:bg-purple-500/20 disabled:opacity-50 transition-all"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando taller...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generar Taller con IA
              </>
            )}
          </button>
        </div>
      )}

      {/* Taller Generado */}
      <AnimatePresence>
        {workshop && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-purple-50/50 border-2 border-purple-200 rounded-3xl p-6 space-y-5"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-serif text-purple-900">{workshop.titulo}</h3>
              </div>
              <button
                onClick={() => setWorkshop(null)}
                className="text-purple-400 hover:text-purple-600 transition-colors"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-purple-100 space-y-3">
              <h4 className="text-xs font-bold text-purple-600 uppercase tracking-widest">📝 Enunciado</h4>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{workshop.enunciado}</p>
            </div>

            <div className="flex items-center gap-4 text-xs text-purple-700">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {workshop.tiempo_estimado}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> {workshop.formato_esperado}
              </span>
            </div>

            {workshop.rubrica && workshop.rubrica.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-purple-600 uppercase tracking-widest">📋 Rúbrica de evaluación</h4>
                <div className="grid grid-cols-2 gap-2">
                  {workshop.rubrica.map((r, i) => (
                    <div key={i} className="bg-white rounded-xl p-3 border border-purple-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-700">{r.criterio}</span>
                        <span className="text-[10px] font-bold text-purple-500">{r.peso} pts</span>
                      </div>
                      <p className="text-[11px] text-gray-500">{r.descripcion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-purple-500 text-center pt-2 border-t border-purple-100">
              ✍️ Resuelve este ejercicio a mano en papel o tablet, luego súbelo aquí abajo como foto o PDF.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Zone */}
      {!result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
            ${dragOver
              ? "border-[var(--sepia-accent)] bg-[var(--sepia-accent)]/5"
              : file
                ? "border-[var(--sepia-chart)] bg-[var(--sepia-chart)]/5"
                : "border-[var(--sepia-border)] hover:border-[var(--sepia-accent)]/30 hover:bg-[var(--sepia-bg)]"
            }
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {!file ? (
            <div className="space-y-4">
              <div className="w-14 h-14 mx-auto bg-[var(--sepia-accent)]/10 text-[var(--sepia-accent)] rounded-2xl flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--sepia-text)]">
                  Sube tu trabajo manuscrito
                </p>
                <p className="text-xs text-[var(--sepia-text-secondary)] mt-1">
                  Arrastra una foto o PDF, o haz clic para seleccionar
                </p>
                <p className="text-[10px] text-gray-400 mt-2">
                  JPEG, PNG, WebP, GIF o PDF — máx 15 MB
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {preview ? (
                <img
                  src={preview}
                  alt="Vista previa"
                  className="max-h-48 mx-auto rounded-xl shadow-lg border border-[var(--sepia-border)]"
                />
              ) : (
                <div className="w-14 h-14 mx-auto bg-purple-100 text-purple-500 rounded-2xl flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
              )}
              <div>
                <p className="text-sm font-bold text-[var(--sepia-text)] flex items-center justify-center gap-2">
                  <FileImage className="w-3.5 h-3.5 text-[var(--sepia-chart)]" />
                  {file.name}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {(file.size / 1024).toFixed(1)} KB — Haz clic para cambiar
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); reset(); }}
                className="text-xs text-red-400 hover:text-red-600 underline"
              >
                Quitar archivo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Submit Button */}
      {file && !result && (
        <button
          onClick={handleSubmit}
          disabled={isUploading}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[var(--sepia-accent)] text-white text-xs font-bold rounded-2xl uppercase tracking-widest shadow-xl hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Evaluando con Gemini Vision...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Evaluar trabajo manuscrito
            </>
          )}
        </button>
      )}

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-2xl p-6 space-y-5"
          >
            {/* Score */}
            <div className="text-center">
              <div
                className={`inline-flex items-center justify-center w-24 h-24 rounded-3xl border-4 text-4xl font-serif ${
                  result.aprobado
                    ? "border-[var(--sepia-chart)] text-[var(--sepia-chart)]"
                    : "border-red-400 text-red-400"
                }`}
              >
                {result.puntuacion}
              </div>
              <p className="text-xs font-bold uppercase tracking-widest mt-2 text-[var(--sepia-text)]">
                {result.aprobado ? "✅ Aprobado" : "❌ No aprobado"}
              </p>
            </div>

            {/* Detail bars */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Corrección", value: result.correccion, max: 40, color: "bg-blue-400" },
                { label: "Desarrollo", value: result.desarrollo, max: 30, color: "bg-[var(--sepia-chart)]" },
                { label: "Claridad", value: result.claridad, max: 15, color: "bg-purple-400" },
                { label: "Completitud", value: result.completitud, max: 15, color: "bg-orange-400" },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                    <span className="text-[var(--sepia-text-secondary)]">{item.label}</span>
                    <span className="text-[var(--sepia-text)]">{item.value}/{item.max}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--sepia-bg)] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all duration-700`}
                      style={{ width: `${(item.value / item.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Transcripción */}
            {result.transcripcion && (
              <div className="bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-xl p-4">
                <h4 className="text-[10px] font-bold text-[var(--sepia-accent)] uppercase tracking-widest mb-2">
                  📝 Transcripción
                </h4>
                <p className="text-sm text-[var(--sepia-text-secondary)] leading-relaxed italic">
                  "{result.transcripcion}"
                </p>
              </div>
            )}

            {/* Feedback */}
            <div className="bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-xl p-4">
              <h4 className="text-[10px] font-bold text-[var(--sepia-accent)] uppercase tracking-widest mb-2">
                📋 Feedback
              </h4>
              <div className="text-sm text-[var(--sepia-text)] leading-relaxed whitespace-pre-wrap">
                {result.feedback}
              </div>
            </div>

            {/* Saved indicator */}
            {result.saved_path && (
              <div className="flex items-center justify-center gap-2 text-xs text-[var(--sepia-chart)] bg-[var(--sepia-chart)]/5 rounded-xl py-2 px-4">
                <Save className="w-3.5 h-3.5" />
                Trabajo guardado en el historial
              </div>
            )}

            {/* Botón tutor empático — solo cuando no aprobado */}
            {!result.aprobado && (
              <button
                onClick={() => {
                  const pregunta =
                    `Acabo de entregar un taller de "${temaNombre}" en ${materiaNombre} ` +
                    `y obtuve ${result.puntuacion}/100. No lo aprobé. ` +
                    `El feedback fue: "${result.feedback}". ` +
                    `No entiendo exactamente qué fallé ni cómo debería haberlo resuelto. ¿Puedes explicarme?`;
                  onAbrirChat?.();
                  enviarMensajeAlChat(pregunta, materia?.codigo_uned || materia?.nombre || "");
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-xl uppercase tracking-wider hover:bg-red-100 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" /> ¿Por qué fallé? — Que Ikaro me explique
              </button>
            )}

            <button
              onClick={reset}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--sepia-bg)] border border-[var(--sepia-border)] text-[var(--sepia-text)] text-xs font-bold rounded-xl uppercase tracking-wider hover:bg-[var(--sepia-card)] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Subir otro trabajo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
