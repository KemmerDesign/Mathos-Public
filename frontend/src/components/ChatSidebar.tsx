import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useStore, type Mensaje } from "@/services/store";
import katex from "katex";
import { motion, AnimatePresence } from "framer-motion";
import IkaroAvatar from "./IkaroAvatar";
import GraficaRenderer from "./GraficaRenderer";
import GlosarioPanel from "./GlosarioPanel";
import api from "@/services/api";

function renderContenido(texto: string) {
  const parts = texto.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$]+\$|```[\s\S]*?```|\n#{1,6}\s.*|\*\*[^*]+\*\*)/g);

  return parts.map((part, i) => {
    if (!part) return null;

    if (part.startsWith("$$") && part.endsWith("$$")) {
      try {
        const html = katex.renderToString(part.slice(2, -2), { throwOnError: false, displayMode: true });
        return (
          <div key={i} className="my-3 py-3 flex justify-center bg-[var(--sepia-bg)]/50 border border-[var(--sepia-border)]/50 rounded-lg overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch { return <span key={i} className="text-[var(--sepia-accent)] italic">{part}</span>; }
    }

    if (part.startsWith("$") && part.endsWith("$")) {
      try {
        const html = katex.renderToString(part.slice(1, -1), { throwOnError: false, displayMode: false });
        return <span key={i} className="inline-block py-0.5 px-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
      } catch { return <span key={i} className="text-[var(--sepia-accent)] italic">{part}</span>; }
    }

    if (part.startsWith("```grafica")) {
      const raw = part.slice("```grafica".length, -3).trim();
      return <GraficaRenderer key={i} spec={raw} />;
    }

    if (part.startsWith("```")) {
      const code = part.slice(3, -3);
      return (
        <pre key={i} className="bg-[var(--sepia-code-bg)] border border-white/5 rounded-lg p-3 my-2 overflow-x-auto text-[12px] text-[var(--sepia-code-text)] font-mono shadow-inner leading-relaxed">
          <code>{code}</code>
        </pre>
      );
    }
    if (part.startsWith("\\(") && part.endsWith("\\)")) {
      try {
        const html = katex.renderToString(part.slice(2, -2), { throwOnError: false, displayMode: false });
        return <span key={i} className="inline-block py-0.5 px-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
      } catch { return <span key={i} className="text-[var(--sepia-accent)] italic">{part}</span>; }
    }
    if (part.startsWith("\\[") && part.endsWith("\\]")) {
      try {
        const html = katex.renderToString(part.slice(2, -2), { throwOnError: false, displayMode: true });
        return (
          <div key={i} className="my-3 py-3 flex justify-center bg-[var(--sepia-bg)]/50 border border-[var(--sepia-border)]/50 rounded-lg overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch { return <span key={i} className="text-[var(--sepia-accent)] italic">{part}</span>; }
    }

    if (part.startsWith("#") || part.startsWith("\n#")) {
      const text = part.startsWith("\n") ? part.slice(1) : part;
      const match = text.match(/^(#{1,6})\s(.*)/);
      if (match) {
        const level = match[1].length;
        const content = match[2];
        const sizes = ["text-xl", "text-lg", "text-base", "text-sm", "text-sm", "text-sm"];
        const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
        return (
          <Tag key={i} className={`${sizes[level - 1]} font-sans font-bold text-[var(--sepia-text)] mt-4 mb-2`}>
            {content}
          </Tag>
        );
      }
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold text-[var(--sepia-text)]">{part.slice(2, -2)}</strong>;
    }

    return <span key={i} className="whitespace-pre-wrap leading-relaxed">{part}</span>;
  });
}

// Chips rápidos por materia
function getChips(materiaNombre: string, temaNombre: string): string[] {
  const nombre = (materiaNombre + ' ' + temaNombre).toLowerCase();
  if (nombre.includes('cálculo') || nombre.includes('derivada') || nombre.includes('límite') || nombre.includes('integral')) {
    return ['¿Qué es la tangente?', 'Dame un ejemplo', 'No entendí el límite'];
  }
  if (nombre.includes('programación') || nombre.includes('python') || nombre.includes('lenguaje') || nombre.includes('c++')) {
    return ['¿Qué es un bucle for?', 'Explícame if/else', 'Dame un ejemplo'];
  }
  if (nombre.includes('oracle') || nombre.includes('sql') || nombre.includes('base de datos')) {
    return ['¿Qué es un índice?', 'Explica JOIN vs UNION', 'Dame un ejemplo SELECT'];
  }
  if (nombre.includes('geometría') || nombre.includes('ética') || nombre.includes('filosofía')) {
    return ['¿Cuál es la idea clave?', 'Dame un ejemplo', '¿Cómo lo aplico?'];
  }
  return ['¿Cuál es la idea clave?', 'Dame un ejemplo', 'Explícamelo más simple'];
}

interface ChatSidebarProps {
  floating?: boolean;
  onClose?: () => void;
}

export default function ChatSidebar({ floating = false, onClose }: ChatSidebarProps) {
  const location = useLocation();
  const isStudyRoute = location.pathname.startsWith('/materia/');
  const materias = useStore((s) => s.materias);
  const selectedMateriaId = useStore((s) => s.selectedMateriaId);
  const setSelectedMateria = useStore((s) => s.setSelectedMateria);
  const chatHistory = useStore((s) => s.chatHistory);
  const temaActualId = useStore((s) => s.temaActualId);
  const addMensaje = useStore((s) => s.addMensaje);
  const setChatHistory = useStore((s) => s.setChatHistory);
  const isLoading = useStore((s) => s.isLoading);
  const setLoading = useStore((s) => s.setLoading);
  const pendingChatImage = useStore((s) => s.pendingChatImage);
  const setPendingChatImage = useStore((s) => s.setPendingChatImage);

  const [input, setInput] = useState("");
  const [modo, setModo] = useState<"normal" | "dummy">("normal");
  const [panel, setPanel] = useState<"chat" | "glosario">("chat");
  const [adjunto, setAdjunto] = useState<File | null>(null);
  const [adjuntoPreview, setAdjuntoPreview] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Map msgId → image preview URL for showing thumbnails in chat history
  const imgPreviewMap = useRef<Record<string, string>>({});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Consumir imagen enviada desde otra herramienta (GeoMathos, ProblemaVisual…)
  useEffect(() => {
    if (!pendingChatImage) return;
    const { base64, filename, mime, hint } = pendingChatImage;
    // base64 puede venir con o sin data-URL prefix
    const dataUrl = base64.startsWith("data:") ? base64 : `data:${mime};base64,${base64}`;
    const arr = dataUrl.split(",");
    const bstr = atob(arr[1]);
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    const file = new File([u8], filename, { type: mime });
    setAdjunto(file);
    if (mime.startsWith("image/")) setAdjuntoPreview(dataUrl);
    if (hint) setInput(hint);
    setPendingChatImage(null);
  }, [pendingChatImage]); // eslint-disable-line react-hooks/exhaustive-deps

  const materia = materias.find((m) => m.id === selectedMateriaId);
  const tema = materia?.temas.find((t) => t.id === temaActualId);
  const chatTrackeado = useRef<string | null>(null); // temaId del último chat trackeado
  const chips = getChips(materia?.nombre || '', tema?.nombre || '');

  function handleFileSelect(file: File) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (!allowed.includes(file.type)) return;
    if (file.size > 15 * 1024 * 1024) return;
    setAdjunto(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setAdjuntoPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setAdjuntoPreview("");
    }
  }

  function clearAdjunto() {
    setAdjunto(null);
    setAdjuntoPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if ((!msg && !adjunto) || !selectedMateriaId) return;

    const msgId = `msg-${Date.now()}`;
    // If there's an image preview, store it for rendering in the bubble
    if (adjuntoPreview) imgPreviewMap.current[msgId] = adjuntoPreview;

    const labelAdjunto = adjunto ? ` [📎 ${adjunto.name}]` : "";
    const userMsg: Mensaje = {
      id: msgId,
      rol: "user",
      contenido: msg + labelAdjunto,
      timestamp: new Date().toISOString(),
    };
    addMensaje(userMsg);
    setInput("");
    const archivoParaEnviar = adjunto;
    clearAdjunto();
    setLoading(true);

    try {
      const materiaActual = materias.find(m => m.id === selectedMateriaId);
      let respuesta: string;

      if (archivoParaEnviar) {
        const formData = new FormData();
        formData.append("pregunta", msg);
        formData.append("archivo", archivoParaEnviar);
        formData.append("nivel", modo);
        if (materiaActual) formData.append("codigo_materia", materiaActual.codigo_uned || materiaActual.nombre || materiaActual.id);
        const res = await api.post("/asistente/preguntar-con-imagen", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 90000,
        });
        respuesta = res.data.respuesta;
      } else {
        respuesta = await useStore.getState().sendPregunta(msg, materiaActual?.codigo_uned || materiaActual?.nombre || materiaActual?.id, modo);
      }

      addMensaje({
        id: `msg-${Date.now()}-resp`,
        rol: "assistant",
        contenido: respuesta,
        timestamp: new Date().toISOString(),
      });

      // Registrar primer chat del tema para la ruta adaptativa
      if (temaActualId && chatTrackeado.current !== temaActualId) {
        chatTrackeado.current = temaActualId;
        api.post(`/temas/${temaActualId}/estudiar`, {
          tipo: "chat",
          puntuacion: 0,
          materia_id: selectedMateriaId,
        }).catch(() => {});
      }
    } catch (err: any) {
      addMensaje({
        id: `msg-${Date.now()}-error`,
        rol: "assistant",
        contenido: `Lo siento, ha ocurrido un error: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }

  const containerClass = floating
    ? "flex flex-col overflow-hidden bg-white border border-[var(--sepia-border)] rounded-[22px] shadow-[0_28px_60px_-24px_rgba(40,20,80,.6)]"
    : "w-[340px] shrink-0 border-l border-[var(--sepia-border)] bg-white flex flex-col h-full overflow-hidden shadow-2xl relative z-20";

  return (
    <aside className={containerClass}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(120deg,#F3EFFE,#FCEFF5)' }}
        className="px-4 py-3 border-b border-[var(--sepia-border)] flex items-center gap-3">
        <IkaroAvatar size={44} />
        <div className="flex-1">
          <div className="text-[15px] font-bold text-[var(--sepia-text)] leading-none">Ikaro</div>
          <div className="text-[11.5px] font-semibold mt-0.5 flex items-center gap-1.5" style={{ color: '#2E9E63' }}>
            <span className="w-[7px] h-[7px] rounded-full bg-[#2E9E63] inline-block" />
            Tu tutor · siempre listo
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector de materia — solo fuera de páginas de materia (en estudio el Dashboard sincroniza el contexto) */}
          {materias.length > 0 && !isStudyRoute && (
            <select
              value={selectedMateriaId || ""}
              onChange={(e) => setSelectedMateria(e.target.value || null)}
              className="bg-white border border-[var(--sepia-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--sepia-text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--sepia-accent)]/20 appearance-none cursor-pointer"
              style={{ maxWidth: 100 }}
            >
              <option value="" disabled>Materia</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setChatHistory([])}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sepia-text-secondary)] hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer"
            title="Limpiar chat"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
            </svg>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sepia-text-secondary)] hover:bg-white hover:text-[var(--sepia-accent)] transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs: Chat / Glosario */}
      <div className="px-3 pt-2 border-b border-[var(--sepia-border)]">
        <div className="flex gap-0">
          {(["chat", "glosario"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPanel(p)}
              className={`flex-1 py-2 text-[12px] font-bold border-b-2 transition-all cursor-pointer ${
                panel === p
                  ? "border-[var(--sepia-accent)] text-[var(--sepia-accent)]"
                  : "border-transparent text-[var(--sepia-text-secondary)]"
              }`}
            >
              {p === "chat" ? "💬 Chat" : "📖 Glosario"}
            </button>
          ))}
        </div>
      </div>

      {/* Normal / Dummy toggle — solo en panel chat */}
      {panel === "chat" && (
      <div className="px-3 py-2 border-b border-[var(--sepia-border)]">
        <div className="flex bg-[#F0EAE0] rounded-[10px] p-[3px] gap-0">
          <button
            onClick={() => setModo("normal")}
            className={`flex-1 py-[7px] rounded-[8px] text-[12px] font-bold text-center transition-all cursor-pointer ${
              modo === "normal"
                ? "bg-white text-[var(--sepia-accent)] shadow-[0_2px_6px_-2px_rgba(60,45,30,.25)]"
                : "text-[var(--sepia-text-secondary)]"
            }`}
          >
            <span className="block">Profundo</span>
            <span className="text-[10px] font-medium opacity-70 block">intuición + rigor</span>
          </button>
          <button
            onClick={() => setModo("dummy")}
            className={`flex-1 py-[7px] rounded-[8px] text-[12px] font-bold text-center transition-all cursor-pointer ${
              modo === "dummy"
                ? "bg-white text-[var(--sepia-accent)] shadow-[0_2px_6px_-2px_rgba(60,45,30,.25)]"
                : "text-[var(--sepia-text-secondary)]"
            }`}
          >
            <span className="block">Desde cero</span>
            <span className="text-[10px] font-medium opacity-70 block">analogías paso a paso</span>
          </button>
        </div>
      </div>
      )}

      {/* Panel Glosario */}
      {panel === "glosario" && (
        <div className="flex-1 overflow-hidden px-3 py-3" style={{ minHeight: 0 }}>
          <GlosarioPanel materiaId={selectedMateriaId || undefined} />
        </div>
      )}

      {/* Historial — solo visible en panel chat */}
      {panel === "chat" && (
      <>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar" style={{ minHeight: 0 }}>
        <AnimatePresence initial={false}>
          {chatHistory.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center px-4 py-8"
            >
              <IkaroAvatar size={64} />
              <p className="mt-4 text-[13px] font-semibold text-[var(--sepia-text)]">
                {materia ? `Hola, soy Ikaro. Estoy aquí para ayudarte con ${materia.nombre}.` : '¿En qué puedo ayudarte hoy?'}
              </p>
              <p className="text-[12px] text-[var(--sepia-text-secondary)] mt-1 leading-relaxed max-w-[190px]">
                Pregúntame sobre cualquier concepto del temario.
              </p>
            </motion.div>
          )}

          {chatHistory.map((msg) => {
            const preview = imgPreviewMap.current[msg.id];
            // Strip the [📎 filename] marker from display text for clean rendering
            const textoLimpio = msg.contenido.replace(/ \[📎 [^\]]+\]$/, "");
            const nombreArchivo = msg.contenido.match(/\[📎 ([^\]]+)\]$/)?.[1];
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.rol === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[84%] rounded-[16px] px-[14px] py-[11px] text-[13.5px] leading-[1.5]"
                  style={{
                    ...(msg.rol === "user"
                      ? { background: '#6A45DE', color: '#fff', borderBottomRightRadius: 5 }
                      : { background: '#F4EEE5', color: '#322B23', borderBottomLeftRadius: 5 }),
                  }}
                >
                  {/* Image thumbnail */}
                  {preview && (
                    <img src={preview} alt="adjunto"
                      className="max-w-full max-h-40 rounded-[10px] mb-2 object-contain"
                    />
                  )}
                  {/* PDF badge (no preview) */}
                  {!preview && nombreArchivo && (
                    <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg bg-white/20">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="text-[11px] font-medium truncate max-w-[160px]">{nombreArchivo}</span>
                    </div>
                  )}
                  {textoLimpio && renderContenido(textoLimpio)}
                </div>
              </motion.div>
            );
          })}

          {isLoading && (
            <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex justify-start">
              <div className="bg-[#F4EEE5] rounded-[16px] px-4 py-3" style={{ borderBottomLeftRadius: 5 }}>
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--sepia-accent)]/40 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-[var(--sepia-accent)]/40 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-[var(--sepia-accent)]/40 animate-bounce" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Chips */}
      {selectedMateriaId && (
        <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => handleSend(chip)}
              disabled={isLoading}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-full border-none cursor-pointer transition-colors disabled:opacity-40"
              style={{ background: '#EFEAFD', color: '#6A45DE' }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-4 pt-2 border-t border-[var(--sepia-border)]">
        {/* Attachment preview chip */}
        {adjunto && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-[10px] bg-[var(--sepia-bg)] border border-[var(--sepia-border)]">
            {adjuntoPreview ? (
              <img src={adjuntoPreview} alt="preview" className="w-9 h-9 rounded-[7px] object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-[7px] bg-[#6A45DE]/10 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6A45DE" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
            )}
            <span className="flex-1 text-[12px] font-medium text-[var(--sepia-text)] truncate">{adjunto.name}</span>
            <span className="text-[10px] text-[var(--sepia-text-secondary)]">
              {(adjunto.size / 1024).toFixed(0)} KB
            </span>
            <button onClick={clearAdjunto}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--sepia-text-secondary)] hover:bg-red-50 hover:text-red-400 transition-colors cursor-pointer">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2 rounded-[14px] border border-[var(--sepia-border)] bg-[var(--sepia-card-alt)] px-3 py-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
          />
          {/* Clip button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedMateriaId || isLoading}
            title="Adjuntar imagen o PDF"
            className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer disabled:opacity-30"
            style={{ color: adjunto ? '#6A45DE' : 'var(--sepia-text-secondary)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder={
              adjunto
                ? "Añade una pregunta (opcional)…"
                : selectedMateriaId
                  ? "Pregúntale a Ikaro…"
                  : "Selecciona una materia primero"
            }
            disabled={!selectedMateriaId || isLoading}
            className="flex-1 border-none bg-transparent text-[14px] text-[var(--sepia-text)] placeholder:text-[var(--sepia-text-secondary)]/50 focus:outline-none disabled:opacity-50 py-1"
          />
          <button
            onClick={() => handleSend()}
            disabled={(!input.trim() && !adjunto) || !selectedMateriaId || isLoading}
            className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center border-none cursor-pointer transition-all disabled:opacity-20 disabled:grayscale flex-shrink-0"
            style={{ background: '#6A45DE' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
            </svg>
          </button>
        </div>
      </div>
      </>
      )}
    </aside>
  );
}
