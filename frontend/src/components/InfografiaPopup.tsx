import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCw, Maximize2, Download, Loader2 } from "lucide-react";
import mermaid from "mermaid";

// Inicializar Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  themeVariables: {
    primaryColor: "#e1f5fe",
    primaryTextColor: "#1a1a2e",
    primaryBorderColor: "#0288d1",
    lineColor: "#5c6bc0",
    secondaryColor: "#fff3e0",
    tertiaryColor: "#e8f5e9",
  },
});

interface InfografiaPopupProps {
  isOpen: boolean;
  onClose: () => void;
  temaId: string;
  temaNombre: string;
  teoriaContent: string;
  diagramCode: string | null;
  isCached: boolean;
  onRegenerate: () => void;
  isLoading: boolean;
}

export default function InfografiaPopup({
  isOpen,
  onClose,
  temaNombre,
  diagramCode,
  isCached,
  onRegenerate,
  isLoading,
}: InfografiaPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!diagramCode || !isOpen) return;
    renderDiagram(diagramCode);
  }, [diagramCode, isOpen]);

  async function renderDiagram(code: string) {
    try {
      setError("");
      const id = `mermaid-${Date.now()}`;
      const { svg: rendered } = await mermaid.render(id, code);
      setSvg(rendered);
    } catch (e: any) {
      setError(`Error al renderizar diagrama: ${e.message || "Error desconocido"}`);
      setSvg("");
    }
  }

  function handleDownload() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `infografia-${temaNombre.replace(/\s+/g, "-").toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className={`bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col ${
              isFullscreen ? "w-[95vw] h-[90vh]" : "w-[700px] max-h-[80vh]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[var(--sepia-accent)]/10 text-[var(--sepia-accent)] rounded-xl flex items-center justify-center text-sm">
                  📊
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Infografía – {temaNombre}</h3>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    Diagrama Mermaid.js {isCached ? "(cacheado)" : "(generado ahora)"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onRegenerate}
                  disabled={isLoading}
                  className="p-2 text-gray-400 hover:text-[var(--sepia-accent)] hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  title="Regenerar"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!svg}
                  className="p-2 text-gray-400 hover:text-[var(--sepia-accent)] hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
                  title="Descargar SVG"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 text-gray-400 hover:text-[var(--sepia-accent)] hover:bg-gray-100 rounded-lg transition-colors"
                  title="Pantalla completa"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 bg-gray-50" ref={containerRef}>
              {isLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-8 h-8 text-[var(--sepia-accent)] animate-spin" />
                  <p className="text-sm text-gray-400 font-medium uppercase tracking-wider">
                    Generando infografía con IA...
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                  <p className="text-sm text-red-600">{error}</p>
                  <button
                    onClick={onRegenerate}
                    className="mt-4 px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl uppercase tracking-widest"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {!isLoading && !error && svg && (
                <div
                  className="flex items-center justify-center min-h-[300px]"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              )}

              {!isLoading && !error && !svg && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
                  <span className="text-4xl">📊</span>
                  <p className="text-sm">No hay diagrama disponible</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 bg-white shrink-0 flex items-center justify-between">
              <span className="text-[10px] text-gray-400">
                Powered by Mermaid.js + DeepSeek
              </span>
              <span className="text-[10px] text-[var(--sepia-chart)] font-bold">
                {isCached ? "⚡ Servido desde caché" : "🆕 Generado ahora"}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
