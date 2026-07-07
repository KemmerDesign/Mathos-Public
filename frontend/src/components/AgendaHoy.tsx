import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";

interface SrsItem   { materia_id: string; materia_nombre: string; cantidad: number }
interface TemaItem  { tema_id: string; materia_id: string; tema_nombre: string; materia_nombre: string; nivel: string; puntuacion_maxima: number }
interface ErrorItem { materia_id: string; tema_id: string | null; pregunta_texto: string; veces_fallada: number; materia_nombre: string }

interface Agenda {
  total_srs_vencidas: number;
  srs_vencidas: SrsItem[];
  temas_pendientes: TemaItem[];
  errores_frecuentes: ErrorItem[];
}

const NIVEL_LABEL: Record<string, string> = {
  no_iniciado: "Sin iniciar",
  en_curso:    "En curso",
  practicando: "Practicando",
};

const NIVEL_COLOR: Record<string, string> = {
  no_iniciado: "#94A3B8",
  en_curso:    "#F59E0B",
  practicando: "#3B82F6",
};

export default function AgendaHoy() {
  const navigate = useNavigate();
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/agenda/hoy")
      .then(r => setAgenda(r.data))
      .catch(() => setAgenda(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <section style={{ marginTop: 28 }}>
      <div style={{ height: 120, borderRadius: 18, background: "#F5F0E8", border: "1px solid #EBE3D5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 13, color: "#8A7F70" }}>Cargando agenda…</span>
      </div>
    </section>
  );

  if (!agenda) return null;

  const { total_srs_vencidas, srs_vencidas, temas_pendientes, errores_frecuentes } = agenda;
  const alDia = total_srs_vencidas === 0 && temas_pendientes.length === 0 && errores_frecuentes.length === 0;

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-.01em" }}>
          Agenda de hoy
        </h2>
        <span style={{ fontSize: 12, color: "#8A7F70", fontWeight: 500 }}>
          {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>

      {alDia ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "18px 22px", borderRadius: 18,
          background: "#F0F9F4", border: "1px solid #BCE3CC",
        }}>
          <span style={{ fontSize: 28 }}>🎉</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>¡Estás al día!</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>No tienes repasos pendientes ni temas atrasados. Buen trabajo.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>

          {/* ── SRS vencidas ── */}
          <div style={card(total_srs_vencidas > 0 ? "#EFEAFD" : "#F5F0E8", total_srs_vencidas > 0 ? "#C4B5FD" : "#EBE3D5")}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={iconBox("#6A45DE", "#EFEAFD")}>🗂️</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6A45DE" }}>Repaso SRS</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#1C1917", lineHeight: 1.1 }}>
                  {total_srs_vencidas}
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#8A7F70", marginLeft: 4 }}>
                    {total_srs_vencidas === 1 ? "tarjeta" : "tarjetas"}
                  </span>
                </div>
              </div>
            </div>
            {srs_vencidas.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {srs_vencidas.map(s => (
                  <button key={s.materia_id} onClick={() => navigate(`/srs/${s.materia_id}`)}
                    style={actionChip("#6A45DE")}>
                    {s.materia_nombre.split(" ").slice(0, 3).join(" ")}
                    <span style={{ marginLeft: "auto", background: "#6A45DE", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                      {s.cantidad}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#8A7F70" }}>Sin repasos pendientes</div>
            )}
          </div>

          {/* ── Temas a reforzar ── */}
          <div style={card("#FFF8EC", "#EBE3D5")}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={iconBox("#D38A2C", "#FBEFDD")}>📚</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#D38A2C" }}>Temas a reforzar</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#1C1917", lineHeight: 1.1 }}>
                  {temas_pendientes.length}
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#8A7F70", marginLeft: 4 }}>temas</span>
                </div>
              </div>
            </div>
            {temas_pendientes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {temas_pendientes.slice(0, 4).map(t => (
                  <button key={t.tema_id} onClick={() => navigate(`/materia/${t.materia_id}`)}
                    style={actionChip("#D38A2C")}>
                    <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.tema_nombre}
                    </span>
                    <span style={{
                      marginLeft: 6, borderRadius: 8, padding: "1px 6px", fontSize: 9, fontWeight: 700,
                      background: NIVEL_COLOR[t.nivel] + "22", color: NIVEL_COLOR[t.nivel], flexShrink: 0,
                    }}>
                      {NIVEL_LABEL[t.nivel]}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#8A7F70" }}>Todo dominado 🎯</div>
            )}
          </div>

          {/* ── Errores frecuentes ── */}
          <div style={card("#FFF5F5", "#FECACA")}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={iconBox("#DC2626", "#FEE2E2")}>📖</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>Libro de Errores</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#1C1917", lineHeight: 1.1 }}>
                  {errores_frecuentes.length > 0 ? errores_frecuentes[0].veces_fallada : 0}
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#8A7F70", marginLeft: 4 }}>fallos top</span>
                </div>
              </div>
            </div>
            {errores_frecuentes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {errores_frecuentes.map((e, i) => (
                  <button key={i} onClick={() => navigate(`/errores/${e.materia_id}`)}
                    style={actionChip("#DC2626")}>
                    <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.pregunta_texto}
                    </span>
                    <span style={{ marginLeft: 6, background: "#DC2626", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                      ×{e.veces_fallada}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#8A7F70" }}>Sin errores registrados</div>
            )}
          </div>

        </div>
      )}
    </section>
  );
}

function card(bg: string, border: string): React.CSSProperties {
  return {
    background: bg, border: `1px solid ${border}`,
    borderRadius: 18, padding: "18px 18px 16px",
    display: "flex", flexDirection: "column",
  };
}

function iconBox(color: string, bg: string): React.CSSProperties {
  return {
    width: 38, height: 38, borderRadius: 11,
    background: bg, color, display: "flex",
    alignItems: "center", justifyContent: "center",
    fontSize: 18, flexShrink: 0,
  };
}

function actionChip(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 6,
    padding: "5px 10px", borderRadius: 9,
    border: `1px solid ${color}25`,
    background: `${color}0a`,
    color: "#1C1917", fontSize: 11, fontWeight: 600,
    cursor: "pointer", textAlign: "left",
    transition: "background .12s",
    width: "100%",
  };
}
