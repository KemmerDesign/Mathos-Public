import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/services/store";
import { motion, AnimatePresence } from "framer-motion";
import katex from "katex";
import Editor from "@monaco-editor/react";
import { Link } from "react-router-dom";
import { BarChart3, Brain, Volume2, PenTool, Upload, Sparkles, BookMarked, FlaskConical } from "lucide-react";
import InfografiaPopup from "./InfografiaPopup";
import ManuscritoUpload from "./ManuscritoUpload";
import SandboxSQL from "./SandboxSQL";
import GraficaRenderer from "./GraficaRenderer";
import TopicQuiz from "./TopicQuiz";
import RutaAdaptativa from "./RutaAdaptativa";
import DemostracionChain from "./DemostracionChain";
import AndamioConceptual from "./AndamioConceptual";
import ProblemaVisual from "./ProblemaVisual";
import Cerebro from "@/pages/Cerebro";
import FeynmanTrainer from "@/pages/FeynmanTrainer";
import api from "@/services/api";

// Función auxiliar para renderizar contenido con LaTeX y Markdown simple
// Soporta: $$...$$, $...$, \[...\], \(...\), # headings, **negritas**, bloques ```
function RenderMarkdown(texto: string) {
  const parts = texto.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$]+\$|```[\s\S]*?```|\n#{1,6}\s.*|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (!part) return null;

    // LaTeX Display: $$ ... $$
    if (part.startsWith("$$") && part.endsWith("$$")) {
      try {
        const html = katex.renderToString(part.slice(2, -2), { throwOnError: false, displayMode: true });
        return <div key={i} className="my-4 py-4 flex justify-center bg-[var(--sepia-bg)]/30 rounded-lg overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
      } catch { return <span key={i} className="italic text-[var(--sepia-accent)]">{part}</span>; }
    }

    // LaTeX Inline: $ ... $
    if (part.startsWith("$") && part.endsWith("$")) {
      try {
        const html = katex.renderToString(part.slice(1, -1), { throwOnError: false, displayMode: false });
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch { return <span key={i} className="italic text-[var(--sepia-accent)]">{part}</span>; }
    }

    // Gráficas interactivas
    if (part.startsWith("```grafica")) {
      const raw = part.slice("```grafica".length, -3).trim();
      return <GraficaRenderer key={i} spec={raw} />;
    }

    // Bloques de código
    if (part.startsWith("```")) {
      const code = part.slice(3, -3);
      return (
        <pre key={i} className="bg-[#1e1e1e] border border-white/5 rounded-lg p-4 my-4 overflow-x-auto text-[13px] text-gray-300 font-mono">
          <code>{code}</code>
        </pre>
      );
    }

    // LaTeX Inline \( ... \)
    if (part.startsWith("\\(") && part.endsWith("\\)")) {
      try {
        const html = katex.renderToString(part.slice(2, -2), { throwOnError: false, displayMode: false });
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch { return <span key={i} className="italic text-[var(--sepia-accent)]">{part}</span>; }
    }

    // LaTeX Block \[ ... \]
    if (part.startsWith("\\[") && part.endsWith("\\]")) {
      try {
        const html = katex.renderToString(part.slice(2, -2), { throwOnError: false, displayMode: true });
        return <div key={i} className="my-4 py-4 flex justify-center bg-[var(--sepia-bg)]/30 rounded-lg overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
      } catch { return <span key={i} className="italic text-[var(--sepia-accent)]">{part}</span>; }
    }

    // Títulos Markdown (# ## ### ...) — pueden empezar con \n o estar al inicio
    if (part.startsWith("#") || part.startsWith("\n#")) {
      const text = part.startsWith("\n") ? part.slice(1) : part;
      const match = text.match(/^(#{1,6})\s(.*)/);
      if (match) {
        const level = match[1].length;
        const content = match[2];
        const sizes = ["text-3xl", "text-2xl", "text-xl", "text-lg", "text-base", "text-sm"];
        const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
        return (
          <Tag key={i} className={`${sizes[level - 1] || "text-base"} font-serif text-[var(--sepia-text)] mt-8 mb-4 border-b border-[var(--sepia-border)]/50 pb-2`}>
            {content}
          </Tag>
        );
      }
    }

    // Negritas (**texto**)
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold text-[var(--sepia-text)]">{part.slice(2, -2)}</strong>;
    }

    // Texto normal
    return <span key={i} className="whitespace-pre-wrap leading-relaxed">{part}</span>;
  });
}

interface FileTab {
  name: string;
  language: string;
  code: string;
}

