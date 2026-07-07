import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { generateUUID } from '../utils/uuid';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Worker de PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
interface Libro {
  id: string;
  titulo: string;
  autor: string | null;
  formato: string;
  coleccion_rag: string | null;
  materia_id: string | null;
  color_portada: string;
  cfi_actual: string | null;
  porcentaje_leido: number;
}

interface Anotacion {
  id: string;
  tipo: 'highlight' | 'note' | 'bookmark';
  texto_seleccionado: string | null;
  nota: string | null;
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple';
  cfi: string | null;
  capitulo: string | null;
  creado_at: string;
}

interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

type Tema = 'light' | 'sepia' | 'dark' | 'oled';

// ──────────────────────────────────────────────
// Constantes de diseño
// ──────────────────────────────────────────────
const HIGHLIGHT_COLORS: Record<string, { fill: string; label: string; bg: string }> = {
  yellow: { fill: '#FBBF24', label: 'Amarillo', bg: '#FEF9C3' },
  green:  { fill: '#34D399', label: 'Verde',    bg: '#D1FAE5' },
  blue:   { fill: '#60A5FA', label: 'Azul',     bg: '#DBEAFE' },
  red:    { fill: '#F87171', label: 'Rojo',      bg: '#FEE2E2' },
  purple: { fill: '#A78BFA', label: 'Púrpura',  bg: '#EDE9FE' },
};

const TEMAS: Record<Tema, { bg: string; text: string; panel: string; border: string; label: string; icon: string }> = {
  light: { bg: '#FFFFFF', text: '#1A1A1A', panel: '#F8F8F8', border: '#E5E5E5', label: 'Claro',   icon: '☀️' },
  sepia: { bg: '#F9F3E8', text: '#3D2B1F', panel: '#F2EBD9', border: '#DDD0BE', label: 'Sepia',   icon: '📜' },
  dark:  { bg: '#1C1B29', text: '#E8E2D0', panel: '#252438', border: '#353350', label: 'Oscuro',  icon: '🌙' },
  oled:  { bg: '#000000', text: '#E8E2D0', panel: '#0D0D0D', border: '#1A1A1A', label: 'OLED',    icon: '⚫' },
};

const FUENTES = [
  { id: 'garamond', css: "'EB Garamond', Georgia, serif",  label: 'Garamond' },
  { id: 'georgia',  css: "Georgia, 'Times New Roman', serif", label: 'Georgia' },
  { id: 'inter',    css: "'Inter', system-ui, sans-serif",  label: 'Inter' },
];

// ──────────────────────────────────────────────
// CSS de tema inyectado en el iframe de epub.js
// ──────────────────────────────────────────────
function buildThemeCSS(tema: Tema, fontSize: number, fontFamily: string, lineHeight: number) {
  const t = TEMAS[tema];
  return {
    'html, body': {
      background: `${t.bg} !important`,
      color: `${t.text} !important`,
      'font-family': `${fontFamily} !important`,
      'font-size': `${fontSize}px !important`,
      'line-height': `${lineHeight} !important`,
      padding: '2.5rem 3rem !important',
      margin: '0 auto !important',
      'max-width': '720px !important',
    },
    'p': {
      'margin-bottom': '1em !important',
      'text-align': 'justify !important',
      'hyphens': 'auto !important',
    },
    'h1, h2, h3, h4': {
      color: `${t.text} !important`,
      'text-align': 'left !important',
      'text-indent': '0 !important',
      'margin-top': '1.5em !important',
    },
    'a': { color: tema === 'dark' || tema === 'oled' ? '#A78BFA' : '#6A45DE' },
    '::selection': {
      background: '#A78BFA44 !important',
    },
    // Highlight colors applied via epub.js annotations
    '.epubjs-hl': {
      'border-radius': '2px',
      opacity: '0.4',
    },
  } as Record<string, Record<string, string>>;
}

