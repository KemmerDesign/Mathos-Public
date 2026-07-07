import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import FeynmanTrainer from './pages/FeynmanTrainer';
import SimulacroExam from './pages/SimulacroExam';
import SRSReview from './pages/SRSReview';
import LibroErrores from './pages/LibroErrores';
import Biblioteca from './pages/Biblioteca';
import Lector from './pages/Lector';
import GeoMathos from './pages/GeoMathos';
import Cerebro from './pages/Cerebro';
import ChatSidebar from './components/ChatSidebar';
import TemarioSidebar from './components/TemarioSidebar';
import { useStore } from './services/store';
import IkaroAvatar from './components/IkaroAvatar';
import { getStoredToken } from './services/api';
import { useTheme } from './services/ThemeContext';

// ─── Top Navigation Bar ───────────────────────────────────────────────────────
function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const materias = useStore((s) => s.materias);
  const selectedMateriaId = useStore((s) => s.selectedMateriaId);
  const { theme, cycleTheme } = useTheme();

  // Contexto de estudio: cualquier ruta que depende de una materia activa
  const isStudy      = location.pathname.startsWith('/materia/');
  const isStudyCtx   = isStudy
    || location.pathname.startsWith('/srs/')
    || location.pathname.startsWith('/errores/')
    || location.pathname.startsWith('/simulacro/')
    || location.pathname === '/feynman';

  const materiaActiva = materias.find((m) => m.id === selectedMateriaId);

  // Colores activos por sección contextual
  const srsActive     = location.pathname.startsWith('/srs');
  const erroresActive = location.pathname.startsWith('/errores');
  const simActive     = location.pathname.startsWith('/simulacro');

  return (
    <header
      className="flex-shrink-0 flex items-center gap-4 px-6 z-30 border-b border-[var(--sepia-border)]"
      style={{
        height: 64,
        background: 'rgba(255,253,250,.88)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2.5 cursor-pointer bg-transparent border-none shrink-0"
      >
        <div style={{
          position: 'relative', width: 40, height: 40, borderRadius: 13,
          background: 'radial-gradient(125% 115% at 30% 22%, #9A7CF4 0%, #6A45DE 52%, #B85C97 128%)',
          boxShadow: 'inset 0 2px 4px rgba(255,255,255,.5), inset 0 -4px 7px rgba(50,22,100,.4), 0 9px 18px -7px rgba(106,69,222,.8)',
          flexShrink: 0, overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 4, left: 6, width: 22, height: 15, borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 35%, rgba(255,255,255,.7), rgba(255,255,255,0) 70%)',
          }} />
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ position: 'absolute', inset: 0 }}>
            <path d="M8 23.5 L19 20.5 Q21.2 19.8 22 17.2 L31 8 L27.8 19 Q31.6 21.6 30 26.6 Q27.4 31.6 21 30 L18 24.5 L10.2 24.5 Q6.6 24 8 23.5 Z" fill="#fff"/>
            <path d="M24 14 L29.6 8.8" stroke="#7FD8FF" strokeWidth="1.7" strokeLinecap="round"/>
            <circle cx="19.6" cy="19.6" r="2.5" fill="#2A9FE6"/>
            <circle cx="19.6" cy="19.6" r="1.1" fill="#EAFBFF"/>
          </svg>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          className="hidden sm:block">
          Math<span style={{ color: '#6A45DE' }}>ó</span>s
        </div>
      </button>

      {/* ── Nav global (siempre visible) ── */}
      <nav className="flex items-center gap-0.5">
        <Link
          to="/"
          className="px-3.5 py-2 rounded-[10px] text-[14px] font-semibold transition-colors"
          style={{
            background: location.pathname === '/' ? '#EFEAFD' : 'transparent',
            color: location.pathname === '/' ? '#6A45DE' : '#6B6155',
          }}
        >
          Inicio
        </Link>
        <Link
          to="/biblioteca"
          className="px-3.5 py-2 rounded-[10px] text-[14px] font-semibold transition-colors hidden sm:flex items-center gap-1.5"
          style={{
            color: location.pathname.startsWith('/biblioteca') || location.pathname.startsWith('/lector') ? '#92400E' : '#6B6155',
            background: location.pathname.startsWith('/biblioteca') || location.pathname.startsWith('/lector') ? '#FEF3C7' : 'transparent',
          }}
        >
          📚 <span className="hidden md:inline">Biblioteca</span>
        </Link>
        <Link
          to="/geo"
          className="px-3.5 py-2 rounded-[10px] text-[14px] font-semibold transition-colors hidden sm:flex items-center gap-1.5"
          style={{
            color: location.pathname === '/geo' ? '#6A45DE' : '#6B6155',
            background: location.pathname === '/geo' ? '#EFEAFD' : 'transparent',
          }}
        >
          📐 <span className="hidden md:inline">Geo</span>
        </Link>
        <Link
          to="/cerebro"
          className="px-3.5 py-2 rounded-[10px] text-[14px] font-semibold transition-colors hidden sm:flex items-center gap-1.5"
          style={{
            color: location.pathname === '/cerebro' ? '#0D9488' : '#6B6155',
            background: location.pathname === '/cerebro' ? '#F0FDFA' : 'transparent',
          }}
        >
          🧠 <span className="hidden md:inline">Cerebro</span>
        </Link>
      </nav>

      {/* Theme toggle */}
      <button
        onClick={cycleTheme}
        className="ml-auto px-2.5 py-2 rounded-[10px] text-[15px] cursor-pointer border-none bg-transparent transition-colors"
        style={{ color: 'var(--sepia-text-secondary)' }}
        title={`Tema: ${theme}`}
      >
        {theme === 'sepia' ? '🌅' : theme === 'light' ? '☀️' : '🌙'}
      </button>

      {/* ── Separador + contexto de materia (solo cuando hay materia activa) ── */}
      {isStudyCtx && materiaActiva && (
        <>
          <div className="w-px h-5 bg-[var(--sepia-border)] shrink-0" />
          <nav className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
            {/* Breadcrumb: nombre de la materia */}
            <Link
              to={`/materia/${materiaActiva.id}`}
              className="px-3 py-2 rounded-[10px] text-[13px] font-bold transition-colors flex items-center gap-1.5 shrink-0"
              style={{
                background: isStudy ? '#EFEAFD' : 'transparent',
                color: isStudy ? '#6A45DE' : '#6B6155',
                maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
              {materiaActiva.nombre.split(' ').slice(0, 3).join(' ')}
            </Link>

            <Link
              to={`/srs/${materiaActiva.id}`}
              className="px-3 py-2 rounded-[10px] text-[13px] font-semibold transition-colors flex items-center gap-1.5 shrink-0"
              style={{
                color: srsActive ? '#7C3AED' : '#6B6155',
                background: srsActive ? '#F3EEFE' : 'transparent',
              }}
            >
              🗂️ <span className="hidden lg:inline">Repaso</span>
            </Link>

            <Link
              to={`/errores/${materiaActiva.id}`}
              className="px-3 py-2 rounded-[10px] text-[13px] font-semibold transition-colors flex items-center gap-1.5 shrink-0"
              style={{
                color: erroresActive ? '#DC2626' : '#6B6155',
                background: erroresActive ? '#FEF2F2' : 'transparent',
              }}
            >
              📖 <span className="hidden lg:inline">Errores</span>
            </Link>

            <Link
              to={`/simulacro/${materiaActiva.id}`}
              className="px-3 py-2 rounded-[10px] text-[13px] font-semibold transition-colors flex items-center gap-1.5 shrink-0"
              style={{
                color: simActive ? '#059669' : '#6B6155',
                background: simActive ? '#ECFDF5' : 'transparent',
              }}
            >
              ⚡ <span className="hidden lg:inline">Simulacro</span>
            </Link>
          </nav>
        </>
      )}

      {/* Separador global + herramientas (siempre visible en SM pero oculto en XS) */}
      {!isStudyCtx && (
        <nav className="sm:hidden flex items-center gap-0.5">
          <Link to="/biblioteca" className="px-3 py-2 rounded-[10px] text-[14px] font-semibold" style={{ color: '#6B6155' }}>📚</Link>
          <Link to="/geo" className="px-3 py-2 rounded-[10px] text-[14px] font-semibold" style={{ color: '#6B6155' }}>📐</Link>
        </nav>
      )}

      <div className="flex-1" />


      {/* User avatar — primeras letras de la primera materia inscrita o "M" */}
      <div
        className="flex items-center gap-2 pl-3 pr-1 py-1 bg-white border border-[var(--sepia-border)] rounded-full"
      >
        <span className="text-[13px] font-semibold text-[var(--sepia-text)] hidden sm:block">
          {materias[0]?.nombre?.split(' ')[0] || 'Mathós'}
        </span>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
          style={{ background: 'linear-gradient(140deg,#E07BA0,#D8587F)' }}
        >
          M
        </div>
      </div>
    </header>
  );
}