function SandboxCpp({ code, output, isCompiling, onCodeChange, onRun, onReview }: {
  code: string;
  output: string;
  isCompiling: boolean;
  onCodeChange: (newCode: string) => void;
  onRun: () => void;
  onReview?: () => void;
}) {
  const [files, setFiles] = useState<FileTab[]>([
    { name: "main.cpp", language: "cpp", code: code || `#include <iostream>\n\nint main() {\n    \n}` },
  ]);
  const [activeFile, setActiveFile] = useState(0);
  const [showTerminal, setShowTerminal] = useState(true);
  const editorRef = useRef<any>(null);
  const promptSymbol = ">";

  // Sync external code changes (from clear/reset) into active file
  useEffect(() => {
    setFiles(prev => {
      const updated = [...prev];
      updated[activeFile] = { ...updated[activeFile], code };
      return updated;
    });
  }, [code]); // only when external code changes

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value === undefined) return;
    setFiles(prev => {
      const updated = [...prev];
      updated[activeFile] = { ...updated[activeFile], code: value };
      return updated;
    });
    onCodeChange(value);
  }, [activeFile, onCodeChange]);

  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor;
    // Enable Tab for indentation (Monaco does this by default)
  }, []);

  function addFile() {
    const name = `nuevo_${files.length}.cpp`;
    setFiles(prev => [...prev, { name, language: "cpp", code: "// " + name + "\n" }]);
    setActiveFile(files.length);
  }

  function switchFile(index: number) {
    // Save current code before switching
    const currentCode = files[activeFile].code;
    onCodeChange(currentCode);
    setActiveFile(index);
    // Load the new file's code
    onCodeChange(files[index].code);
  }

  function handleCreateHeader() {
    const headerName = "funciones.h";
    if (files.some(f => f.name === headerName)) {
      setActiveFile(files.findIndex(f => f.name === headerName));
      return;
    }
    const headerCode = `// funciones.h\n#ifndef FUNCIONES_H\n#define FUNCIONES_H\n\nvoid ejemplo();\n\n#endif\n`;
    setFiles(prev => [...prev, { name: headerName, language: "cpp", code: headerCode }]);
    setActiveFile(files.length);
    onCodeChange(headerCode);
  }

  function handleCreateCpp() {
    const implName = "funciones.cpp";
    if (files.some(f => f.name === implName)) {
      setActiveFile(files.findIndex(f => f.name === implName));
      return;
    }
    const implCode = `// funciones.cpp\n#include "funciones.h"\n#include <iostream>\n\nvoid ejemplo() {\n    std::cout << "Hola desde funciones.cpp" << std::endl;\n}\n`;
    setFiles(prev => [...prev, { name: implName, language: "cpp", code: implCode }]);
    setActiveFile(files.length);
    onCodeChange(implCode);
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] shadow-2xl relative z-10">
      {/* Barra de herramientas superior */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Sandbox C++</span>
          <span className="text-[9px] text-gray-600">|</span>
          <span className="text-[9px] text-gray-500 font-mono">{files[activeFile]?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={isCompiling}
            className="px-4 py-1 bg-[#0e639c] hover:bg-[#1177bb] text-white text-[9px] font-bold rounded uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
          >
            {isCompiling ? "Compilando..." : "▶ Ejecutar"}
          </button>
          {onReview && (
            <button
              onClick={onReview}
              disabled={isCompiling}
              className="px-4 py-1 bg-[#6c5ce7] hover:bg-[#7c6cf0] text-white text-[9px] font-bold rounded uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
            >
              🤖 Revisar con IA
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* File Explorer */}
        <div className="w-48 bg-[#252526] border-r border-[#3c3c3c] flex flex-col shrink-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#3c3c3c] shrink-0">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Explorador</span>
            <button
              onClick={addFile}
              className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-white hover:bg-[#3c3c3c] rounded text-xs transition-colors"
              title="Nuevo archivo"
            >
              +
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
            {/* Archivos existentes */}
            {files.map((file, i) => (
              <button
                key={file.name}
                onClick={() => switchFile(i)}
                className={`w-full text-left px-3 py-1 text-[11px] font-mono flex items-center gap-2 transition-colors ${
                  i === activeFile
                    ? "bg-[#37373d] text-white"
                    : "text-gray-400 hover:bg-[#2a2a2e] hover:text-gray-200"
                }`}
              >
                <span className="text-[10px]">{file.name.endsWith(".h") ? "📄" : "📄"}</span>
                <span className="truncate">{file.name}</span>
              </button>
            ))}
            {/* Divisor */}
            <div className="mx-3 my-1 border-t border-[#3c3c3c]" />
            {/* Archivos sugeridos (atajos) */}
            <div className="px-3 py-1 text-[9px] text-gray-500 uppercase tracking-wider">Sugeridos</div>
            <button
              onClick={handleCreateHeader}
              className="w-full text-left px-3 py-1 text-[11px] font-mono text-gray-500 hover:text-gray-300 hover:bg-[#2a2a2e] transition-colors flex items-center gap-2"
            >
              <span className="text-[10px]">📄</span>
              <span>funciones.h</span>
            </button>
            <button
              onClick={handleCreateCpp}
              className="w-full text-left px-3 py-1 text-[11px] font-mono text-gray-500 hover:text-gray-300 hover:bg-[#2a2a2e] transition-colors flex items-center gap-2"
            >
              <span className="text-[10px]">📄</span>
              <span>funciones.cpp</span>
            </button>
          </div>
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1">
            <Editor
              key={files[activeFile]?.name || "editor"}
              height="100%"
              defaultLanguage={files[activeFile]?.language || "cpp"}
              language={files[activeFile]?.language || "cpp"}
              value={files[activeFile]?.code || ""}
              theme="vs-dark"
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                wordWrap: "on",
                lineNumbers: "on",
                renderWhitespace: "selection",
                bracketPairColorization: { enabled: true },
                padding: { top: 12 },
                suggestOnTriggerCharacters: true,
                quickSuggestions: true,
                autoClosingBrackets: "always",
                autoClosingQuotes: "always",
                formatOnPaste: true,
              }}
            />
          </div>

          {/* Terminal / Output Panel */}
          <div className="shrink-0 border-t border-[#3c3c3c]">
            <button
              onClick={() => setShowTerminal(!showTerminal)}
              className="w-full flex items-center justify-between px-4 py-1 bg-[#252526] text-[9px] text-gray-400 uppercase tracking-widest hover:text-gray-300 transition-colors"
            >
              <span>Terminal</span>
              <span className="text-[10px]">{showTerminal ? "▼" : "▲"}</span>
            </button>
            {showTerminal && (
              <div className="h-28 bg-black/40 overflow-y-auto custom-scrollbar">
                <pre className="text-[11px] font-mono text-green-400/90 whitespace-pre-wrap p-3 leading-relaxed">
                  {output || <span className="text-gray-500 italic">{promptSymbol} Consola inactiva — presiona "Ejecutar" para compilar</span>}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MateriaContent() {
  const materias = useStore((s) => s.materias);
  const selectedMateriaId = useStore((s) => s.selectedMateriaId);
  const temaActualId = useStore((s) => s.temaActualId);
  const compileCode = useStore((s) => s.compileCode);
  const evaluarTaller = useStore((s) => s.evaluarTaller);
  const fetchTeoriaTema = useStore((s) => s.fetchTeoriaTema);
  const marcarTemaCompletado = useStore((s) => s.marcarTemaCompletado);
  const isLoading = useStore((s) => s.isLoading);

  const materia = materias.find((m) => m.id === selectedMateriaId);
  const temaActual = materia?.temas.find((t) => t.id === temaActualId);

  const esLenguajes = materia?.sandbox_tipo === "cpp" || materia?.codigo_uned === "6102210-" || materia?.nombre.toLowerCase().includes("lenguajes");
  const esSQL = materia?.sandbox_tipo === "sql";
  const esMatematica = !esLenguajes && !esSQL && Boolean(
    materia?.nombre?.match(/geometr|matemát|álgebra|cálculo|trigonometr|estadíst|probabilid|aritmét|análisis/i)
  );

  // Estados de Contenido e IA
  const [teoriaIA, setTeoriaIA] = useState<string>("");
  const [teoriaCache, setTeoriaCache] = useState<string>("MISS");
  const [isCargandoTeoria, setIsCargandoTeoria] = useState(false);
  const [errorTeoria, setErrorTeoria] = useState<string | null>(null);
  const [workshopStep, setWorkshopStep] = useState(0);
  const [modoEvaluacion, setModoEvaluacion] = useState<"tecnico" | "feynman">("tecnico");
  const [dificultad, setDificultad] = useState<"basico" | "intermedio" | "avanzado">("basico");
  const [evaluacion, setEvaluacion] = useState<{ puntuacion: number; feedback: string } | null>(null);
  const [feynmanExplicacion, setFeynmanExplicacion] = useState("");
  const [respuesta, setRespuesta] = useState("");  // respuesta modo técnico
  const [evalFile, setEvalFile] = useState<File | null>(null);
  const [evalFilePreview, setEvalFilePreview] = useState("");

  // Fase 2: Taller práctico
  const [tallerEnunciado, setTallerEnunciado] = useState("");
  const [respuestaTaller, setRespuestaTaller] = useState("");
  const [puntuacionTest, setPuntuacionTest] = useState(0);
  const [feedbackTest, setFeedbackTest] = useState("");
  const [puntuacionTaller, setPuntuacionTaller] = useState(0);
  const [feedbackTaller, setFeedbackTaller] = useState("");

  // Estados de infografía y audio
  const [showInfografia, setShowInfografia] = useState(false);
  const [diagramCode, setDiagramCode] = useState<string | null>(null);
  const [diagramCached, setDiagramCached] = useState(false);
  const [isLoadingInfografia, setIsLoadingInfografia] = useState(false);
  const [showManuscrito, setShowManuscrito] = useState(false);

  // SRS flashcard generation
  const [srsGenerando, setSrsGenerando] = useState(false);
  const [srsMsg, setSrsMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  async function generarFlashcards() {
    if (!temaActualId || !selectedMateriaId || !teoriaIA || teoriaIA.length < 50) return;
    setSrsGenerando(true);
    setSrsMsg(null);
    try {
      const res = await api.post("/srs/generar", {
        materia_id: selectedMateriaId,
        tema_id: temaActualId,
        tema_nombre: temaActual?.nombre || "",
        materia_nombre: materia?.nombre || "",
        contenido: teoriaIA,
        num: 5,
      });
      setSrsMsg({ tipo: 'ok', texto: `${res.data.generadas} flashcards generadas. ¡Repásalas en SRS!` });
      // Registrar en ruta adaptativa que se fijaron los términos
      api.post(`/temas/${temaActualId}/estudiar`, {
        tipo: "ejercicio",
        puntuacion: 0,
        materia_id: selectedMateriaId,
      }).then(() => setRutaRefetchKey(k => k + 1)).catch(() => {});
    } catch {
      setSrsMsg({ tipo: 'error', texto: "Error al generar flashcards. Intenta de nuevo." });
    }
    setSrsGenerando(false);
    setTimeout(() => setSrsMsg(null), 5000);
  }

  // Estados para la terminal
  const [tabActivo, setTabActivo] = useState<'teoria' | 'taller' | 'examen' | 'cerebro'>('teoria');
  const [showFeynman, setShowFeynman] = useState(false);
  const [rutaRefetchKey, setRutaRefetchKey] = useState(0);
  const [teoriaLeida, setTeoriaLeida] = useState(false);

  const [code, setCode] = useState(`#include <iostream>\n\nint main() {\n    return 0;\n}`);
  const [output, setOutput] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);

  // Cargar teoría vía RAG al cambiar de tema
  useEffect(() => {
    if (temaActualId && selectedMateriaId) {
      setTeoriaIA("");
      setTeoriaCache("MISS");
      setIsCargandoTeoria(true);
      setErrorTeoria(null);
      fetchTeoriaTema(temaActualId, selectedMateriaId)
        .then(res => {
          setTeoriaIA(res.respuesta);
          setTeoriaCache(res.cache || "MISS");
          setIsCargandoTeoria(false);
        })
        .catch(() => {
          setErrorTeoria("No se pudo cargar la teoría. Verifica tu conexión o intenta de nuevo.");
          setIsCargandoTeoria(false);
        });
    }
    setWorkshopStep(0);
    setEvaluacion(null);
    setFeynmanExplicacion("");
    setRespuesta("");
    setRespuestaTaller("");
    setTallerEnunciado("");
    setPuntuacionTest(0);
    setPuntuacionTaller(0);
    setEvalFile(null);
    setEvalFilePreview("");
    setOutput("");
    setTabActivo('teoria');
    setTeoriaLeida(false);
  }, [temaActualId, selectedMateriaId, fetchTeoriaTema]);

  // Auto-generar infografía cuando la teoría carga (materias sin terminal como Geometría)
  useEffect(() => {
    if (!esLenguajes && !isCargandoTeoria && teoriaIA && teoriaIA.length > 100 && temaActualId) {
      const tid = temaActualId;
      const contenido = teoriaIA;
      const timer = setTimeout(async () => {
        setIsLoadingInfografia(true);
        setShowInfografia(true);
        try {
          const res = await api.post(`/infografias/${tid}`, {
            contenido_teoria: contenido,
            regenerar: false,
          });
          setDiagramCode(res.data.diagram);
          setDiagramCached(res.data.cached);
        } catch {
          setDiagramCode(null);
        }
        setIsLoadingInfografia(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isCargandoTeoria, teoriaIA, temaActualId]);

  async function handleRun() {
    setIsCompiling(true);
    const res = await compileCode(code);
    setOutput(res.success ? res.output : (res.error || "Error de compilación"));
    setIsCompiling(false);
  }

  async function procesarTest() {
    setWorkshopStep(2);
    // Construir la respuesta según el modo
    let respuestaEnvio = modoEvaluacion === "feynman"
      ? feynmanExplicacion
      : esLenguajes
        ? `[CÓDIGO C++] El estudiante escribió el siguiente código para el tema "${temaActual?.nombre}":\n\n${code}`
        : respuesta;

    // Si hay archivo adjunto, procesarlo
    if (evalFile) {
      const formData = new FormData();
      formData.append("archivo", evalFile);
      formData.append("tema_nombre", temaActual?.nombre || "");
      formData.append("materia_nombre", materia?.nombre || "");
      formData.append("dificultad", dificultad);
      try {
        const visionRes = await api.post("/taller/manuscrito", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        });
        const t = visionRes.data?.transcripcion || "";
        if (t) respuestaEnvio = `[MANUSCRITO TRANSCRITO]: ${t}\n\n[RESPUESTA]: ${respuestaEnvio}`;
      } catch { /* continuar sin manuscrito */ }
    }

    const codigoAEnviar = modoEvaluacion === "tecnico" && esLenguajes ? code : "";
    const res = await evaluarTaller(
      temaActualId!,
      respuestaEnvio,
      codigoAEnviar,
      modoEvaluacion,
      dificultad
    );
    setPuntuacionTest(res.puntuacion);
    setFeedbackTest(res.feedback);
    setWorkshopStep(3);

    // Generar taller práctico automáticamente
    if (esLenguajes) {
      setTallerEnunciado(`💻 **Desafío de Programación**\n\nEscribe un programa en C++ que demuestre tu comprensión de "${temaActual?.nombre}".\n\nRequisitos:\n- Usa los conceptos del tema\n- Incluye comentarios explicando tu razonamiento\n- El código debe compilar y ejecutarse`);
    } else {
      setTallerEnunciado(`📐 **Ejercicio Práctico**\n\nResuelve el siguiente problema aplicando los conceptos de "${temaActual?.nombre}":\n\nElige UNO de los ejercicios resueltos que aparecen en los fundamentos teóricos de arriba (sección "Ejercicios resueltos") y:\n1. Explica el problema con tus propias palabras\n2. Desarrolla la solución paso a paso\n3. Verifica tu resultado`);
    }
  }

  async function procesarTaller() {
    setWorkshopStep(4);
    let envio = esLenguajes
      ? `[CÓDIGO C++] ${respuestaTaller || code}`
      : respuestaTaller;

    const res = await evaluarTaller(
      temaActualId!,
      `[TALLER PRÁCTICO] ${tallerEnunciado}\n\n[RESPUESTA DEL ESTUDIANTE]:\n${envio}`,
      esLenguajes ? (respuestaTaller || code) : "",
      "tecnico",
      dificultad
    );
    setPuntuacionTaller(res.puntuacion);
    setFeedbackTaller(res.feedback);
    setWorkshopStep(5);

    // Promedio final — si no se hizo el test, la nota del taller vale por sí sola
    const puntuacionFinal = puntuacionTest > 0
      ? Math.round((puntuacionTest + res.puntuacion) / 2)
      : res.puntuacion;
    const feedbackCompleto = puntuacionTest > 0
      ? `**Test:** ${puntuacionTest}/100 — ${feedbackTest}\n\n**Taller:** ${res.puntuacion}/100 — ${res.feedback}\n\n**Nota final:** ${puntuacionFinal}/100`
      : `**Taller:** ${res.puntuacion}/100 — ${res.feedback}`;
    setEvaluacion({ puntuacion: puntuacionFinal, feedback: feedbackCompleto });
    setRutaRefetchKey(k => k + 1);

    if (puntuacionFinal >= 70) {
      marcarTemaCompletado(selectedMateriaId!, temaActualId!, puntuacionFinal);
    }
  }

  async function marcarTeoriaLeida() {
    if (!temaActualId) return;
    setTeoriaLeida(true);
    try {
      await api.post(`/temas/${temaActualId}/estudiar`, {
        tipo: "lectura",
        puntuacion: 0,
        materia_id: selectedMateriaId,
      });
      setRutaRefetchKey(k => k + 1);
    } catch {
      // silent — la intención queda registrada en estado local
    }
  }

  async function cargarInfografia() {
    if (!temaActualId || !teoriaIA || teoriaIA.length < 50) return;
    setIsLoadingInfografia(true);
    setShowInfografia(true);
    try {
      const res = await api.post(`/infografias/${temaActualId}`, {
        contenido_teoria: teoriaIA,
        regenerar: false,
      });
      setDiagramCode(res.data.diagram);
      setDiagramCached(res.data.cached);
    } catch {
      setDiagramCode(null);
      setDiagramCached(false);
    }
    setIsLoadingInfografia(false);
  }

  async function regenerarInfografia() {
    if (!temaActualId || !teoriaIA) return;
    setIsLoadingInfografia(true);
    try {
      const res = await api.post(`/infografias/${temaActualId}`, {
        contenido_teoria: teoriaIA,
        regenerar: true,
      });
      setDiagramCode(res.data.diagram);
      setDiagramCached(false);
    } catch {
      setDiagramCode(null);
    }
    setIsLoadingInfografia(false);
  }

  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  async function handleAudioClick() {
    if (!temaActualId || !teoriaIA || teoriaIA.length < 50) {
      setOutput("🎙️ Selecciona un tema con teoría cargada para generar audio.");
      return;
    }
    setAudioLoading(true);
    setAudioUrl(null);
    setOutput("🎙️ Generando audio con NotebookLM... esto puede tardar 2-5 minutos.");
    try {
      const res = await api.post(`/audio/${temaActualId}`, {
        tema_nombre: temaActual?.nombre || "Tema",
        contenido_teoria: teoriaIA,
        regenerar: false,
      });
      const url = res.data.url;
      setAudioUrl(url);
      setOutput(`✅ Audio generado. ${res.data.cached ? "(desde caché)" : "(recién creado)"}`);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || "Error";
      setOutput(`❌ Error al generar audio: ${msg}`);
    }
    setAudioLoading(false);
  }

  if (isLoading && !materia) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[var(--sepia-border)]" />
          <p className="text-sm text-[var(--sepia-text-secondary)] font-medium">Sincronizando RAG...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--sepia-bg)] relative overflow-hidden">
      <AnimatePresence mode="wait">
        {!selectedMateriaId || !materia ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center text-center px-12">
            <div className="w-32 h-32 bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-[40px] flex items-center justify-center text-6xl shadow-xl mb-8 transform rotate-3">🏛️</div>
            <h2 className="text-3xl font-serif text-[var(--sepia-text)] mb-4">Portal Académico Mathós</h2>
            <p className="text-[var(--sepia-text-secondary)] max-w-lg font-light">Selecciona una materia para acceder a los recursos RAG.</p>
          </motion.div>
        ) : (
          <motion.div key={selectedMateriaId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col overflow-hidden">

            {/* Mini Audio Player — persiste sobre los tabs */}
            {audioUrl && (
              <div className="shrink-0 bg-[#1a1a2e] border-b border-purple-500/20 px-4 py-2 flex items-center gap-3">
                <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[10px] text-purple-300 uppercase tracking-wider font-bold">Podcast del tema</span>
                <audio controls className="flex-1 h-7" style={{ filter: "invert(0.85) hue-rotate(180deg)" }}>
                  <source src={audioUrl} type="audio/mp4" />
                </audio>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--sepia-bg)] relative">
              <div className="w-[92%] mx-auto px-4 pb-28">
                {temaActual ? (
                  <motion.div key={temaActual.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

                    {/* Encabezado del tema */}
                    <div className="pt-7 pb-0">
                      <div className="text-[12.5px] font-semibold text-[var(--sepia-text-secondary)] tracking-[.01em]">
                        Módulo {temaActual.orden} · {materia?.nombre}
                      </div>
                      <h1 className="mt-1 text-[31px] font-bold tracking-[-0.025em] text-[var(--sepia-text)]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        {temaActual.nombre}
                      </h1>

                      {/* Ruta Adaptativa */}
                      <div className="mt-5">
                        <RutaAdaptativa
                          temaId={temaActualId!}
                          temaNombre={temaActual.nombre}
                          refetchKey={rutaRefetchKey}
                          onNavegar={(accion) => {
                            if (accion.startsWith("tab:")) {
                              setTabActivo(accion.replace("tab:", "") as any);
                            } else if (accion === "chat" || accion === "chat:remediar") {
                              // El chat está siempre visible — el user solo necesita hacer scroll
                            }
                          }}
                        />
                      </div>

                      {/* Tab bar */}
                      <div className="flex gap-1.5 border-b border-[var(--sepia-border)]" style={{ marginBottom: -1 }}>
                        {([
                          { key: 'teoria', label: esLenguajes || esSQL ? 'Teoría' : 'Teoría' },
                          { key: 'taller', label: esLenguajes || esSQL ? 'Sandbox' : 'Taller' },
                          { key: 'examen', label: 'Examen' },
                          { key: 'cerebro', label: '🧠 Cerebro' },
                        ] as const).map((tab) => (
                          <button
                            key={tab.key}
                            onClick={() => setTabActivo(tab.key)}
                            className="px-[18px] py-[11px] border-none bg-transparent font-bold text-[14.5px] cursor-pointer transition-colors"
                            style={{
                              color: tabActivo === tab.key ? 'var(--sepia-accent)' : '#9A8F80',
                              borderBottom: tabActivo === tab.key ? '2.5px solid var(--sepia-accent)' : '2.5px solid transparent',
                              marginBottom: tabActivo === tab.key ? -1 : 0,
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            {tab.label}
                          </button>
                        ))}

                        {/* Botones de herramientas — siempre accesibles */}
                        <div className="flex-1" />
                        <div className="flex items-center gap-1.5 pb-1.5">
                          <button
                            onClick={cargarInfografia}
                            disabled={isLoadingInfografia || !teoriaIA}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--sepia-card)] border border-[var(--sepia-border)] text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-accent)] hover:border-[var(--sepia-accent)]/30 text-[11px] font-bold rounded-[10px] uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer"
                            title="Ver infografía"
                          >
                            <BarChart3 className="w-3.5 h-3.5" /> Infografía
                          </button>
                          <button
                            onClick={handleAudioClick}
                            disabled={audioLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--sepia-card)] border border-[var(--sepia-border)] text-[var(--sepia-text-secondary)] hover:text-purple-500 hover:border-purple-300 text-[11px] font-bold rounded-[10px] uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <Volume2 className={`w-3.5 h-3.5 ${audioLoading ? "animate-pulse text-purple-500" : ""}`} />
                            {audioLoading ? "Generando..." : audioUrl ? "Audio ✓" : "Audio"}
                          </button>
                          <button
                            onClick={() => setShowFeynman(!showFeynman)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--sepia-card)] border border-[var(--sepia-border)] text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-accent)] hover:border-[var(--sepia-accent)]/30 text-[11px] font-bold rounded-[10px] uppercase tracking-wider transition-all cursor-pointer"
                            style={{
                              color: showFeynman ? 'var(--sepia-accent)' : undefined,
                              borderColor: showFeynman ? 'var(--sepia-accent)' : undefined,
                            }}
                          >
                            <Brain className="w-3.5 h-3.5" /> {showFeynman ? 'Feynman ✓' : 'Feynman'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ─── TAB: TEORÍA ──────────────────────────────────────────── */}
                    {tabActivo === 'teoria' && (
                    <section className="space-y-8 pt-6 animate-pop">

                      {/* Sandbox arriba cuando es lenguajes/SQL */}
                      {esLenguajes && (
                        <div className="rounded-[18px] overflow-hidden border border-[var(--sepia-border)]" style={{ height: 380 }}>
                          <SandboxCpp
                            code={code}
                            output={output}
                            isCompiling={isCompiling}
                            onCodeChange={setCode}
                            onRun={handleRun}
                          />
                        </div>
                      )}
                      {esSQL && (
                        <div className="rounded-[18px] overflow-hidden border border-[var(--sepia-border)]">
                          <SandboxSQL temaNombre={temaActual?.nombre || ""} />
                        </div>
                      )}

                      {/* Andamio conceptual — solo materias teóricas */}
                      {!esLenguajes && !esSQL && temaActualId && (
                        <AndamioConceptual
                          temaId={temaActualId}
                          temaNombre={temaActual.nombre}
                        />
                      )}

                      {/* Teoría */}
                      <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-[24px] p-10 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--sepia-accent)] flex items-center gap-2">
                            <span className="w-6 h-px bg-[var(--sepia-accent)]/30" /> Fundamentos Teóricos
                          </div>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-normal normal-case ${
                            isCargandoTeoria ? "bg-yellow-100 text-yellow-700" :
                            teoriaCache === "HIT" ? "bg-green-100 text-green-700" :
                            teoriaIA ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                          }`}>
                            {isCargandoTeoria ? "⏳ Generando..." :
                             teoriaCache === "HIT" ? "⚡ Cache" :
                             teoriaIA ? "🧠 IA" : "Esperando"}
                          </span>
                        </div>
                        <div className="text-[17px] leading-[1.72] text-[#322B23]" style={{ fontFamily: "'Newsreader', serif" }}>
                          {isCargandoTeoria ? (
                            <div className="space-y-4 animate-pulse">
                              <div className="h-4 bg-[var(--sepia-border)]/30 rounded w-3/4" />
                              <div className="h-4 bg-[var(--sepia-border)]/20 rounded w-full" />
                              <div className="h-4 bg-[var(--sepia-border)]/20 rounded w-5/6" />
                              <div className="h-10" />
                              <div className="h-4 bg-[var(--sepia-border)]/30 rounded w-1/2" />
                              <div className="h-4 bg-[var(--sepia-border)]/20 rounded w-full" />
                              <div className="flex items-center justify-center py-6">
                                <span className="text-sm text-[var(--sepia-text-secondary)] animate-pulse">🧠 Generando teoría con IA académica...</span>
                              </div>
                            </div>
                          ) : errorTeoria ? (
                            <div className="text-center py-12 space-y-4">
                              <div className="text-4xl">📡</div>
                              <p className="text-[var(--sepia-text-secondary)]">{errorTeoria}</p>
                              <button onClick={() => { setErrorTeoria(null); setIsCargandoTeoria(true); fetchTeoriaTema(temaActualId!, selectedMateriaId!).then(res => { setTeoriaIA(res.respuesta); setTeoriaCache(res.cache); setIsCargandoTeoria(false); }).catch(() => { setErrorTeoria("Error al reintentar."); setIsCargandoTeoria(false); }); }} className="px-6 py-2 bg-[var(--sepia-accent)] text-white text-sm font-bold rounded-xl hover:opacity-90 transition-colors cursor-pointer">
                                Reintentar
                              </button>
                            </div>
                          ) : teoriaIA ? (
                            RenderMarkdown(teoriaIA)
                          ) : (
                            <div className="text-center py-12">
                              <div className="animate-spin w-8 h-8 border-2 border-[var(--sepia-accent)]/30 border-t-[var(--sepia-accent)] rounded-full mx-auto mb-4" />
                              <p className="text-sm text-[var(--sepia-text-secondary)]">Conectando con el repositorio académico...</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Puntos de enfoque + nivel */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-[18px] p-6 shadow-sm">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--sepia-accent)] mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[var(--sepia-accent)]" /> Puntos de Enfoque
                          </h4>
                          <div className="text-sm text-[var(--sepia-text-secondary)] leading-relaxed">
                            {(() => {
                              if (!teoriaIA) return <span className="opacity-40">Cargando puntos clave...</span>;
                              const match = teoriaIA.match(/### Objetivos de aprendizaje\n([\s\S]*?)(?=###|$)/);
                              if (match) {
                                const bullets = match[1].trim().split('\n').filter(l => l.trim().startsWith('-'));
                                if (bullets.length > 0) return <ul className="list-disc list-inside space-y-1.5">{bullets.slice(0, 6).map((b, i) => <li key={i}>{b.replace(/^-\s*/, '')}</li>)}</ul>;
                              }
                              return 'Estudia los fundamentos teóricos de este tema.';
                            })()}
                          </div>
                        </div>
                        <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-[18px] p-6 shadow-sm">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--sepia-text-secondary)] mb-3">Nivel de Dominio</h4>
                          {(() => {
                            const nivel = temaActual.nivel || "no_iniciado";
                            const puntuacion = temaActual.puntuacion || 0;
                            const config: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
                              no_iniciado:  { label: "No iniciado",  color: "#9A8F80", bg: "#F5F0EB", emoji: "○" },
                              en_curso:     { label: "En curso",     color: "#D97706", bg: "#FFFBEB", emoji: "◑" },
                              practicando:  { label: "Practicando",  color: "#2563EB", bg: "#EFF6FF", emoji: "◕" },
                              dominado:     { label: "Dominado",     color: "#059669", bg: "#ECFDF5", emoji: "●" },
                            };
                            const c = config[nivel] || config.no_iniciado;
                            return (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg" style={{ color: c.color }}>{c.emoji}</span>
                                  <span className="text-sm font-bold" style={{ color: c.color }}>{c.label}</span>
                                </div>
                                {puntuacion > 0 && (
                                  <div className="flex items-end gap-1.5">
                                    <span className="text-4xl font-bold text-[var(--sepia-text)]" style={{ fontFamily: "'Newsreader', serif" }}>{puntuacion}</span>
                                    <span className="text-[10px] font-bold text-[var(--sepia-text-secondary)] uppercase mb-1.5">/ 100</span>
                                  </div>
                                )}
                                {puntuacion === 0 && nivel === "no_iniciado" && (
                                  <p className="text-xs text-[var(--sepia-text-secondary)]">Haz el taller para registrar tu nota.</p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Atomización de demostraciones — solo para materias teóricas */}
                      {!esLenguajes && !esSQL && temaActualId && selectedMateriaId && (
                        <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-[24px] p-8 shadow-sm">
                          <DemostracionChain
                            temaId={temaActualId}
                            materiaId={selectedMateriaId}
                            temaNombre={temaActual.nombre}
                          />
                        </div>
                      )}

                      {/* Feynman Trainer — toggle inline */}
                      {showFeynman && temaActualId && selectedMateriaId && (
                        <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-[24px] p-6 shadow-sm">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-[var(--sepia-text)] flex items-center gap-2">
                              <Brain className="w-4 h-4 text-[var(--sepia-accent)]" />
                              Técnica Feynman — Explica "{temaActual.nombre}" con tus palabras
                            </h3>
                            <button
                              onClick={() => setShowFeynman(false)}
                              className="text-xs text-[var(--sepia-text-secondary)] hover:text-red-500 transition-colors cursor-pointer"
                            >
                              ✕ Cerrar
                            </button>
                          </div>
                          <FeynmanTrainer
                            compact
                            materiaId={selectedMateriaId}
                            temaId={temaActualId}
                          />
                        </div>
                      )}

                      {/* Checkpoint: teoría leída */}
                      {teoriaIA && !isCargandoTeoria && (
                        <div className="max-w-2xl mx-auto w-full">
                          {(teoriaLeida || (temaActual?.nivel && temaActual.nivel !== "no_iniciado")) ? (
                            <div className="flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-[14px] bg-green-50 border border-green-200">
                              <span className="text-green-600 font-bold text-sm">✓</span>
                              <span className="text-[13px] font-bold text-green-700">Teoría completada — listo para practicar</span>
                            </div>
                          ) : (
                            <button
                              onClick={marcarTeoriaLeida}
                              className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-[14px] border-2 border-[var(--sepia-accent)]/30 bg-[var(--sepia-accent-tint)] hover:bg-[var(--sepia-accent)]/10 transition-all cursor-pointer group"
                            >
                              <span className="text-base">📖</span>
                              <span className="text-[13.5px] font-bold text-[var(--sepia-accent)]">
                                He leído la teoría — pasar a práctica
                              </span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* CTAs centrados — taller / SRS / errores */}
                      <div className="max-w-2xl mx-auto w-full space-y-3">

                      {/* CTA hacia taller */}
                      {teoriaIA && (
                        <div
                          className="flex items-center justify-between px-5 py-4 rounded-[16px]"
                          style={{ background: 'var(--sepia-accent-tint)' }}
                        >
                          <div className="text-[13.5px] text-[#4A4035] font-medium">
                            Para aprobar este tema necesitas el <strong>taller</strong> y el <strong>examen</strong> (≥ 70).
                          </div>
                          <button
                            onClick={() => setTabActivo('taller')}
                            className="ml-4 flex-shrink-0 border-none text-white font-bold text-[13.5px] px-5 py-2.5 rounded-[11px] cursor-pointer transition-opacity hover:opacity-90"
                            style={{ background: 'var(--sepia-accent)' }}
                          >
                            Ir al taller →
                          </button>
                        </div>
                      )}

                      {/* SRS — generar flashcards */}
                      {teoriaIA && (
                        <div className="flex items-center justify-between px-5 py-4 rounded-[16px] bg-purple-50 border border-purple-100">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
                              <BookMarked className="w-4 h-4 text-purple-600" />
                            </div>
                            <div>
                              <p className="text-[13px] font-bold text-purple-900">Flashcards de repaso espaciado</p>
                              <p className="text-[11px] text-purple-500">
                                {srsMsg
                                  ? <span className={srsMsg.tipo === 'ok' ? 'text-green-600' : 'text-red-500'}>{srsMsg.texto}</span>
                                  : "Genera 5 tarjetas de este tema para repasar mañana y pasado."}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <button
                              onClick={generarFlashcards}
                              disabled={srsGenerando}
                              className="flex items-center gap-1.5 border-none text-white font-bold text-[12px] px-4 py-2 rounded-[10px] cursor-pointer transition-all hover:brightness-110 disabled:opacity-50"
                              style={{ background: '#7C3AED' }}
                            >
                              {srsGenerando
                                ? <><span className="animate-spin text-xs">⟳</span> Generando...</>
                                : <><Sparkles className="w-3.5 h-3.5" /> Generar</>}
                            </button>
                            {selectedMateriaId && (
                              <Link
                                to={`/srs/${selectedMateriaId}`}
                                className="flex items-center gap-1.5 text-purple-600 text-[12px] font-bold px-3 py-2 rounded-[10px] bg-purple-100 hover:bg-purple-200 transition-colors"
                              >
                                Repasar →
                              </Link>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Libro de errores */}
                      {selectedMateriaId && (
                        <div className="flex items-center justify-between px-5 py-4 rounded-[16px] bg-red-50 border border-red-100">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center">
                              <span className="text-[16px]">📖</span>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold text-red-900">Libro de errores</p>
                              <p className="text-[11px] text-red-400">Conceptos fallados en simulacros, talleres y repaso</p>
                            </div>
                          </div>
                          <Link
                            to={`/errores/${selectedMateriaId}`}
                            className="flex-shrink-0 ml-4 flex items-center gap-1.5 text-red-600 text-[12px] font-bold px-3 py-2 rounded-[10px] bg-red-100 hover:bg-red-200 transition-colors"
                          >
                            Ver errores →
                          </Link>
                        </div>
                      )}

                      </div>{/* /CTAs centrados */}
                    </section>
                    )}

                    {/* ─── TAB: TALLER / SANDBOX ────────────────────────────────── */}
                    {tabActivo === 'taller' && (
                    <section className="pt-6 animate-pop">

                      {/* Manuscrito upload siempre disponible */}
                      {showManuscrito && (
                        <div className="mb-8 space-y-4">
                          <h3 className="text-xl font-bold text-[var(--sepia-text)] flex items-center gap-2">
                            <PenTool className="w-5 h-5 text-purple-500" /> Taller Manuscrito
                          </h3>
                          <ManuscritoUpload
                            temaNombre={temaActual.nombre}
                            materiaNombre={materia?.nombre || ""}
                            dificultad={dificultad}
                            sandboxTipo={esSQL ? "sql" : undefined}
                            onEvaluationComplete={(result) => {
                              if (result.aprobado && result.puntuacion >= 70) {
                                marcarTemaCompletado(selectedMateriaId!, temaActualId!, result.puntuacion);
                              }
                            }}
                          />
                        </div>
                      )}

                      {/* Botón toggle manuscrito */}
                      <div className="flex justify-end mb-4">
                        <button
                          onClick={() => setShowManuscrito(!showManuscrito)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                            showManuscrito
                              ? "bg-purple-500/10 border border-purple-500/30 text-purple-600"
                              : "bg-[var(--sepia-card)] border border-[var(--sepia-border)] text-[var(--sepia-text-secondary)] hover:text-purple-500 hover:border-purple-300"
                          }`}
                        >
                          <PenTool className="w-3.5 h-3.5" /> {showManuscrito ? 'Ocultar manuscrito' : 'Subir manuscrito'}
                        </button>
                      </div>

                      {/* Evaluación IA */}
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-[22px] font-bold text-[var(--sepia-text)]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                              Evaluación Final del Tema
                            </h3>
                            <p className="text-[14px] text-[var(--sepia-text-secondary)] mt-1">Demuestra tu maestría para desbloquear la siguiente lección.</p>
                          </div>
                          {workshopStep === 0 && (
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              <button onClick={() => setModoEvaluacion("tecnico")} className={`px-3 py-1.5 rounded-[10px] text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer ${modoEvaluacion === "tecnico" ? "bg-[var(--sepia-accent)] text-white shadow-lg" : "bg-[var(--sepia-card)] text-[var(--sepia-text-secondary)] border border-[var(--sepia-border)]"}`}>
                                💻 Técnico
                              </button>
                              <button onClick={() => setModoEvaluacion("feynman")} className={`px-3 py-1.5 rounded-[10px] text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer ${modoEvaluacion === "feynman" ? "bg-[var(--sepia-chart)] text-white shadow-lg" : "bg-[var(--sepia-card)] text-[var(--sepia-text-secondary)] border border-[var(--sepia-border)]"}`}>
                                🧠 Feynman
                              </button>
                              <span className="text-[9px] text-gray-400">|</span>
                              {(["basico", "intermedio", "avanzado"] as const).map((niv) => (
                                <button key={niv} onClick={() => setDificultad(niv)} className={`px-3 py-1.5 rounded-[10px] text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer ${dificultad === niv ? "bg-black text-white" : "bg-[var(--sepia-card)] text-[var(--sepia-text-secondary)] border border-[var(--sepia-border)]"}`}>
                                  {niv}
                                </button>
                              ))}
                              <button onClick={() => setWorkshopStep(1)} className="ml-2 px-6 py-2 bg-black text-white text-[11px] font-bold rounded-[11px] uppercase tracking-widest shadow-xl cursor-pointer">
                                {modoEvaluacion === "feynman" ? "Iniciar Feynman" : "Iniciar Desafío"}
                              </button>
                            </div>
                          )}
                        </div>

                        <AnimatePresence>
                          {workshopStep > 0 && (
                            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-[var(--sepia-card)] border-2 border-[var(--sepia-accent)]/20 rounded-[28px] p-10 space-y-8 shadow-xl">
                              {/* Indicador de fase */}
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full transition-colors ${workshopStep <= 2 ? 'bg-[var(--sepia-accent)]' : 'bg-[var(--sepia-border)]'}`} />
                                <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${workshopStep <= 2 ? 'text-[var(--sepia-accent)]' : 'text-[var(--sepia-text-secondary)]'}`}>Fase 1</span>
                                <div className="h-px w-8 bg-[var(--sepia-border)]" />
                                <div className={`w-2 h-2 rounded-full transition-colors ${workshopStep >= 3 ? 'bg-[var(--sepia-chart)]' : 'bg-[var(--sepia-border)]'}`} />
                                <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${workshopStep >= 3 ? 'text-[var(--sepia-chart)]' : 'text-[var(--sepia-text-secondary)]'}`}>Fase 2</span>
                                {workshopStep >= 5 && (
                                  <>
                                    <div className="h-px w-8 bg-[var(--sepia-border)]" />
                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-green-600">Resultado</span>
                                  </>
                                )}
                              </div>
                              {workshopStep === 1 && (
                                <div className="space-y-6">
                                  <button
                                    onClick={() => setWorkshopStep(0)}
                                    className="flex items-center gap-1 text-[11px] font-medium text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-accent)] transition-colors cursor-pointer border-none bg-transparent p-0"
                                  >
                                    ← Cambiar modo
                                  </button>
                                  <div className="flex items-center gap-3">
                                    <span className={`px-3 py-1 text-white text-[11px] font-bold rounded-full ${modoEvaluacion === "feynman" ? "bg-[var(--sepia-chart)]" : "bg-black"}`}>
                                      {modoEvaluacion === "feynman" ? "Modo FEYNMAN" : `Nivel ${dificultad.toUpperCase()}`}
                                    </span>
                                    <h4 className="text-lg font-bold text-[var(--sepia-text)]">
                                      {modoEvaluacion === "feynman" ? "Explícale a la IA" : "Reto: " + temaActual.nombre}
                                    </h4>
                                  </div>

                                  {modoEvaluacion === "feynman" ? (
                                    <>
                                      <p className="text-base text-[var(--sepia-text-secondary)] leading-relaxed pl-5 border-l-4 border-[var(--sepia-chart)]/20">
                                        Explícale <strong>"{temaActual.nombre}"</strong> a un estudiante novato usando analogías claras.
                                      </p>
                                      <textarea value={feynmanExplicacion} onChange={(e) => setFeynmanExplicacion(e.target.value)} placeholder="Escribe tu explicación como si enseñaras a un niño de 10 años..." rows={6} className="w-full bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-[18px] p-5 text-sm text-[var(--sepia-text)] placeholder:text-gray-400 resize-y focus:outline-none focus:border-[var(--sepia-chart)]/50 transition-colors" />
                                    </>
                                  ) : (
                                    <div className="space-y-4">
                                      <div className="bg-[var(--sepia-bg)]/50 border border-[var(--sepia-border)] rounded-[18px] p-5 text-sm text-[var(--sepia-text-secondary)] leading-relaxed space-y-2">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--sepia-accent)] mb-3">📝 Responde sobre "{temaActual.nombre}":</p>
                                        <ul className="list-decimal list-inside space-y-2">
                                          <li><strong>Define</strong> el concepto principal con tus propias palabras.</li>
                                          <li><strong>Explica</strong> la idea más importante como a un compañero.</li>
                                          {dificultad !== "basico" && <li><strong>Da un ejemplo</strong> concreto de aplicación.</li>}
                                          {dificultad === "avanzado" && <li><strong>Relaciona</strong> con otros conceptos de la materia.</li>}
                                        </ul>
                                      </div>
                                      <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="1. Define el concepto principal...&#10;2. Explica la idea clave...&#10;3. Da un ejemplo concreto..." rows={8} className="w-full bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-[18px] p-5 text-sm text-[var(--sepia-text)] placeholder:text-gray-400 resize-y focus:outline-none focus:border-[var(--sepia-accent)]/50 transition-colors" />
                                    </div>
                                  )}

                                  {/* Upload opcional */}
                                  <div className="border border-dashed border-[var(--sepia-border)] rounded-[18px] p-4 bg-[var(--sepia-bg)]/50">
                                    <p className="text-xs font-bold text-[var(--sepia-text-secondary)] uppercase tracking-wider flex items-center gap-2 mb-2">
                                      <Upload className="w-3.5 h-3.5" /> Adjuntar manuscrito (opcional)
                                    </p>
                                    {!evalFile ? (
                                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--sepia-accent)] hover:underline font-bold">
                                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setEvalFile(f); if (f.type.startsWith("image/")) { const reader = new FileReader(); reader.onload = (ev) => setEvalFilePreview(ev.target?.result as string); reader.readAsDataURL(f); } } }} />
                                        📎 Seleccionar imagen o PDF
                                      </label>
                                    ) : (
                                      <div className="flex items-center gap-3">
                                        {evalFilePreview && <img src={evalFilePreview} alt="Preview" className="h-10 rounded-lg border border-[var(--sepia-border)]" />}
                                        <div className="flex-1 min-w-0"><p className="text-xs font-bold text-[var(--sepia-text)] truncate">{evalFile.name}</p><p className="text-[10px] text-gray-400">{(evalFile.size / 1024).toFixed(1)} KB</p></div>
                                        <button onClick={() => { setEvalFile(null); setEvalFilePreview(""); }} className="text-xs text-red-400 hover:text-red-600 cursor-pointer">Quitar</button>
                                      </div>
                                    )}
                                  </div>

                                  <button
                                    onClick={procesarTest}
                                    disabled={(modoEvaluacion === "feynman" && feynmanExplicacion.length < 20 && !evalFile) || (modoEvaluacion === "tecnico" && !esLenguajes && respuesta.length < 20 && !evalFile) || (modoEvaluacion === "tecnico" && esLenguajes && code.length < 20)}
                                    className={`px-8 py-3 text-white text-xs font-bold rounded-[18px] uppercase tracking-widest shadow-xl cursor-pointer hover:opacity-90 disabled:opacity-50 ${modoEvaluacion === "feynman" ? "bg-[var(--sepia-chart)]" : "bg-[var(--sepia-accent)]"}`}
                                  >
                                    Enviar Test (Fase 1/2)
                                  </button>
                                </div>
                              )}

                              {workshopStep === 2 && (
                                <div className="flex flex-col items-center justify-center py-16 gap-4">
                                  <div className="w-10 h-10 border-4 rounded-full animate-spin border-[var(--sepia-accent)]/20 border-t-[var(--sepia-accent)]" />
                                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--sepia-accent)]">Evaluando Test (Fase 1/2)...</p>
                                </div>
                              )}

                              {workshopStep === 3 && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                                  <div className="text-center space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--sepia-text-secondary)]">Resultado del Test</p>
                                    <div className={`inline-flex items-center justify-center w-24 h-20 rounded-[24px] ${puntuacionTest >= 70 ? "border-[var(--sepia-chart)] text-[var(--sepia-chart)]" : "border-amber-400 text-amber-600"} text-3xl font-serif bg-[var(--sepia-bg)] shadow-inner`} style={{ border: '3px solid' }}>
                                      {puntuacionTest}/100
                                    </div>
                                  </div>
                                  <div className="max-w-xl mx-auto bg-[var(--sepia-bg)] p-5 rounded-[18px] border border-[var(--sepia-border)]">
                                    <div className="text-xs text-[var(--sepia-text-secondary)] leading-relaxed">{RenderMarkdown(feedbackTest)}</div>
                                  </div>
                                  <div className="flex items-center gap-4"><div className="flex-1 h-px bg-[var(--sepia-border)]" /><span className="text-[10px] font-bold uppercase tracking-widest text-[var(--sepia-text-secondary)]">Fase 2 de 2</span><div className="flex-1 h-px bg-[var(--sepia-border)]" /></div>
                                  <div className="bg-[var(--sepia-bg)]/50 border-2 border-[var(--sepia-chart)]/20 rounded-[18px] p-5 space-y-4">
                                    <span className="px-3 py-1 bg-[var(--sepia-chart)]/10 text-[var(--sepia-chart)] text-[10px] font-bold rounded-full uppercase tracking-wider">Taller Práctico</span>
                                    <div className="text-sm text-[var(--sepia-text-secondary)] leading-relaxed whitespace-pre-line">{RenderMarkdown(tallerEnunciado)}</div>
                                    <textarea value={respuestaTaller} onChange={(e) => setRespuestaTaller(e.target.value)} placeholder={esLenguajes ? "Escribe tu código para el desafío..." : "1. Explica el problema...\n2. Desarrolla la solución...\n3. Verifica tu resultado..."} rows={esLenguajes ? 10 : 6} className="w-full bg-[var(--sepia-bg)] border border-[var(--sepia-border)] rounded-[14px] p-4 text-sm text-[var(--sepia-text)] placeholder:text-gray-400 resize-y focus:outline-none focus:border-[var(--sepia-chart)]/50 font-mono" />
                                    <button onClick={procesarTaller} disabled={respuestaTaller.length < 10} className="w-full px-8 py-3 bg-[var(--sepia-chart)] text-white text-xs font-bold rounded-[14px] uppercase tracking-widest shadow-lg hover:opacity-90 disabled:opacity-40 cursor-pointer">
                                      Enviar Taller (Fase 2/2)
                                    </button>
                                  </div>
                                </motion.div>
                              )}

                              {workshopStep === 4 && (
                                <div className="flex flex-col items-center justify-center py-16 gap-4">
                                  <div className="w-10 h-10 border-4 rounded-full animate-spin border-[var(--sepia-chart)]/20 border-t-[var(--sepia-chart)]" />
                                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--sepia-chart)]">Evaluando Taller (Fase 2/2)...</p>
                                </div>
                              )}

                              {workshopStep === 5 && evaluacion && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 text-center">
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--sepia-text-secondary)]">Nota Final (promedio)</p>
                                    <div className={`inline-flex items-center justify-center w-28 h-24 rounded-[28px] ${evaluacion.puntuacion >= 70 ? "border-[var(--sepia-chart)] text-[var(--sepia-chart)]" : "border-red-400 text-red-400"} text-5xl bg-[var(--sepia-bg)] shadow-inner`} style={{ border: '4px solid', fontFamily: "'Newsreader', serif" }}>
                                      {evaluacion.puntuacion}
                                    </div>
                                    <div className="flex items-center justify-center gap-2 text-[10px] text-[var(--sepia-text-secondary)]">
                                      <span>Test: {puntuacionTest}/100</span><span>+</span><span>Taller: {puntuacionTaller}/100</span>
                                    </div>
                                  </div>
                                  <div className="max-w-xl mx-auto space-y-4 text-left bg-[var(--sepia-bg)] p-7 rounded-[24px] border border-[var(--sepia-border)]">
                                    <h5 className="font-bold text-sm uppercase tracking-widest text-[var(--sepia-text)] flex items-center gap-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--sepia-chart)]" /> Veredicto Final
                                    </h5>
                                    <div className="text-sm text-[var(--sepia-text-secondary)] leading-relaxed">{RenderMarkdown(evaluacion.feedback)}</div>
                                  </div>
                                  <button onClick={() => { setWorkshopStep(0); setTallerEnunciado(""); setRespuestaTaller(""); setRespuesta(""); }} className="px-8 py-3 bg-black text-white text-[10px] font-bold rounded-[14px] uppercase tracking-widest cursor-pointer shadow-xl">
                                    {evaluacion.puntuacion >= 70 ? "✅ Tema Completado" : "🔄 Reintentar Todo"}
                                  </button>
                                  {evaluacion.puntuacion >= 70 && (
                                    <button onClick={() => setTabActivo('examen')} className="ml-3 px-8 py-3 bg-[var(--sepia-accent)] text-white text-[10px] font-bold rounded-[14px] uppercase tracking-widest cursor-pointer shadow-xl">
                                      Continuar al examen →
                                    </button>
                                  )}
                                </motion.div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Resolución visual — solo materias matemáticas */}
                      {esMatematica && temaActualId && selectedMateriaId && (
                        <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-[24px] p-8 shadow-sm mt-6">
                          <ProblemaVisual
                            temaId={temaActualId}
                            temaNombre={temaActual.nombre}
                            materiaNombre={materia?.nombre || ""}
                          />
                        </div>
                      )}
                    </section>
                    )}

                    {/* ─── TAB: EXAMEN ──────────────────────────────────────────── */}
                    {tabActivo === 'examen' && (
                    <section className="pt-6 animate-pop space-y-6">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-[22px] font-bold text-[var(--sepia-text)] flex items-center gap-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                            <FlaskConical className="w-5 h-5 text-[var(--sepia-accent)]" />
                            Quiz del tema
                          </h3>
                          <p className="text-[13px] text-[var(--sepia-text-secondary)] mt-1">
                            Preguntas solo sobre <strong>{temaActual.nombre}</strong> · aprueba con ≥ 70 para avanzar nivel
                          </p>
                        </div>
                        <Link
                          to={`/simulacro/${selectedMateriaId}`}
                          className="flex-shrink-0 text-[12px] text-[var(--sepia-text-secondary)] border border-[var(--sepia-border)] px-3 py-1.5 rounded-xl hover:border-[var(--sepia-accent)]/40 hover:text-[var(--sepia-accent)] transition-colors"
                        >
                          Examen completo →
                        </Link>
                      </div>

                      {/* Quiz inline */}
                      <div className="bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-[20px] p-6">
                        <TopicQuiz
                          materiaId={selectedMateriaId!}
                          materiaNombre={materia?.nombre || ""}
                          temaId={temaActualId!}
                          temaNombre={temaActual.nombre}
                          esMCQ={esSQL}
                          onAprobado={(puntuacion) => {
                            marcarTemaCompletado(selectedMateriaId!, temaActualId!, puntuacion);
                          }}
                        />
                      </div>
                    </section>
                    )}

                    {/* ─── TAB: CEREBRO ──────────────────────────────────────────── */}
                    {tabActivo === 'cerebro' && (
                    <section className="animate-pop" style={{ height: 'calc(100vh - 120px)', minHeight: 600, display: 'flex', flexDirection: 'column' }}>
                      <Cerebro materiaId={selectedMateriaId || null} temaId={temaActualId || null} />
                    </section>
                    )}

                  </motion.div>
                ) : (
                  <div className="text-center py-32 space-y-6">
                    <div className="w-20 h-20 bg-[var(--sepia-card)] border border-[var(--sepia-border)] rounded-3xl flex items-center justify-center text-4xl mx-auto shadow-sm">🏛️</div>
                    <h2 className="text-2xl font-bold text-[var(--sepia-text)]" style={{ fontFamily: "'Newsreader', serif" }}>Selecciona una lección para iniciar</h2>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Infografía Popup */}
      <InfografiaPopup
        isOpen={showInfografia}
        onClose={() => setShowInfografia(false)}
        temaId={temaActualId || ""}
        temaNombre={temaActual?.nombre || "Tema"}
        teoriaContent={teoriaIA}
        diagramCode={diagramCode}
        isCached={diagramCached}
        onRegenerate={regenerarInfografia}
        isLoading={isLoadingInfografia}
      />
    </div>
  );
}
