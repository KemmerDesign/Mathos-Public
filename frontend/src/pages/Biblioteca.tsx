import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

type CerebroMap = Record<string, number>;

interface Libro {
  id: string;
  titulo: string;
  autor: string | null;
  formato: string;
  coleccion_rag: string | null;
  color_portada: string;
  descripcion: string | null;
  porcentaje_leido: number;
  ultima_lectura: string | null;
  total_anotaciones: number;
}

const COLECCION_LABEL: Record<string, string> = {
  'nietzsche': 'Nietzsche',
  'karl-marx': 'Marx',
  'lenguajes-programacion': 'UNED',
  'geometria-euclidiana': 'UNED',
  'general': 'General',
};

const COLECCION_FILTER_COLOR: Record<string, string> = {
  'nietzsche': '#7C3AED',
  'karl-marx': '#B91C1C',
};

const PALETTE = [
  '#6A45DE', '#0D9488', '#7C3AED', '#B91C1C', '#DC2626',
  '#1D4ED8', '#059669', '#D97706', '#7C3AED', '#0891B2',
  '#BE185D', '#4338CA', '#064E3B', '#1E3A5F', '#5B21B6',
];

function formatFecha(iso: string | null): string {
  if (!iso) return 'No leído';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function PortadaLibro({ libro }: { libro: Libro }) {
  const iniciales = libro.titulo
    .split(' ')
    .filter(w => w.length > 3)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  return (
    <div style={{
      width: '100%', aspectRatio: '2/3', borderRadius: 12,
      background: `linear-gradient(145deg, ${libro.color_portada}dd, ${libro.color_portada}88)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '1.5rem 1rem',
      boxShadow: `0 20px 40px -12px ${libro.color_portada}66, inset 0 1px 0 rgba(255,255,255,.2)`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.1,
        backgroundImage: 'repeating-linear-gradient(45deg, white 0px, white 1px, transparent 1px, transparent 20px)',
      }} />
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 12,
        background: 'rgba(0,0,0,.25)', borderRadius: '12px 0 0 12px',
      }} />
      <div style={{
        fontSize: 48, fontWeight: 900, color: 'rgba(255,255,255,.25)',
        fontFamily: "'EB Garamond', Georgia, serif",
        position: 'absolute', bottom: 8, right: 12, lineHeight: 1, userSelect: 'none',
      }}>
        {iniciales}
      </div>
      <div style={{
        color: 'white', fontWeight: 700, fontSize: 14, textAlign: 'center',
        lineHeight: 1.3, fontFamily: "'EB Garamond', Georgia, serif",
        position: 'relative', zIndex: 1, textShadow: '0 1px 4px rgba(0,0,0,.4)',
      }}>
        {libro.titulo}
      </div>
      {libro.autor && (
        <div style={{
          color: 'rgba(255,255,255,.75)', fontWeight: 500, fontSize: 11,
          textAlign: 'center', marginTop: 6, position: 'relative', zIndex: 1,
        }}>
          {libro.autor}
        </div>
      )}
      <div style={{
        position: 'absolute', top: 10, right: 10,
        background: 'rgba(0,0,0,.35)', color: 'white',
        fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 20,
        letterSpacing: '.08em', textTransform: 'uppercase',
      }}>
        {libro.formato}
      </div>
    </div>
  );
}

// ── Modal de importación ──────────────────────
function ImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [autor, setAutor] = useState('');
  const [coleccion, setColeccion] = useState('');
  const [color, setColor] = useState('#6A45DE');
  const [descripcion, setDescripcion] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !['epub', 'pdf'].includes(ext)) {
      setError('Solo se aceptan archivos .epub o .pdf');
      return;
    }
    setError('');
    setArchivo(f);
    // Auto-rellenar título desde el nombre del archivo
    if (!titulo) {
      const nameWithoutExt = f.name.replace(/\.(epub|pdf)$/i, '').replace(/[_-]/g, ' ');
      setTitulo(nameWithoutExt.substring(0, 200));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!archivo) { setError('Selecciona un archivo primero'); return; }
    if (!titulo.trim()) { setError('El título es obligatorio'); return; }
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('titulo', titulo.trim());
      if (autor.trim()) fd.append('autor', autor.trim());
      if (coleccion.trim()) fd.append('coleccion_rag', coleccion.trim());
      fd.append('color_portada', color);
      if (descripcion.trim()) fd.append('descripcion', descripcion.trim());

      await api.post('/libros/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Error al importar el libro');
    }
    setUploading(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)',
        }}
      />
      {/* Modal */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', pointerEvents: 'none',
      }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'white', borderRadius: 20, width: '100%', maxWidth: 540,
            boxShadow: '0 40px 80px -16px rgba(0,0,0,.4)',
            pointerEvents: 'all', overflow: 'hidden',
            animation: 'slideUp .2s ease',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: '1px solid #F0EBE4',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1C1917', letterSpacing: '-.02em' }}>
                📚 Importar libro
              </div>
              <div style={{ fontSize: 13, color: '#78716C', marginTop: 3 }}>
                Sube un archivo .epub o .pdf desde tu ordenador
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: '#F5F0EB', border: 'none', borderRadius: 10,
                width: 36, height: 36, cursor: 'pointer', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#78716C',
              }}
            >×</button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 28px 24px', maxHeight: '70vh', overflowY: 'auto' }}>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? '#6A45DE' : archivo ? '#0D9488' : '#D6CFC7'}`,
                borderRadius: 14, padding: '28px 20px', textAlign: 'center',
                cursor: 'pointer', marginBottom: 20, transition: 'all .2s',
                background: dragging ? '#F5F0FF' : archivo ? '#F0FDF9' : '#FAFAF8',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub,.pdf"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              />
              {archivo ? (
                <>
                  <div style={{ fontSize: 32 }}>{archivo.name.endsWith('.epub') ? '📖' : '📄'}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0D9488', marginTop: 6 }}>
                    {archivo.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#78716C', marginTop: 2 }}>
                    {(archivo.size / 1024 / 1024).toFixed(1)} MB · Haz clic para cambiar
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 36 }}>📂</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#44403C', marginTop: 8 }}>
                    Arrastra tu libro aquí
                  </div>
                  <div style={{ fontSize: 12, color: '#A8A29E', marginTop: 4 }}>
                    o haz clic para seleccionar · .epub / .pdf
                  </div>
                </>
              )}
            </div>

            {/* Título */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#57534E', display: 'block', marginBottom: 5 }}>
                TÍTULO *
              </label>
              <input
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Ej: Álgebra Lineal"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1.5px solid #E7E0D8', fontSize: 14, outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#6A45DE')}
                onBlur={e => (e.target.style.borderColor = '#E7E0D8')}
              />
            </div>

            {/* Autor */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#57534E', display: 'block', marginBottom: 5 }}>
                AUTOR
              </label>
              <input
                value={autor}
                onChange={e => setAutor(e.target.value)}
                placeholder="Ej: Gilbert Strang"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1.5px solid #E7E0D8', fontSize: 14, outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#6A45DE')}
                onBlur={e => (e.target.style.borderColor = '#E7E0D8')}
              />
            </div>

            {/* Colección */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#57534E', display: 'block', marginBottom: 5 }}>
                COLECCIÓN / MATERIA
              </label>
              <input
                value={coleccion}
                onChange={e => setColeccion(e.target.value)}
                placeholder="Ej: matematicas, fisica, general…"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1.5px solid #E7E0D8', fontSize: 14, outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#6A45DE')}
                onBlur={e => (e.target.style.borderColor = '#E7E0D8')}
              />
            </div>

            {/* Color de portada */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#57534E', display: 'block', marginBottom: 8 }}>
                COLOR DE PORTADA
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PALETTE.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    style={{
                      width: 30, height: 30, borderRadius: 8, border: color === c ? '3px solid #1C1917' : '2px solid transparent',
                      background: c, cursor: 'pointer', transition: 'transform .1s',
                      transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Descripción */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#57534E', display: 'block', marginBottom: 5 }}>
                DESCRIPCIÓN <span style={{ fontWeight: 400, opacity: .6 }}>(opcional)</span>
              </label>
              <textarea
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                placeholder="Breve descripción del libro…"
                rows={2}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1.5px solid #E7E0D8', fontSize: 14, outline: 'none',
                  fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#6A45DE')}
                onBlur={e => (e.target.style.borderColor = '#E7E0D8')}
              />
            </div>

            {/* Preview de portada */}
            {titulo && (
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 70, flexShrink: 0 }}>
                  <div style={{
                    aspectRatio: '2/3', borderRadius: 8,
                    background: `linear-gradient(145deg, ${color}dd, ${color}88)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 8px 20px -6px ${color}66`,
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0, width: 8,
                      background: 'rgba(0,0,0,.25)', borderRadius: '8px 0 0 8px',
                    }} />
                    <div style={{
                      color: 'rgba(255,255,255,.9)', fontWeight: 700, fontSize: 8,
                      textAlign: 'center', padding: '0 6px', lineHeight: 1.3,
                      position: 'relative', zIndex: 1, textShadow: '0 1px 3px rgba(0,0,0,.4)',
                    }}>
                      {titulo.substring(0, 40)}
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>{titulo}</div>
                  {autor && <div style={{ fontSize: 12, color: '#78716C', marginTop: 2 }}>{autor}</div>}
                  {coleccion && (
                    <div style={{
                      display: 'inline-block', marginTop: 5, fontSize: 11, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 20, background: `${color}22`, color,
                    }}>
                      {coleccion}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                background: '#FEF2F2', border: '1px solid #FECACA',
                color: '#991B1B', fontSize: 13, fontWeight: 500,
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* Botones */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12,
                  border: '1.5px solid #E7E0D8', background: 'white',
                  cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#57534E',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={uploading || !archivo}
                style={{
                  flex: 2, padding: '12px', borderRadius: 12,
                  border: 'none', background: uploading || !archivo ? '#A8A29E' : '#6A45DE',
                  color: 'white', cursor: uploading || !archivo ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: 14, transition: 'background .2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {uploading ? (
                  <>
                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                    Importando…
                  </>
                ) : '📥 Importar libro'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Biblioteca() {
  const navigate = useNavigate();
  const [libros, setLibros] = useState<Libro[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [filtro, setFiltro] = useState<string>('todos');
  const [seedMsg, setSeedMsg] = useState('');
  const [cerebroMap, setCerebroMap] = useState<CerebroMap>({});
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');

  const cargarLibros = async () => {
    try {
      const res = await api.get('/libros');
      setLibros(res.data.libros || []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { cargarLibros(); }, []);

  useEffect(() => {
    api.get('/cerebro/sync').then(res => {
      const notas: { title: string }[] = res.data.notas || [];
      const map: CerebroMap = {};
      notas.forEach(n => {
        const match = n.title.match(/^Extracto:\s*(.+)$/);
        if (match) {
          const key = match[1].substring(0, 40).toLowerCase();
          map[key] = (map[key] || 0) + 1;
        }
      });
      setCerebroMap(map);
    }).catch(() => {});
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await api.post('/libros/seed');
      const d = res.data;
      setSeedMsg(`✅ ${d.registrados.length} registrados · ${d.ya_existian.length} ya existían · ${d.no_encontrados.length} no encontrados`);
      await cargarLibros();
    } catch (e: any) {
      setSeedMsg('❌ Error: ' + e.message);
    }
    setSeeding(false);
  };

  const colecciones = [...new Set(libros.map(l => l.coleccion_rag).filter(Boolean))] as string[];

  const librosFiltrados = libros
    .filter(l => filtro === 'todos' || l.coleccion_rag === filtro)
    .filter(l => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return l.titulo.toLowerCase().includes(q) || (l.autor || '').toLowerCase().includes(q);
    });

  const enCurso = libros.filter(l => l.porcentaje_leido > 0 && l.porcentaje_leido < 100);

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--sepia-bg)' }}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
      `}</style>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 2rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{
              fontSize: 32, fontWeight: 800, fontFamily: "'EB Garamond', Georgia, serif",
              color: 'var(--sepia-text)', margin: 0, letterSpacing: '-.02em',
            }}>
              Biblioteca
            </h1>
            <p style={{ color: 'var(--sepia-text-secondary)', margin: '4px 0 0', fontSize: 15 }}>
              {libros.length} {libros.length === 1 ? 'libro' : 'libros'} · {libros.reduce((a, b) => a + b.total_anotaciones, 0)} anotaciones
            </p>
          </div>

          {/* Acciones del header */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Búsqueda */}
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 14, color: '#A8A29E', pointerEvents: 'none',
              }}>🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar libro o autor…"
                style={{
                  paddingLeft: 36, paddingRight: 14, paddingTop: 9, paddingBottom: 9,
                  borderRadius: 10, border: '1.5px solid #E7E0D8',
                  background: 'white', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                  width: 200, transition: 'border-color .15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#6A45DE')}
                onBlur={e => (e.target.style.borderColor = '#E7E0D8')}
              />
            </div>

            {/* Importar (botón principal) */}
            <button
              id="btn-importar-libro"
              onClick={() => setShowImport(true)}
              style={{
                padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: '#6A45DE', color: 'white', fontWeight: 700, fontSize: 14,
                display: 'flex', alignItems: 'center', gap: 8, transition: 'opacity .2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              📥 Importar libro
            </button>

            {/* Catálogo de filosofía */}
            <button
              onClick={handleSeed}
              disabled={seeding}
              style={{
                padding: '10px 16px', borderRadius: 12,
                border: '1.5px solid #E7E0D8', cursor: seeding ? 'not-allowed' : 'pointer',
                background: 'white', color: '#57534E', fontWeight: 600, fontSize: 13,
                opacity: seeding ? .6 : 1, transition: 'all .2s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => { if (!seeding) e.currentTarget.style.background = '#F5F0EB'; }}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              {seeding ? '⟳ Importando…' : '📜 Catálogo de filosofía'}
            </button>
          </div>
        </div>

        {seedMsg && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: '1.5rem',
            background: seedMsg.startsWith('✅') ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${seedMsg.startsWith('✅') ? '#BBF7D0' : '#FECACA'}`,
            color: seedMsg.startsWith('✅') ? '#166534' : '#991B1B',
            fontSize: 14, fontWeight: 500,
          }}>
            {seedMsg}
          </div>
        )}

        {/* Libros en curso */}
        {enCurso.length > 0 && (
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sepia-text)', marginBottom: '1rem' }}>
              En curso
            </h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {enCurso.map(libro => (
                <div
                  key={libro.id}
                  onClick={() => navigate(`/lector/${libro.id}`)}
                  style={{
                    display: 'flex', gap: 14, alignItems: 'center',
                    background: 'white', borderRadius: 14, padding: '12px 16px',
                    border: '1px solid var(--sepia-border)', cursor: 'pointer',
                    width: 320, transition: 'box-shadow .2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(60,40,120,.18)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div style={{
                    width: 48, height: 72, borderRadius: 8, flexShrink: 0,
                    background: `linear-gradient(145deg, ${libro.color_portada}, ${libro.color_portada}88)`,
                    boxShadow: `0 8px 16px -6px ${libro.color_portada}66`,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--sepia-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {libro.titulo}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sepia-text-secondary)', marginTop: 2 }}>
                      {libro.autor}
                    </div>
                    <div style={{ marginTop: 8, background: '#E8E0D8', borderRadius: 4, height: 5 }}>
                      <div style={{
                        height: '100%', borderRadius: 4, transition: 'width .4s',
                        background: libro.color_portada, width: `${libro.porcentaje_leido}%`,
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--sepia-text-secondary)', marginTop: 4 }}>
                      {Math.round(libro.porcentaje_leido)}% · {formatFecha(libro.ultima_lectura)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {['todos', ...colecciones].map(col => (
            <button
              key={col}
              onClick={() => setFiltro(col)}
              style={{
                padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13, transition: 'all .15s',
                background: filtro === col ? (COLECCION_FILTER_COLOR[col] || '#6A45DE') : '#EDE8E0',
                color: filtro === col ? 'white' : 'var(--sepia-text)',
              }}
            >
              {col === 'todos' ? 'Todos' : (COLECCION_LABEL[col] || col)}
              <span style={{ marginLeft: 6, opacity: .7, fontSize: 11 }}>
                {col === 'todos' ? libros.length : libros.filter(l => l.coleccion_rag === col).length}
              </span>
            </button>
          ))}
        </div>

        {/* Grid de libros */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--sepia-text-secondary)' }}>
            Cargando biblioteca…
          </div>
        ) : librosFiltrados.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '4rem',
            color: 'var(--sepia-text-secondary)',
            border: '2px dashed var(--sepia-border)', borderRadius: 20,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
              {search ? 'Sin resultados' : 'Biblioteca vacía'}
            </div>
            <div style={{ fontSize: 14 }}>
              {search ? `No hay libros que coincidan con "${search}"` : 'Importa tu primer libro con el botón de arriba.'}
            </div>
            {!search && (
              <button
                onClick={() => setShowImport(true)}
                style={{
                  marginTop: 20, padding: '10px 24px', borderRadius: 12,
                  border: 'none', background: '#6A45DE', color: 'white',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}
              >
                📥 Importar mi primer libro
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '1.5rem',
          }}>
            {librosFiltrados.map(libro => (
              <div
                key={libro.id}
                onClick={() => navigate(`/lector/${libro.id}`)}
                style={{ cursor: 'pointer' }}
                title={libro.titulo}
              >
                <div style={{ position: 'relative' }}>
                  <PortadaLibro libro={libro} />
                  {libro.porcentaje_leido > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: 4, background: 'rgba(0,0,0,.3)', borderRadius: '0 0 12px 12px',
                    }}>
                      <div style={{
                        height: '100%', background: 'rgba(255,255,255,.8)',
                        borderRadius: '0 0 0 12px', width: `${libro.porcentaje_leido}%`,
                      }} />
                    </div>
                  )}
                  {libro.total_anotaciones > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 10, left: 18,
                      background: 'rgba(0,0,0,.5)', color: 'white',
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                    }}>
                      🖊️ {libro.total_anotaciones}
                    </div>
                  )}
                  {(() => {
                    const key = libro.titulo.substring(0, 40).toLowerCase();
                    const count = cerebroMap[key] || 0;
                    return count > 0 ? (
                      <div style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'rgba(106,69,222,.85)', color: 'white',
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        backdropFilter: 'blur(4px)',
                      }}>
                        🧠 {count}
                      </div>
                    ) : null;
                  })()}
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{
                    fontWeight: 700, fontSize: 13, color: 'var(--sepia-text)',
                    lineHeight: 1.3, display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {libro.titulo}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--sepia-text-secondary)', marginTop: 3 }}>
                    {libro.autor?.split(' ').slice(-1)[0]}
                  </div>
                  {libro.ultima_lectura && (
                    <div style={{ fontSize: 11, color: 'var(--sepia-text-secondary)', marginTop: 2, opacity: .7 }}>
                      {formatFecha(libro.ultima_lectura)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de importación */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => { cargarLibros(); setSeedMsg('✅ Libro importado correctamente'); }}
        />
      )}
    </div>
  );
}
