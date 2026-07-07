import { useNavigate } from "react-router-dom";
import { useStore } from "@/services/store";
import { useEffect, useState } from "react";
import IkaroAvatar from "@/components/IkaroAvatar";
import AgendaHoy from "@/components/AgendaHoy";

const glyphMap: Record<string, { glyph: string; color: string; tint: string }> = {
  'Cálculo':       { glyph: '∫',   color: '#6A45DE', tint: '#EFEAFD' },
  'Programación':  { glyph: '{ }', color: '#D8587F', tint: '#FCEDF3' },
  'Python':        { glyph: '{ }', color: '#D8587F', tint: '#FCEDF3' },
  'Geometría':     { glyph: 'Φ',   color: '#D38A2C', tint: '#FBEFDD' },
  'Ética':         { glyph: 'Φ',   color: '#D38A2C', tint: '#FBEFDD' },
  'Física':        { glyph: 'λ',   color: '#2E9E63', tint: '#E8F4ED' },
  'Oracle':        { glyph: '⬡',   color: '#f97316', tint: '#FEF0E6' },
  'SQL':           { glyph: '⬡',   color: '#f97316', tint: '#FEF0E6' },
  'Lenguajes':     { glyph: 'λ',   color: '#6A45DE', tint: '#EFEAFD' },
};

function getVisual(nombre: string) {
  const entry = Object.entries(glyphMap).find(([k]) => nombre.includes(k));
  return entry?.[1] || { glyph: nombre.charAt(0), color: '#6A45DE', tint: '#EFEAFD' };
}

function getHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function Landing() {
  const navigate = useNavigate();
  const materias = useStore((s) => s.materias);
  const fetchMaterias = useStore((s) => s.fetchMaterias);
  const setSelectedMateria = useStore((s) => s.setSelectedMateria);
  const setTemaActual = useStore((s) => s.setTemaActual);
  type HeatCell = { date: string; active: boolean; future: boolean };
  const [rachaDias, setRachaDias] = useState<number | null>(null);
  const [heatmap, setHeatmap] = useState<HeatCell[]>([]);

  useEffect(() => {
    if (materias.length === 0) fetchMaterias();
  }, [fetchMaterias, materias.length]);

  useEffect(() => {
    fetch('/api/v1/agenda/hoy')
      .then(r => r.json())
      .then(d => {
        setRachaDias(d.racha_dias ?? 0);
        setHeatmap(d.heatmap_28d ?? []);
      })
      .catch(() => setRachaDias(0));
  }, []);

  function entrarMateria(materiaId: string) {
    setSelectedMateria(materiaId);
    setTemaActual(null);
    navigate(`/materia/${materiaId}`);
  }

  // Stats derived from materias
  const materiasActivas = materias.length;
  const temasCompletados = materias.reduce((acc, m) =>
    acc + (m.temas?.filter(t => t.nivel === 'dominado').length || 0), 0);

  // Find the last active materia
  const ultimaMateria = materias.find(m => m.progreso > 0 && m.progreso < 100) || materias[0];

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar" style={{ background: 'var(--sepia-bg)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '36px 32px 64px' }}>

        {/* ── Hero Banner ── */}
        <section style={{
          display: 'flex', alignItems: 'center', gap: 30,
          background: 'linear-gradient(120deg, #6A45DE 0%, #8557E6 52%, #B85C97 130%)',
          borderRadius: 28, padding: '30px 34px', color: '#fff',
          boxShadow: '0 24px 48px -28px rgba(106,69,222,.7)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* decorative circles */}
          <div style={{ position:'absolute', right:-40, top:-60, width:260, height:260, borderRadius:'50%', background:'rgba(255,255,255,.08)' }}/>
          <div style={{ position:'absolute', right:120, bottom:-90, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,.06)' }}/>

          <div style={{ position:'relative', flex:'0 0 auto', padding:6 }}>
            <IkaroAvatar size={78} />
          </div>

          <div style={{ position:'relative', flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, opacity:.82, letterSpacing:'.02em' }}>
              {getHour()}
            </div>
            <h1 style={{ margin:'4px 0 8px', fontSize:28, fontWeight:800, letterSpacing:'-.02em', lineHeight:1.2 }}>
              {ultimaMateria
                ? `Seguimos con ${ultimaMateria.nombre.split(' ')[0]}`
                : 'Bienvenido a Mathós'}
            </h1>
            <p style={{ margin:0, fontSize:15, opacity:.9, maxWidth:520, lineHeight:1.5 }}>
              {ultimaMateria
                ? <>Ikaro ya tiene el temario listo para continuar desde donde lo dejaste.</>
                : <>Sube una materia o curso y Ikaro arma el temario por ti.</>}
            </p>
          </div>

          {ultimaMateria && (
            <button
              onClick={() => entrarMateria(ultimaMateria.id)}
              className="hover:-translate-y-[2px]"
              style={{
                position:'relative', alignSelf:'flex-end',
                background:'#fff', color:'#6A45DE', border:'none',
                borderRadius:14, padding:'14px 22px',
                font:'inherit', fontWeight:700, fontSize:15, cursor:'pointer',
                boxShadow:'0 10px 20px -10px rgba(0,0,0,.5)',
                display:'flex', alignItems:'center', gap:9, whiteSpace:'nowrap',
                transition:'transform .15s',
                flexShrink:0,
              }}
            >
              Continuar estudiando
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            </button>
          )}
        </section>

        {/* ── Stats ── */}
        <section style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginTop:18 }}>
          {/* Materias activas */}
          <div style={{ background:'#fff', border:'1px solid #EBE3D5', borderRadius:18, padding:'18px 20px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:13, background:'#EFEAFD', color:'#6A45DE', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:23, fontWeight:800, lineHeight:1 }}>{materiasActivas}</div>
              <div style={{ fontSize:13, color:'#8A7F70', fontWeight:500, marginTop:3 }}>Materias activas</div>
            </div>
          </div>
          {/* Temas completados */}
          <div style={{ background:'#fff', border:'1px solid #EBE3D5', borderRadius:18, padding:'18px 20px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:13, background:'#E8F4ED', color:'#2E9E63', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:23, fontWeight:800, lineHeight:1 }}>{temasCompletados}</div>
              <div style={{ fontSize:13, color:'#8A7F70', fontWeight:500, marginTop:3 }}>Temas completados</div>
            </div>
          </div>
          {/* Materias en curso */}
          <div style={{ background:'#fff', border:'1px solid #EBE3D5', borderRadius:18, padding:'18px 20px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:13, background:'#FBEFDD', color:'#D38A2C', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                <polyline points="16 7 22 7 22 13"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:23, fontWeight:800, lineHeight:1 }}>
                {materias.filter(m => m.progreso > 0).length}
              </div>
              <div style={{ fontSize:13, color:'#8A7F70', fontWeight:500, marginTop:3 }}>Materias en curso</div>
            </div>
          </div>
          {/* Racha de estudio */}
          <div style={{ background:'#fff', border:'1px solid #EBE3D5', borderRadius:18, padding:'18px 20px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:13, background:'#FEF2F2', color:'#DC2626', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:22 }}>
              🔥
            </div>
            <div>
              <div style={{ fontSize:23, fontWeight:800, lineHeight:1 }}>
                {rachaDias === null ? '—' : rachaDias}
              </div>
              <div style={{ fontSize:13, color:'#8A7F70', fontWeight:500, marginTop:3 }}>
                {rachaDias === 1 ? 'día de racha' : 'días de racha'}
              </div>
            </div>
          </div>
        </section>

        {/* ── Heatmap semanal ── */}
        {heatmap.length > 0 && (() => {
          const today = new Date().toISOString().slice(0, 10);
          const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
          return (
            <div style={{
              background: '#fff', border: '1px solid #EBE3D5', borderRadius: 18,
              padding: '18px 22px', marginTop: 16,
              display: 'flex', alignItems: 'center', gap: 28,
            }}>
              {/* Left: icon + label */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, flexShrink: 0, minWidth: 130 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22 }}>🔥</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#322B23' }}>Racha de estudio</span>
                </div>
                <div style={{ fontSize: 13, color: '#8A7F70', fontWeight: 500, paddingLeft: 30 }}>
                  {rachaDias === null ? '…' : rachaDias === 0 ? 'Sin racha activa' : `${rachaDias} ${rachaDias === 1 ? 'día' : 'días'} consecutivos`}
                </div>
              </div>

              {/* Right: grid */}
              <div style={{ flex: 1 }}>
                {/* Day labels */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 5 }}>
                  {DAY_LABELS.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#B0A49A', letterSpacing: '.04em' }}>
                      {d}
                    </div>
                  ))}
                </div>
                {/* 4 × 7 cells */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                  {heatmap.map((cell) => {
                    const isToday = cell.date === today;
                    const bg = cell.future ? '#F5F2ED' : cell.active ? '#6A45DE' : '#ECE4D7';
                    return (
                      <div
                        key={cell.date}
                        title={cell.date}
                        style={{
                          height: 13, borderRadius: 4,
                          background: bg,
                          boxShadow: isToday ? '0 0 0 2px #6A45DE' : 'none',
                          opacity: cell.future ? 0.35 : 1,
                          transition: 'background .2s',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Agenda del día ── */}
        <AgendaHoy />

        {/* ── Mis materias header ── */}
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', margin:'34px 0 16px' }}>
          <h2 style={{ margin:0, fontSize:19, fontWeight:800, letterSpacing:'-.01em' }}>Mis materias</h2>
          <span style={{ fontSize:13, color:'#8A7F70', fontWeight:500 }}>
            Sube una materia o curso y Mathós arma el temario por ti
          </span>
        </div>

        {/* ── Materia grid ── */}
        <section style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18 }}>
          {materias.map((materia) => {
            const { glyph, color, tint } = getVisual(materia.nombre);
            const ultimoTema = materia.temas?.find(t => t.nivel === 'en_curso' || t.nivel === 'practicando')
              || materia.temas?.[0];

            return (
              <button
                key={materia.id}
                onClick={() => entrarMateria(materia.id)}
                className="group hover:-translate-y-[3px] hover:shadow-[0_18px_34px_-22px_rgba(60,45,30,.5)]"
                style={{
                  background:'#fff', border:'1px solid #EBE3D5', borderRadius:20,
                  padding:20, cursor:'pointer', display:'flex', flexDirection:'column',
                  textAlign:'left', font:'inherit',
                  transition:'transform .15s, box-shadow .15s',
                }}
              >
                {/* icon + name */}
                <div style={{ display:'flex', alignItems:'center', gap:13 }}>
                  <div style={{
                    width:50, height:50, borderRadius:15, display:'flex', alignItems:'center',
                    justifyContent:'center', fontSize:20, fontWeight:700,
                    background: tint, color, flexShrink:0,
                    fontFamily:"'JetBrains Mono', monospace",
                  }}>
                    {glyph}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:16, fontWeight:700, letterSpacing:'-.01em', lineHeight:1.2, color:'#221D17' }}>
                      {materia.nombre}
                    </div>
                    <div style={{ fontSize:12.5, color:'#9A8F80', fontWeight:500, marginTop:2 }}>
                      {materia.categoria === 'certificacion' ? 'Certificación' : materia.categoria === 'filosofia' ? 'Filosofía' : 'UNED'} · {materia.temas?.length || 0} temas
                    </div>
                  </div>
                </div>

                {/* progress */}
                <div style={{ marginTop:18 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:600, color:'#8A7F70', marginBottom:7 }}>
                    <span>{materia.progreso === 0 ? 'Sin empezar' : 'Progreso'}</span>
                    <span style={{ color }}>{materia.progreso}%</span>
                  </div>
                  <div style={{ height:8, borderRadius:99, background:'#F0EAE0', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${materia.progreso}%`, borderRadius:99, background:color, transition:'width .6s' }} />
                  </div>
                </div>

                {/* next topic */}
                {ultimoTema && (
                  <div style={{ marginTop:16, paddingTop:14, borderTop:'1px dashed #EBE3D5', display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0 }} />
                    <span style={{ fontSize:12.5, color:'#6B6155', fontWeight:500 }}>
                      Siguiente: <strong style={{ color:'#221D17' }}>{ultimoTema.nombre}</strong>
                    </span>
                  </div>
                )}
              </button>
            );
          })}

          {/* Subir materia — próximamente */}
          <div
            className="border-2 border-dashed border-[#D8CDBC] text-[#8A7F70]"
            style={{
              borderRadius:20, padding:20,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              gap:12, cursor:'default', minHeight:190, position:'relative',
            }}
          >
            <div style={{ position:'absolute', top:12, right:12, background:'#F0EAE0', color:'#8A7F70', fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:99, letterSpacing:'.04em' }}>
              Próximamente
            </div>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'#EFE8DC', display:'flex', alignItems:'center', justifyContent:'center', opacity:.5 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <div style={{ fontSize:14.5, fontWeight:700 }}>Gestión de materias</div>
            <div style={{ fontSize:12, textAlign:'center', maxWidth:170, lineHeight:1.45, opacity:.7 }}>
              Subida y organización automática de temarios
            </div>
          </div>

          {/* Loading state */}
          {materias.length === 0 && (
            <div style={{ border:'1px dashed #D8CDBC', borderRadius:20, padding:20, display:'flex', alignItems:'center', justifyContent:'center', minHeight:190 }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
                <div style={{ width:12, height:12, borderRadius:'50%', background:'#D8CDBC', animation:'teoBob 1s ease-in-out infinite' }} />
                <span style={{ fontSize:13, color:'#9A8F80' }}>Cargando materias…</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
