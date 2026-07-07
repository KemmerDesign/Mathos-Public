import { useState, useEffect, useCallback } from "react";
import api from "@/services/api";

interface TerminoGlosario {
  id: string;
  termino: string;
  nombre_informal: string;
  definicion_formal: string;
  definicion_informal: string;
  ejemplo: string | null;
  materia_id: string | null;
}

interface Props {
  materiaId?: string;
  tema?: string;
}

export default function GlosarioPanel({ materiaId, tema }: Props) {
  const [terminos, setTerminos] = useState<TerminoGlosario[]>([]);
  const [q, setQ] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const buscar = useCallback(async (query: string) => {
    setCargando(true);
    try {
      const params: Record<string, string> = {};
      if (query) params.q = query;
      if (materiaId) params.materia_id = materiaId;
      const res = await api.get("/glosario", { params });
      setTerminos(res.data);
    } catch {
      // silencioso
    } finally {
      setCargando(false);
    }
  }, [materiaId]);

  useEffect(() => {
    buscar(q);
  }, [materiaId]);

  useEffect(() => {
    const t = setTimeout(() => buscar(q), 300);
    return () => clearTimeout(t);
  }, [q, buscar]);

  const t = {
    bg: "var(--sepia-bg)",
    panel: "var(--sepia-panel)",
    border: "var(--sepia-border)",
    text: "var(--sepia-text)",
    textSec: "var(--sepia-text-secondary)",
    accent: "var(--sepia-accent)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      {/* Buscador */}
      <div style={{ position: "relative" }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar término…"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "7px 10px 7px 32px", borderRadius: 8,
            border: `1px solid ${t.border}`, background: t.panel,
            color: t.text, fontSize: 13, outline: "none",
          }}
        />
        <span style={{
          position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
          fontSize: 14, opacity: 0.45, pointerEvents: "none",
        }}>🔍</span>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {cargando && (
          <div style={{ textAlign: "center", opacity: 0.4, fontSize: 12, padding: 20 }}>Buscando…</div>
        )}
        {!cargando && terminos.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 12px" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📖</div>
            <div style={{ fontSize: 13, color: t.textSec, lineHeight: 1.5 }}>
              {q ? "Sin resultados." : "El glosario se llena automáticamente cuando usas el asistente."}
            </div>
          </div>
        )}
        {terminos.map(term => (
          <div
            key={term.id}
            onClick={() => setExpandido(expandido === term.id ? null : term.id)}
            style={{
              background: t.panel, border: `1px solid ${t.border}`,
              borderRadius: 10, padding: "10px 12px", cursor: "pointer",
              transition: "border-color .15s",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: t.text }}>{term.termino}</div>
                <div style={{
                  fontSize: 11, color: t.accent, fontWeight: 600,
                  marginTop: 2, opacity: 0.85,
                }}>
                  → {term.nombre_informal}
                </div>
              </div>
              <span style={{ fontSize: 11, color: t.textSec, opacity: 0.6, flexShrink: 0, marginTop: 2 }}>
                {expandido === term.id ? "▲" : "▼"}
              </span>
            </div>

            {/* Expandido */}
            {expandido === term.id && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{
                  background: `${t.accent}12`, borderLeft: `3px solid ${t.accent}`,
                  borderRadius: "0 6px 6px 0", padding: "8px 10px",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: t.accent, marginBottom: 3 }}>
                    En lenguaje llano
                  </div>
                  <div style={{ fontSize: 13, color: t.text, lineHeight: 1.55 }}>
                    {term.definicion_informal}
                  </div>
                </div>
                <div style={{
                  background: t.bg, borderRadius: 6, padding: "8px 10px",
                  border: `1px solid ${t.border}`,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: t.textSec, marginBottom: 3 }}>
                    Definición formal
                  </div>
                  <div style={{ fontSize: 12, color: t.textSec, lineHeight: 1.55 }}>
                    {term.definicion_formal}
                  </div>
                </div>
                {term.ejemplo && (
                  <div style={{ fontSize: 12, color: t.text, lineHeight: 1.55 }}>
                    <span style={{ fontWeight: 600 }}>Ejemplo: </span>{term.ejemplo}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