// ──────────────────────────────────────────────
// Componente: Menú contextual de selección
// ──────────────────────────────────────────────
function ContextMenu({
  pos, tema, onHighlight, onNote, onAskAI, onFlashcard, onSendToCerebro, onClose,
}: {
  pos: { x: number; y: number };
  tema: Tema;
  onHighlight: (color: string) => void;
  onNote: () => void;
  onAskAI: () => void;
  onFlashcard: () => void;
  onSendToCerebro: () => void;
  onClose: () => void;
}) {
  const t = TEMAS[tema];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y - 56,
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: tema === 'dark' || tema === 'oled' ? '#1C1B29' : 'white',
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        boxShadow: '0 20px 40px -8px rgba(0,0,0,.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '6px 8px',
        animation: 'fadeInUp .12s ease',
      }}>
        {/* Colores de highlight */}
        {Object.entries(HIGHLIGHT_COLORS).map(([key, val]) => (
          <button
            key={key}
            onClick={() => onHighlight(key)}
            title={val.label}
            style={{
              width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: val.fill, opacity: .9, transition: 'opacity .1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '.9')}
          />
        ))}
        <div style={{ width: 1, height: 20, background: t.border, margin: '0 4px' }} />
        {/* Acciones */}
        {[
          { icon: '📝', label: 'Nota', action: onNote },
          { icon: '💡', label: 'Enviar a Mi Cerebro', action: onSendToCerebro },
          { icon: '🤖', label: 'Preguntar a Mathós', action: onAskAI },
          { icon: '🃏', label: 'Crear flashcard', action: onFlashcard },
        ].map(btn => (
          <button
            key={btn.icon}
            onClick={btn.action}
            title={btn.label}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 17, padding: '2px 5px', borderRadius: 6, transition: 'background .1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = t.panel)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {btn.icon}
          </button>
        ))}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────
// Componente: Panel lateral de IA
// ──────────────────────────────────────────────
function AiPanel({
  libro, selectedText, tema, onClose,
}: {
  libro: Libro;
  selectedText: string;
  tema: Tema;
  onClose: () => void;
}) {
  const t = TEMAS[tema];
  const [messages, setMessages] = useState<{ rol: 'user' | 'ai'; txt: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-enviar con el texto seleccionado al abrir
  useEffect(() => {
    if (selectedText) {
      const q = `En el contexto de este pasaje:\n\n"${selectedText}"\n\n¿Puedes explicarme esto en profundidad?`;
      setInput(q);
    }
  }, [selectedText]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setMessages(m => [...m, { rol: 'user', txt: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await api.post('/asistente/preguntar', {
        pregunta: q,
        codigo_materia: libro.coleccion_rag || undefined,
        nivel: 'dummy',
      });
      setMessages(m => [...m, { rol: 'ai', txt: res.data.respuesta }]);
    } catch {
      setMessages(m => [...m, { rol: 'ai', txt: '⚠️ No se pudo contactar con Mathós.' }]);
    }
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  return (
    <div style={{
      width: 360, height: '100%', display: 'flex', flexDirection: 'column',
      background: t.panel, borderLeft: `1px solid ${t.border}`,
      animation: 'slideInRight .2s ease',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>🤖 Mathós</div>
          <div style={{ fontSize: 11, color: t.text, opacity: .6, marginTop: 1 }}>
            {libro.coleccion_rag ? `Colección: ${libro.coleccion_rag}` : 'Sin RAG'}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 18, opacity: .5, color: t.text,
        }}>✕</button>
      </div>

      {/* Pasaje seleccionado */}
      {selectedText && (
        <div style={{
          margin: '12px 14px 4px',
          padding: '10px 12px',
          borderRadius: 10,
          background: tema === 'dark' || tema === 'oled' ? 'rgba(167,139,250,.12)' : '#EDE9FE',
          borderLeft: '3px solid #A78BFA',
          fontSize: 12.5, lineHeight: 1.5, color: t.text, opacity: .85,
          fontStyle: 'italic', flexShrink: 0,
          maxHeight: 100, overflowY: 'auto',
        }}>
          "{selectedText.length > 200 ? selectedText.slice(0, 200) + '…' : selectedText}"
        </div>
      )}

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', opacity: .4, marginTop: 'auto', marginBottom: 'auto', color: t.text, fontSize: 13 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🧠</div>
            Pregúntame sobre este pasaje o cualquier concepto del libro
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            padding: '10px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.55, color: t.text,
            background: m.rol === 'user'
              ? (tema === 'dark' || tema === 'oled' ? 'rgba(106,69,222,.2)' : '#EDE9FE')
              : (tema === 'dark' || tema === 'oled' ? 'rgba(255,255,255,.06)' : 'white'),
            border: m.rol === 'ai' ? `1px solid ${t.border}` : 'none',
            alignSelf: m.rol === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '90%',
            whiteSpace: 'pre-wrap',
          }}>
            {m.txt}
          </div>
        ))}
        {loading && (
          <div style={{ color: t.text, opacity: .5, fontSize: 13 }}>Mathós está pensando…</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 14px', borderTop: `1px solid ${t.border}`, flexShrink: 0,
        display: 'flex', gap: 8,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Pregunta sobre el libro…"
          rows={2}
          style={{
            flex: 1, resize: 'none', borderRadius: 10, padding: '8px 12px',
            border: `1px solid ${t.border}`, background: t.bg, color: t.text,
            fontSize: 13, outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            alignSelf: 'flex-end', padding: '8px 14px', borderRadius: 10,
            border: 'none', cursor: 'pointer', background: '#6A45DE', color: 'white',
            fontWeight: 700, fontSize: 13, opacity: loading || !input.trim() ? .4 : 1,
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Componente: Modal de nota/flashcard
// ──────────────────────────────────────────────
function Modal({
  titulo, selectedText, tema, onSave, onClose, showFlashcard,
}: {
  titulo: string;
  selectedText: string;
  tema: Tema;
  onSave: (nota: string, flashcard?: boolean) => void;
  onClose: () => void;
  showFlashcard?: boolean;
}) {
  const t = TEMAS[tema];
  const [nota, setNota] = useState('');
  const [asFlashcard, setAsFlashcard] = useState(showFlashcard || false);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: t.bg, borderRadius: 20, padding: '24px', width: 480, maxWidth: '90vw',
        boxShadow: '0 40px 80px -20px rgba(0,0,0,.5)',
        border: `1px solid ${t.border}`,
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800, color: t.text }}>{titulo}</h3>

        {/* Pasaje */}
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 14,
          background: tema === 'dark' || tema === 'oled' ? 'rgba(167,139,250,.12)' : '#EDE9FE',
          borderLeft: '3px solid #A78BFA',
          fontSize: 13, fontStyle: 'italic', color: t.text, lineHeight: 1.5,
        }}>
          "{selectedText.length > 200 ? selectedText.slice(0, 200) + '…' : selectedText}"
        </div>

        <textarea
          autoFocus
          value={nota}
          onChange={e => setNota(e.target.value)}
          placeholder={asFlashcard ? 'Pregunta para la flashcard (opcional — se auto-genera si la dejas vacía)' : 'Tu nota aquí…'}
          rows={4}
          style={{
            width: '100%', resize: 'vertical', borderRadius: 10, padding: '10px 14px',
            border: `1px solid ${t.border}`, background: t.panel, color: t.text,
            fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />

        {showFlashcard !== true && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', color: t.text, fontSize: 13 }}>
            <input type="checkbox" checked={asFlashcard} onChange={e => setAsFlashcard(e.target.checked)} />
            Crear también como flashcard SRS
          </label>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 10, border: `1px solid ${t.border}`,
            cursor: 'pointer', background: 'transparent', color: t.text, fontWeight: 600, fontSize: 14,
          }}>
            Cancelar
          </button>
          <button onClick={() => onSave(nota, asFlashcard)} style={{
            padding: '9px 18px', borderRadius: 10, border: 'none',
            cursor: 'pointer', background: '#6A45DE', color: 'white', fontWeight: 700, fontSize: 14,
          }}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Página principal: Lector
// ──────────────────────────────────────────────
export default function Lector() {
  const { libroId } = useParams<{ libroId: string }>();
  const navigate = useNavigate();

  // Estado del libro
  const [libro, setLibro] = useState<Libro | null>(null);
  const [anotaciones, setAnotaciones] = useState<Anotacion[]>([]);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentChapter, setCurrentChapter] = useState('');
  const [loading, setLoading] = useState(true);
  const [epubReady, setEpubReady] = useState(false);

  // UI
  const [tema, setTema] = useState<Tema>('sepia');
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.7);
  const [fontIndex, setFontIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);

  // Selección de texto
  const [selectedText, setSelectedText] = useState('');
  const [selectedCfi, setSelectedCfi] = useState('');
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [showMenu, setShowMenu] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showFlashcardModal, setShowFlashcardModal] = useState(false);
  const [showCitarModal, setShowCitarModal] = useState(false);
  const [citarTexto, setCitarTexto] = useState('');
  const [citarEnviando, setCitarEnviando] = useState(false);
  const [citarOk, setCitarOk] = useState(false);
  const [cerebroOk, setCerebroOk] = useState(false);
  const [cerebroError, setCerebroError] = useState(false);
  // PDF state
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Dimensiones reales del contenedor de lectura
  const [viewerSize, setViewerSize] = useState({ w: window.innerWidth, h: window.innerHeight - 56 - 48 });

  const [epubError, setEpubError] = useState<string | null>(null);
  const [epubLoading, setEpubLoading] = useState(false);

  // epub.js refs
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const saveProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = TEMAS[tema];
  const fontFam = FUENTES[fontIndex].css;

  // Recalcular dimensiones en resize y cuando cambian los paneles
  useEffect(() => {
    const calc = () => {
      const sidebarW = (showToc || showAnnotations) ? 280 : 0;
      const aiW = showAiPanel ? 360 : 0;
      const newSize = {
        w: window.innerWidth - sidebarW - aiW,
        h: window.innerHeight - 56 - 48,
      };
      setViewerSize(newSize);
      // Informar al rendition si ya está activo
      if (renditionRef.current) renditionRef.current.resize(newSize.w, newSize.h);
    };
    window.addEventListener('resize', calc);
    calc();
    return () => window.removeEventListener('resize', calc);
  }, [showToc, showAnnotations, showAiPanel]);

  // ── Cargar libro y anotaciones ──────────────
  useEffect(() => {
    if (!libroId) return;
    Promise.all([
      api.get(`/libros/${libroId}`),
      api.get(`/libros/${libroId}/anotaciones`),
    ]).then(([lRes, aRes]) => {
      setLibro(lRes.data);
      setAnotaciones(aRes.data);
      setProgress(lRes.data.porcentaje_leido || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [libroId]);

  // ── Inicializar epub.js ──────────────────────
  useEffect(() => {
    if (!libro || !viewerRef.current || libro.formato !== 'epub') return;

    let destroyed = false;
    setEpubError(null);
    setEpubLoading(true);

    (async () => {
      try {
        const { default: ePub } = await import('epubjs');
        if (destroyed) return;

        // openAs: 'epub' es necesario porque la URL no tiene extensión .epub
        const book = ePub(`/api/v1/libros/${libroId}/archivo`, { openAs: 'epub' });
        bookRef.current = book;

        // Escuchar errores de apertura
        book.on('openFailed', (err: any) => {
          setEpubError(`No se pudo abrir el archivo EPUB: ${err?.message || err}`);
          setEpubLoading(false);
        });

        const w = window.innerWidth;
        const h = window.innerHeight - 56 - 48;

        // Modo scrolled: más compatible que paginated con Vite/React
        const rendition = book.renderTo(viewerRef.current!, {
          width: w,
          height: h,
          flow: 'scrolled',
          manager: 'continuous',
        });
        renditionRef.current = rendition;

        // Aplicar tema
        const css = buildThemeCSS(tema, fontSize, fontFam, lineHeight);
        rendition.themes.register('custom', css);
        rendition.themes.select('custom');

        // Mostrar en posición guardada o desde el inicio
        if (libro.cfi_actual) {
          await rendition.display(libro.cfi_actual);
        } else {
          await rendition.display();
        }
        // TOC
        book.loaded.navigation.then((nav: any) => {
          if (!destroyed) setToc(nav.toc || []);
        });

        // Generar ubicaciones para el % de progreso
        book.ready.then(() => {
          book.locations.generate(1024).catch(() => {});
        });

        // Progreso
        rendition.on('locationChanged', (loc: any) => {
          try {
            const pct = book.locations.percentageFromCfi(loc.start.cfi);
            if (pct && !isNaN(pct)) {
              const p = Math.round(pct * 100);
              setProgress(p);
              if (saveProgressTimer.current) clearTimeout(saveProgressTimer.current);
              saveProgressTimer.current = setTimeout(() => {
                api.patch(`/libros/${libroId}/progreso`, {
                  cfi_actual: loc.start.cfi,
                  porcentaje_leido: p,
                }).catch(() => {});
              }, 2000);
            }
          } catch {}
          try {
            const spine: any = book.spine;
            const item = spine.get(loc.start.cfi);
            if (item) {
              const found = toc.find((t: TocItem) =>
                item.href.includes(t.href.split('#')[0])
              );
              if (found) setCurrentChapter(found.label);
            }
          } catch {}
        });

        // Selección de texto
        rendition.on('selected', (cfiRange: string, contents: any) => {
          try {
            const text = contents.window.getSelection()?.toString()?.trim() || '';
            if (!text || text.length < 5) { setShowMenu(false); return; }
            setSelectedText(text);
            setSelectedCfi(cfiRange);

            // frameElement devuelve el iframe exacto que contiene la selección
            const iframe = (contents.window.frameElement as HTMLIFrameElement)
              ?? (viewerRef.current?.querySelector('iframe') as HTMLIFrameElement);
            if (!iframe) return;

            const iRect = iframe.getBoundingClientRect();
            const sel = contents.window.getSelection();
            if (!sel?.rangeCount) return;
            const sRect = sel.getRangeAt(0).getBoundingClientRect();
            setMenuPos({ x: iRect.left + sRect.left + sRect.width / 2, y: iRect.top + sRect.top });
            setShowMenu(true);
          } catch {}
        });

        rendition.on('rendered', () => {
          setShowMenu(false);
          anotaciones.filter(a => a.tipo === 'highlight' && a.cfi).forEach(a => {
            try {
              rendition.annotations.add(
                'highlight', a.cfi!, {}, undefined, 'epubjs-hl',
                { fill: HIGHLIGHT_COLORS[a.color]?.fill || '#FBBF24', 'fill-opacity': '0.35' }
              );
            } catch {}
          });
        });

        rendition.on('keydown', (e: KeyboardEvent) => {
          if (e.key === 'ArrowRight' || e.key === 'l') rendition.next();
          if (e.key === 'ArrowLeft' || e.key === 'h') rendition.prev();
          if (e.key === 'Escape') { setShowMenu(false); setShowAiPanel(false); }
        });

        setEpubReady(true);
        setEpubLoading(false);
      } catch (err: any) {
        if (!destroyed) {
          setEpubError(`Error: ${err?.message || String(err)}`);
          setEpubLoading(false);
        }
      }
    })();

    return () => {
      destroyed = true;
      if (saveProgressTimer.current) clearTimeout(saveProgressTimer.current);
      bookRef.current?.destroy?.();
      bookRef.current = null;
      renditionRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libro?.id]);


  // ── Cambio de tema/fuente/tamaño ───────────
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !epubReady) return;
    const css = buildThemeCSS(tema, fontSize, fontFam, lineHeight);
    rendition.themes.register('custom', css);
    rendition.themes.select('custom');
  }, [tema, fontSize, fontFam, lineHeight, epubReady]);

  // ── Acciones de anotación ──────────────────
  const crearHighlight = useCallback(async (color: string) => {
    if (!selectedText || !selectedCfi || !libroId) return;
    setShowMenu(false);
    try {
      const res = await api.post(`/libros/${libroId}/anotaciones`, {
        tipo: 'highlight',
        texto_seleccionado: selectedText,
        color,
        cfi: selectedCfi,
        capitulo: currentChapter || null,
      });
      const nueva = res.data as Anotacion;
      setAnotaciones(prev => [...prev, nueva]);
      // Aplicar highlight en el epub
      renditionRef.current?.annotations?.add(
        'highlight', selectedCfi, {}, undefined, 'epubjs-hl',
        { fill: HIGHLIGHT_COLORS[color]?.fill || '#FBBF24', 'fill-opacity': '0.35' }
      );
    } catch {}
  }, [selectedText, selectedCfi, currentChapter, libroId]);

  const guardarNota = useCallback(async (nota: string, asFlashcard?: boolean) => {
    if (!selectedText || !libroId) return;
    setShowNoteModal(false);
    try {
      const res = await api.post(`/libros/${libroId}/anotaciones`, {
        tipo: 'note',
        texto_seleccionado: selectedText,
        nota,
        color: 'yellow',
        cfi: selectedCfi || null,
        capitulo: currentChapter || null,
      });
      setAnotaciones(prev => [...prev, res.data as Anotacion]);

      if (asFlashcard && libro?.materia_id) {
        // Crear flashcard manual en SRS
        await api.post('/srs/flashcards', {
          materia_id: libro.materia_id,
          pregunta: nota || `¿Qué significa este concepto? "${selectedText.slice(0, 80)}"`,
          respuesta: selectedText,
          fuente: 'manual',
        }).catch(() => {});
      }
    } catch {}
  }, [selectedText, selectedCfi, currentChapter, libroId, libro?.materia_id]);

  const guardarFlashcard = useCallback(async (pregunta: string) => {
    if (!selectedText || !libroId) return;
    setShowFlashcardModal(false);
    // Crear highlight primero
    await crearHighlight('purple');
    // Crear flashcard
    if (libro?.materia_id) {
      await api.post('/srs/flashcards', {
        materia_id: libro.materia_id,
        pregunta: pregunta || `¿Qué expresa el siguiente pasaje?\n"${selectedText.slice(0, 120)}"`,
        respuesta: selectedText,
        fuente: 'manual',
      }).catch(() => {});
    }
  }, [selectedText, libroId, libro?.materia_id, crearHighlight]);

  const eliminarAnotacion = async (id: string, cfi?: string | null) => {
    try {
      await api.delete(`/libros/anotaciones/${id}`);
      setAnotaciones(prev => prev.filter(a => a.id !== id));
      if (cfi) renditionRef.current?.annotations?.remove(cfi, 'highlight');
    } catch {}
  };

  const irAAnnotacion = (cfi: string) => {
    renditionRef.current?.display(cfi);
    setShowAnnotations(false);
  };

  // ── Navegación ──────────────────────────────
  const prev = () => renditionRef.current?.prev();
  const next = () => renditionRef.current?.next();
  const irA = (href: string) => {
    renditionRef.current?.display(href);
    setShowToc(false);
  };

  // ── Render ──────────────────────────────────
  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: TEMAS.sepia.bg, color: TEMAS.sepia.text, fontSize: 16,
      }}>
        Cargando libro…
      </div>
    );
  }

  if (!libro) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: TEMAS.sepia.bg, color: TEMAS.sepia.text, gap: 16,
      }}>
        <div style={{ fontSize: 48 }}>📚</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Libro no encontrado</div>
        <button onClick={() => navigate('/biblioteca')} style={{
          padding: '10px 20px', borderRadius: 12, border: 'none',
          background: '#6A45DE', color: 'white', cursor: 'pointer', fontWeight: 700,
        }}>
          ← Volver a la biblioteca
        </button>
      </div>
    );
  }

  const sendToCerebro = async () => {
    if (!selectedText.trim()) return;
    setShowMenu(false);
    try {
      await api.post('/cerebro/nota', {
        id: generateUUID(),
        title: `Extracto: ${libro!.titulo.substring(0, 50)}`,
        content: `> "${selectedText}"\n\nFuente: **${libro!.titulo}**\n\nMis apuntes: `,
        category: 'biblioteca',
        parent_folder: '/biblioteca',
      });
      setCerebroOk(true);
      setTimeout(() => setCerebroOk(false), 2200);
      // Flash visual de confirmación en el texto (soportando iframes para epubjs)
      let selection = window.getSelection();
      let activeDoc: Document = document;
      if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
          const iframeWin = iframes[i].contentWindow;
          if (iframeWin) {
            const sel = iframeWin.getSelection();
            if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
              selection = sel;
              activeDoc = iframes[i].contentDocument ?? document;
              break;
            }
          }
        }
      }
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const mark = activeDoc.createElement('mark');
        mark.style.cssText = 'background:rgba(106,69,222,0.35);border-radius:4px;color:inherit;';
        try {
          range.surroundContents(mark);
          setTimeout(() => {
            if (mark.parentNode) {
              const frag = activeDoc.createDocumentFragment();
              while (mark.firstChild) frag.appendChild(mark.firstChild);
              mark.parentNode.replaceChild(frag, mark);
            }
          }, 1500);
        } catch (_) { /* ignora si la selección cruza nodos */ }
      }
    } catch (e) {
      console.error('Error enviando a Cerebro:', e);
      setCerebroError(true);
      setTimeout(() => setCerebroError(false), 2500);
    }
  };

  const enviarCitar = async () => {
    if (!citarTexto.trim() || !libro) return;
    setCitarEnviando(true);
    try {
      await api.post('/cerebro/nota', {
        id: generateUUID(),
        title: `Extracto: ${libro.titulo.substring(0, 50)}`,
        content: `> "${citarTexto.trim()}"\n\nFuente: **${libro.titulo}**\n\nMis apuntes: `,
        category: 'biblioteca',
        parent_folder: '/biblioteca',
      });
      setCitarOk(true);
      setTimeout(() => { setCitarOk(false); setShowCitarModal(false); setCitarTexto(''); }, 1800);
    } catch { /* silenciar */ }
    setCitarEnviando(false);
  };

  return (
    <>
      {/* Animaciones globales */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap');
        @keyframes fadeInUp { from { opacity:0; transform:translateY(8px) translateX(-50%) } to { opacity:1; transform:translateY(0) translateX(-50%) } }
        @keyframes slideInRight { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }
        @keyframes slideInLeft { from { opacity:0; transform:translateX(-20px) } to { opacity:1; transform:translateX(0) } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes fadeInUp2 { from { opacity:0; transform:translateY(8px) translateX(-50%) } to { opacity:1; transform:translateY(0) translateX(-50%) } }
      `}</style>

      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column',
          background: t.bg, color: t.text, fontFamily: fontFam, overflow: 'hidden',
        }}
        onClick={() => { setShowSettings(false); }}
      >
        {/* ── Barra superior ─────────────────────── */}
        <div style={{
          height: 56, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
          borderBottom: `1px solid ${t.border}`,
          background: t.panel,
          transition: 'opacity .3s',
          opacity: showToolbar ? 1 : 0,
          pointerEvents: showToolbar ? 'auto' : 'none',
        }}>
          {/* Volver */}
          <button
            onClick={() => navigate('/biblioteca')}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', color: t.text,
              opacity: .6, fontSize: 20, padding: 4, borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ←
          </button>

          {/* Título */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 700, fontSize: 14, color: t.text,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {libro.titulo}
            </div>
            {currentChapter && (
              <div style={{ fontSize: 11, opacity: .5, marginTop: 1 }}>{currentChapter}</div>
            )}
          </div>

          {/* Controles derecha */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* TOC */}
            <ToolBtn active={showToc} tema={tema} onClick={() => { setShowToc(v => !v); setShowAnnotations(false); }} title="Tabla de contenido">
              ☰
            </ToolBtn>
            {/* Anotaciones */}
            <ToolBtn active={showAnnotations} tema={tema} onClick={() => { setShowAnnotations(v => !v); setShowToc(false); }} title="Mis anotaciones">
              🖊️ {anotaciones.length > 0 && <span style={{ fontSize: 11, fontWeight: 700 }}>{anotaciones.length}</span>}
            </ToolBtn>
            {/* IA */}
            <ToolBtn active={showAiPanel} tema={tema} onClick={() => setShowAiPanel(v => !v)} title="Preguntar a Mathós">
              🤖
            </ToolBtn>
            {/* Citar en Cerebro */}
            <ToolBtn active={showCitarModal} tema={tema} onClick={() => { setCitarTexto(selectedText || ''); setShowCitarModal(true); }} title="Citar en Mi Cerebro">
              💡
            </ToolBtn>
            {/* Ajustes */}
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <ToolBtn active={showSettings} tema={tema} onClick={() => setShowSettings(v => !v)} title="Ajustes de lectura">
                ⚙️
              </ToolBtn>
              {showSettings && (
                <SettingsPanel
                  tema={tema} setTema={setTema}
                  fontSize={fontSize} setFontSize={setFontSize}
                  lineHeight={lineHeight} setLineHeight={setLineHeight}
                  fontIndex={fontIndex} setFontIndex={setFontIndex}
                  showToolbar={showToolbar} setShowToolbar={setShowToolbar}
                  t={t}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Área de contenido ──────────────────── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

          {/* Sidebar izquierdo: TOC o Anotaciones */}
          {(showToc || showAnnotations) && (
            <div style={{
              width: 280, flexShrink: 0, borderRight: `1px solid ${t.border}`,
              background: t.panel, overflowY: 'auto', display: 'flex', flexDirection: 'column',
              animation: 'slideInLeft .2s ease',
            }}>
              {showToc && (
                <TocPanel toc={toc} tema={tema} t={t} onNav={irA} />
              )}
              {showAnnotations && (
                <AnnotationsPanel
                  anotaciones={anotaciones} tema={tema} t={t}
                  onJump={irAAnnotacion} onDelete={eliminarAnotacion}
                />
              )}
            </div>
          )}

          {/* Visor EPUB */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {libro.formato === 'epub' ? (
              <div style={{ width: viewerSize.w, height: viewerSize.h, position: 'relative', overflow: 'hidden' }}>
                <div
                  ref={viewerRef}
                  style={{ width: '100%', height: '100%' }}
                  onClick={() => setShowSettings(false)}
                />
                {epubReady && !epubError && (
                  <HintBanner tema={tema} />
                )}
                {epubLoading && !epubReady && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexDirection: 'column', gap: 12,
                    background: t.bg, color: t.text, opacity: .8,
                  }}>
                    <div style={{ fontSize: 32, animation: 'spin 1.5s linear infinite' }}>📖</div>
                    <div style={{ fontSize: 14, opacity: .6 }}>Cargando libro…</div>
                  </div>
                )}
                {epubError && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexDirection: 'column', gap: 12,
                    background: t.bg, color: t.text, padding: 32, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 40 }}>⚠️</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>No se pudo cargar el libro</div>
                    <div style={{
                      fontSize: 12, opacity: .6, fontFamily: 'monospace',
                      background: t.panel, padding: '8px 12px', borderRadius: 8,
                      maxWidth: 480, wordBreak: 'break-all',
                    }}>
                      {epubError}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Visor PDF con react-pdf (permite selección de texto)
              <div
                ref={pdfContainerRef}
                style={{ width: viewerSize.w, height: viewerSize.h, overflowY: 'auto', background: t.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20 }}
                onMouseUp={() => {
                  const sel = window.getSelection()?.toString().trim();
                  if (sel && sel.length > 4) setSelectedText(sel);
                }}
              >
                <Document
                  file={`/api/v1/libros/${libroId}/archivo`}
                  onLoadSuccess={({ numPages }) => setPdfPages(numPages)}
                  loading={<div style={{ color: t.text, opacity: .5, padding: 40 }}>Cargando PDF…</div>}
                  error={<div style={{ color: t.text, opacity: .5, padding: 40 }}>⚠️ No se pudo cargar el PDF</div>}
                >
                  <Page
                    pageNumber={pdfPage}
                    width={Math.min(viewerSize.w - 40, 800)}
                    renderTextLayer={true}
                    renderAnnotationLayer={false}
                  />
                </Document>
                {pdfPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', color: t.text }}>
                    <button onClick={() => setPdfPage(p => Math.max(1, p - 1))} disabled={pdfPage <= 1}
                      style={{ background: 'transparent', border: `1px solid ${t.border}`, color: t.text, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', opacity: pdfPage <= 1 ? .4 : 1 }}>←</button>
                    <span style={{ fontSize: 13 }}>Pág. {pdfPage} / {pdfPages}</span>
                    <button onClick={() => setPdfPage(p => Math.min(pdfPages, p + 1))} disabled={pdfPage >= pdfPages}
                      style={{ background: 'transparent', border: `1px solid ${t.border}`, color: t.text, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', opacity: pdfPage >= pdfPages ? .4 : 1 }}>→</button>
                  </div>
                )}
              </div>
            )}

            {/* Zonas de navegación (click en bordes) */}
            {libro.formato === 'epub' && (
              <>
                <div
                  onClick={prev}
                  style={{
                    position: 'absolute', left: 0, top: 0, width: 80, height: '100%',
                    cursor: 'w-resize', zIndex: 10, opacity: 0,
                  }}
                />
                <div
                  onClick={next}
                  style={{
                    position: 'absolute', right: 0, top: 0, width: 80, height: '100%',
                    cursor: 'e-resize', zIndex: 10, opacity: 0,
                  }}
                />
              </>
            )}
          </div>

          {/* Panel de IA */}
          {showAiPanel && libro && (
            <AiPanel
              libro={libro}
              selectedText={selectedText}
              tema={tema}
              onClose={() => setShowAiPanel(false)}
            />
          )}
        </div>

        {/* ── Barra inferior ─────────────────────── */}
        {libro.formato === 'epub' && (
          <div style={{
            height: 48, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px',
            borderTop: `1px solid ${t.border}`, background: t.panel,
          }}>
            <button onClick={prev} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: t.text, opacity: .5, fontSize: 18, padding: '4px 8px',
            }}>←</button>

            {/* Barra de progreso */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  flex: 1, height: 4, background: t.border, borderRadius: 4, cursor: 'pointer',
                  position: 'relative',
                }}
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const cfi = bookRef.current?.locations?.cfiFromPercentage?.(pct);
                  if (cfi) renditionRef.current?.display(cfi);
                }}
              >
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4,
                  background: libro.color_portada,
                  width: `${progress}%`, transition: 'width .4s',
                }} />
              </div>
              <span style={{ fontSize: 12, opacity: .6, whiteSpace: 'nowrap', minWidth: 36, textAlign: 'right' }}>
                {progress}%
              </span>
            </div>

            <button onClick={next} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: t.text, opacity: .5, fontSize: 18, padding: '4px 8px',
            }}>→</button>
          </div>
        )}
      </div>

      {/* ── Menú contextual de selección ───────── */}
      {showMenu && (
        <ContextMenu
          pos={menuPos}
          tema={tema}
          onHighlight={crearHighlight}
          onNote={() => { setShowMenu(false); setShowNoteModal(true); }}
          onAskAI={() => { setShowMenu(false); setShowAiPanel(true); }}
          onFlashcard={() => { setShowMenu(false); setShowFlashcardModal(true); }}
          onSendToCerebro={sendToCerebro}
          onClose={() => setShowMenu(false)}
        />
      )}

      {/* ── Modal de nota ──────────────────────── */}
      {showNoteModal && (
        <Modal
          titulo="Añadir nota"
          selectedText={selectedText}
          tema={tema}
          onSave={guardarNota}
          onClose={() => setShowNoteModal(false)}
        />
      )}

      {/* ── Modal de flashcard ─────────────────── */}
      {showFlashcardModal && (
        <Modal
          titulo="Crear flashcard SRS"
          selectedText={selectedText}
          tema={tema}
          onSave={(pregunta) => guardarFlashcard(pregunta)}
          onClose={() => setShowFlashcardModal(false)}
          showFlashcard
        />
      )}

      {/* ── Modal: Citar en Cerebro ──────────── */}
      {showCitarModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={() => setShowCitarModal(false)} style={{ position: 'absolute', inset: 0 }} />
          <div style={{
            position: 'relative', background: 'white', borderRadius: 18,
            padding: '24px', maxWidth: 520, width: '90%',
            boxShadow: '0 24px 48px rgba(0,0,0,.25)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#1E1B2E' }}>
              🧠 Citar en Mi Cerebro
            </h3>
            <textarea
              value={citarTexto}
              onChange={e => setCitarTexto(e.target.value)}
              style={{
                width: '100%', minHeight: 120, padding: 12, borderRadius: 10,
                border: '1px solid #E5E0D8', fontSize: 13, lineHeight: 1.6,
                fontFamily: "'Georgia', serif", resize: 'vertical',
                background: '#FDFBF7', color: '#2D2A24',
              }}
              autoFocus
            />
            <p style={{ fontSize: 11, color: '#9A8F80', marginTop: 8 }}>
              Este texto se guardará como una nota en Cerebro en la carpeta <strong>/biblioteca</strong>.
              Podés editarlo antes de enviar.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setShowCitarModal(false); setCitarTexto(''); }}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E0D8',
                  background: 'white', color: '#6B6155', fontWeight: 600, fontSize: 13, cursor: 'pointer'
                }}
              >Cancelar</button>
              <button
                onClick={enviarCitar}
                disabled={citarEnviando || !citarTexto.trim()}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: citarEnviando ? '#A78BFA' : '#6A45DE',
                  color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  opacity: citarEnviando || !citarTexto.trim() ? 0.6 : 1,
                }}
              >{citarEnviando ? 'Enviando...' : citarOk ? '✓ Enviado' : 'Enviar a Cerebro'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast: Enviado a Cerebro ─────────────── */}
      {(cerebroOk || cerebroError) && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          background: cerebroOk ? '#0D9488' : '#DC2626',
          color: 'white',
          padding: '10px 20px',
          borderRadius: 12,
          fontWeight: 600,
          fontSize: 14,
          boxShadow: '0 8px 24px rgba(0,0,0,.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          animation: 'fadeInUp .2s ease',
          pointerEvents: 'none',
        }}>
          {cerebroOk ? '🧠 Enviado a Mi Cerebro' : '⚠️ Error al enviar a Cerebro'}
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────
// Sub-componentes auxiliares
// ──────────────────────────────────────────────

function ToolBtn({
  children, active, tema, onClick, title,
}: {
  children: React.ReactNode;
  active: boolean;
  tema: Tema;
  onClick: () => void;
  title?: string;
}) {
  const t = TEMAS[tema];
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
        background: active ? (tema === 'dark' || tema === 'oled' ? 'rgba(167,139,250,.18)' : '#EDE9FE') : 'transparent',
        color: active ? '#7C3AED' : t.text,
        fontSize: 16, opacity: active ? 1 : .55, transition: 'all .15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.opacity = '.9'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.opacity = '.55'; }}
    >
      {children}
    </button>
  );
}

function TocPanel({
  toc, tema, t, onNav,
}: {
  toc: TocItem[];
  tema: Tema;
  t: typeof TEMAS[Tema];
  onNav: (href: string) => void;
}) {
  const renderItem = (item: TocItem, depth = 0): React.ReactNode => (
    <div key={item.id || item.href}>
      <button
        onClick={() => onNav(item.href)}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          padding: `8px 16px 8px ${16 + depth * 14}px`,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: t.text, fontSize: depth === 0 ? 13 : 12,
          fontWeight: depth === 0 ? 600 : 400,
          opacity: depth === 0 ? .9 : .7,
          borderLeft: depth > 0 ? `2px solid ${t.border}` : 'none',
          marginLeft: depth > 0 ? 16 : 0,
          transition: 'opacity .1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = depth === 0 ? '.9' : '.7')}
      >
        {item.label}
      </button>
      {item.subitems?.map(sub => renderItem(sub, depth + 1))}
    </div>
  );

  return (
    <div>
      <div style={{ padding: '14px 16px', fontWeight: 800, fontSize: 13, opacity: .5, textTransform: 'uppercase', letterSpacing: '.06em', color: t.text }}>
        Contenido
      </div>
      {toc.length === 0 ? (
        <div style={{ padding: '8px 16px', fontSize: 13, opacity: .5, color: t.text }}>No hay índice disponible</div>
      ) : toc.map(item => renderItem(item))}
    </div>
  );
}

function AnnotationsPanel({
  anotaciones, tema, t, onJump, onDelete,
}: {
  anotaciones: Anotacion[];
  tema: Tema;
  t: typeof TEMAS[Tema];
  onJump: (cfi: string) => void;
  onDelete: (id: string, cfi?: string | null) => void;
}) {
  const [activeTab, setActiveTab] = useState<'highlight' | 'note' | 'all'>('all');
  const filtradas = activeTab === 'all' ? anotaciones : anotaciones.filter(a => a.tipo === activeTab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 16px 8px', fontWeight: 800, fontSize: 13, opacity: .5, textTransform: 'uppercase', letterSpacing: '.06em', color: t.text }}>
        Anotaciones
      </div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 12px', flexShrink: 0 }}>
        {[
          { id: 'all', label: 'Todas' },
          { id: 'highlight', label: 'Subrayados' },
          { id: 'note', label: 'Notas' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: activeTab === tab.id ? '#6A45DE' : 'transparent',
              color: activeTab === tab.id ? 'white' : t.text,
              opacity: activeTab === tab.id ? 1 : .5,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtradas.length === 0 ? (
          <div style={{ padding: '16px', fontSize: 13, opacity: .4, color: t.text, textAlign: 'center' }}>
            Sin anotaciones todavía.<br />Selecciona texto en el libro.
          </div>
        ) : filtradas.map(ann => (
          <div
            key={ann.id}
            style={{
              margin: '0 10px 8px',
              borderRadius: 10,
              border: `1px solid ${HIGHLIGHT_COLORS[ann.color]?.fill || t.border}44`,
              background: tema === 'dark' || tema === 'oled'
                ? `${HIGHLIGHT_COLORS[ann.color]?.fill || '#FBBF24'}11`
                : HIGHLIGHT_COLORS[ann.color]?.bg || '#FEF9C3',
              padding: '10px 12px',
            }}
          >
            {ann.capitulo && (
              <div style={{ fontSize: 10, fontWeight: 700, opacity: .5, marginBottom: 4, color: t.text, textTransform: 'uppercase' }}>
                {ann.capitulo}
              </div>
            )}
            {ann.texto_seleccionado && (
              <div
                onClick={() => ann.cfi && onJump(ann.cfi)}
                style={{
                  fontSize: 12.5, lineHeight: 1.5, color: t.text, fontStyle: 'italic',
                  cursor: ann.cfi ? 'pointer' : 'default',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}
              >
                "{ann.texto_seleccionado}"
              </div>
            )}
            {ann.nota && (
              <div style={{ fontSize: 12, color: t.text, marginTop: 6, opacity: .8, borderTop: `1px solid ${t.border}`, paddingTop: 6 }}>
                📝 {ann.nota}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                onClick={() => onDelete(ann.id, ann.cfi)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 11, opacity: .4, color: t.text, padding: '2px 6px',
                }}
                title="Eliminar anotación"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({
  tema, setTema, fontSize, setFontSize,
  lineHeight, setLineHeight, fontIndex, setFontIndex,
  showToolbar, setShowToolbar, t,
}: {
  tema: Tema; setTema: (t: Tema) => void;
  fontSize: number; setFontSize: (n: number) => void;
  lineHeight: number; setLineHeight: (n: number) => void;
  fontIndex: number; setFontIndex: (n: number) => void;
  showToolbar: boolean; setShowToolbar: (b: boolean) => void;
  t: typeof TEMAS[Tema];
}) {
  return (
    <div style={{
      position: 'absolute', top: 44, right: 0, width: 280,
      background: t.panel, border: `1px solid ${t.border}`,
      borderRadius: 14, boxShadow: '0 20px 40px -8px rgba(0,0,0,.4)',
      padding: 18, zIndex: 100,
    }}>
      {/* Temas */}
      <div style={{ marginBottom: 16 }}>
        <Label t={t}>Tema</Label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(TEMAS) as Tema[]).map(k => (
            <button
              key={k}
              onClick={() => setTema(k)}
              title={TEMAS[k].label}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 9, cursor: 'pointer',
                background: TEMAS[k].bg,
                border: `2px solid ${tema === k ? '#6A45DE' : TEMAS[k].border}`,
                fontSize: 16,
              }}
            >
              {TEMAS[k].icon}
            </button>
          ))}
        </div>
      </div>

      {/* Fuente */}
      <div style={{ marginBottom: 16 }}>
        <Label t={t}>Tipografía</Label>
        <div style={{ display: 'flex', gap: 6 }}>
          {FUENTES.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setFontIndex(i)}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 9, cursor: 'pointer',
                background: 'transparent',
                border: `2px solid ${fontIndex === i ? '#6A45DE' : t.border}`,
                color: t.text, fontSize: 13, fontFamily: f.css,
                fontWeight: fontIndex === i ? 700 : 400,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tamaño */}
      <div style={{ marginBottom: 14 }}>
        <Label t={t}>Tamaño de letra <span style={{ opacity: .5 }}>{fontSize}px</span></Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, opacity: .6, color: t.text }}>A</span>
          <input
            type="range" min={13} max={28} step={1} value={fontSize}
            onChange={e => setFontSize(+e.target.value)}
            style={{ flex: 1, accentColor: '#6A45DE' }}
          />
          <span style={{ fontSize: 18, opacity: .6, color: t.text }}>A</span>
        </div>
      </div>

      {/* Interlineado */}
      <div style={{ marginBottom: 14 }}>
        <Label t={t}>Interlineado <span style={{ opacity: .5 }}>{lineHeight.toFixed(1)}×</span></Label>
        <input
          type="range" min={1.3} max={2.2} step={0.1} value={lineHeight}
          onChange={e => setLineHeight(+e.target.value)}
          style={{ width: '100%', accentColor: '#6A45DE' }}
        />
      </div>

      {/* Toolbar */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: t.text, fontSize: 13 }}>
        <input type="checkbox" checked={showToolbar} onChange={e => setShowToolbar(e.target.checked)}
          style={{ accentColor: '#6A45DE' }} />
        Mostrar barra superior
      </label>
    </div>
  );
}

function HintBanner({ tema }: { tema: Tema }) {
  const [visible, setVisible] = useState(true);
  const t = TEMAS[tema];
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
      background: tema === 'dark' || tema === 'oled' ? 'rgba(30,28,50,.95)' : 'rgba(255,255,255,.95)',
      border: `1px solid ${t.border}`,
      borderRadius: 12, padding: '8px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 24px -8px rgba(0,0,0,.3)',
      fontSize: 13, color: t.text, zIndex: 20,
      animation: 'fadeInUp2 .3s ease',
      pointerEvents: 'none',
    }}>
      <span style={{ opacity: .7 }}>💡</span>
      <span style={{ opacity: .75 }}>Selecciona texto para <strong>subrayar</strong>, añadir <strong>notas</strong> o preguntar a <strong>Mathós</strong></span>
      <button
        onClick={() => setVisible(false)}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: t.text, opacity: .4, fontSize: 14, padding: 2,
          pointerEvents: 'auto',
        }}
      >✕</button>
    </div>
  );
}

function Label({ children, t }: { children: React.ReactNode; t: typeof TEMAS[Tema] }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, opacity: .5, textTransform: 'uppercase', letterSpacing: '.07em', color: t.text, marginBottom: 8 }}>
      {children}
    </div>
  );
}