// ─── Hook para ancho de ventana ───────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}

// ─── Study layout (materia/:id) con toggle A↔C + responsive tablet ───────────
function StudyLayout() {
  const layoutEstudio = useStore((s) => s.layoutEstudio);
  const setLayoutEstudio = useStore((s) => s.setLayoutEstudio);
  const [teoFabOpen, setTeoFabOpen] = useState(false);
  const [temarioOpen, setTemarioOpen] = useState(false);
  const isTablet = useWindowWidth() < 1024;

  // Ikaro: en tablet siempre FAB independientemente de layoutEstudio
  const useFab = isTablet || layoutEstudio === 'C';

  return (
    <div className="flex flex-1 min-h-0 relative overflow-hidden" style={{ height: '100%' }}>

      {/* TemarioSidebar — inline en desktop, drawer en tablet */}
      {isTablet ? (
        <>
          {/* Backdrop */}
          {temarioOpen && (
            <div
              style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.45)' }}
              onClick={() => setTemarioOpen(false)}
            />
          )}
          {/* Drawer */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 35,
            transform: temarioOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
            willChange: 'transform',
          }}>
            <TemarioSidebar drawerMode onClose={() => setTemarioOpen(false)} />
          </div>
        </>
      ) : (
        <TemarioSidebar />
      )}

      <main className="flex-1 h-full overflow-hidden relative">
        <Dashboard />
      </main>

      {/* Ikaro — columna solo en desktop layout A */}
      {!useFab && <ChatSidebar />}

      {/* Ikaro FAB — tablet siempre, desktop layout C */}
      {useFab && !teoFabOpen && (
        <button
          onClick={() => setTeoFabOpen(true)}
          className="absolute bottom-6 right-6 z-20 flex items-center gap-3 pl-2 pr-5 py-2 bg-white border border-[var(--sepia-border)] rounded-full cursor-pointer animate-fab-in"
          style={{ boxShadow: '0 16px 34px -16px rgba(60,40,120,.6)' }}
        >
          <IkaroAvatar size={38} />
          <div className="text-left">
            <div className="text-[13.5px] font-bold text-[var(--sepia-text)]">Pregúntale a Ikaro</div>
            <div className="text-[11.5px] font-semibold" style={{ color: '#2E9E63' }}>
              en línea · modo Normal
            </div>
          </div>
        </button>
      )}

      {useFab && teoFabOpen && (
        <div
          className="absolute bottom-6 right-6 z-20 flex flex-col overflow-hidden bg-white border border-[var(--sepia-border)] rounded-[22px] animate-fab-in"
          style={{
            width: 360, maxHeight: 'calc(100% - 44px)',
            boxShadow: '0 28px 60px -24px rgba(40,20,80,.6)',
          }}
        >
          <ChatSidebar floating onClose={() => setTeoFabOpen(false)} />
        </div>
      )}

      {/* Controles inferiores */}
      {isTablet ? (
        /* Tablet: botón para abrir el drawer del temario */
        <button
          onClick={() => setTemarioOpen(true)}
          className="absolute bottom-5 left-5 z-20 flex items-center gap-2 rounded-[13px] border border-[var(--sepia-border)] px-3 py-2 cursor-pointer"
          style={{ background: 'rgba(255,253,250,.9)', backdropFilter: 'blur(8px)', boxShadow: '0 10px 24px -16px rgba(60,40,30,.5)', fontSize: 13, fontWeight: 700, color: 'var(--sepia-text)' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
          Temario
        </button>
      ) : (
        /* Desktop: layout toggle */
        <div
          className="absolute bottom-5 left-5 z-10 flex items-center gap-2.5 rounded-[13px] border border-[var(--sepia-border)] px-3 py-1.5"
          style={{ background: 'rgba(255,253,250,.9)', backdropFilter: 'blur(8px)', boxShadow: '0 10px 24px -16px rgba(60,40,30,.5)' }}
        >
          <span className="text-[11.5px] font-bold text-[var(--sepia-text-secondary)]">Diseño</span>
          <div className="flex bg-[#F0EAE0] rounded-[9px] p-[2px]">
            {(['A', 'C'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLayoutEstudio(l)}
                className="border-none text-[11.5px] font-bold px-2.5 py-1.5 rounded-[7px] cursor-pointer transition-all"
                style={{
                  background: layoutEstudio === l ? '#fff' : 'transparent',
                  color: layoutEstudio === l ? '#6A45DE' : '#8A7F70',
                  boxShadow: layoutEstudio === l ? '0 2px 5px -2px rgba(60,45,30,.3)' : 'none',
                }}
              >
                {l === 'A' ? 'A · Clásico' : 'C · Enfocado'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Auth pages: no TopBar, no sidebar ─────────────────────────────────────
const AUTH_ROUTES = ['/login', '/register'];

// ─── Auth guard component ──────────────────────────────────────────────────
function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = getStoredToken();

  // Allow access to auth pages without token
  if (AUTH_ROUTES.includes(location.pathname)) {
    return <>{children}</>;
  }

  // Allow access to landing page without token
  if (location.pathname === '/') {
    return <>{children}</>;
  }

  // If no token, redirect to login
  if (!token) {
    return (
      <div
        className="flex flex-col w-full h-screen overflow-hidden"
        style={{ background: 'var(--sepia-bg)', color: 'var(--sepia-text)' }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--sepia-text)' }}>
              Sesión requerida
            </div>
            <Link
              to="/login"
              style={{
                color: '#6A45DE',
                fontWeight: 700,
                fontSize: 15,
                textDecoration: 'none',
              }}
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ─── App root ─────────────────────────────────────────────────────────────────
function AppInner() {
  const location = useLocation();
  const isStudy = location.pathname.startsWith('/materia/');
  const isSimulacro = location.pathname.startsWith('/simulacro/');
  const isLector = location.pathname.startsWith('/lector/');
  const isAuthPage = AUTH_ROUTES.includes(location.pathname);
  const isLanding = location.pathname === '/';
  const isEmbed = location.search.includes('embed=true');

  return (
    <AuthGuard>
      <div
        className="flex flex-col w-full h-screen overflow-hidden"
        style={{ background: 'var(--sepia-bg)', color: 'var(--sepia-text)' }}
      >
        {/* Only show TopBar for authenticated pages (not auth pages, not landing) */}
        {!isSimulacro && !isLector && !isAuthPage && !isLanding && !isEmbed && <TopBar />}

        <div className="flex flex-1 min-h-0" style={{
          height: isSimulacro || isLector || isAuthPage || isLanding ? '100vh' : 'calc(100vh - 64px)',
        }}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/materia/:materiaId" element={<StudyLayout />} />
            <Route path="/feynman" element={<FeynmanTrainer />} />
            <Route path="/simulacro/:materiaId" element={<SimulacroExam />} />
            <Route path="/srs/:materiaId" element={<SRSReview />} />
            <Route path="/errores/:materiaId" element={<LibroErrores />} />
            <Route path="/biblioteca" element={<Biblioteca />} />
            <Route path="/lector/:libroId" element={<Lector />} />
            <Route path="/geo" element={<GeoMathos />} />
            <Route path="/cerebro" element={<Cerebro />} />
          </Routes>
        </div>
      </div>
    </AuthGuard>
  );
}

export default function App() {
  return (
    <Router>
      <AppInner />
    </Router>
  );
}
