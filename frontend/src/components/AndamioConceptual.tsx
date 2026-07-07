import { useState, useEffect } from "react";
import api from "@/services/api";

interface Andamio {
  titulo_intuitivo: string;
  pregunta_gancho: string;
  imagen_mental: string;
  analogia: string;
  por_que_importa: string;
  cached: boolean;
}

interface Props {
  temaId: string;
  temaNombre: string;
}

export default function AndamioConceptual({ temaId, temaNombre }: Props) {
  const [data, setData] = useState<Andamio | null>(null);
  const [loading, setLoading] = useState(true);
  const [colapsado, setColapsado] = useState(false);
  const [regenerando, setRegenerando] = useState(false);

  useEffect(() => {
    setData(null);
    setLoading(true);
    setColapsado(false);
    api.get(`/temas/${temaId}/andamio-visual`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [temaId]);

  async function regenerar() {
    setRegenerando(true);
    try {
      const r = await api.get(`/temas/${temaId}/andamio-visual?regenerar=true`);
      setData(r.data);
      setColapsado(false);
    } catch {}
    setRegenerando(false);
  }

  if (loading) {
    return (
      <div style={{
        background: "var(--sepia-accent-tint)", borderRadius: 16,
        padding: "16px 20px", marginBottom: 28,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%",
          border: "2px solid var(--sepia-accent)",
          borderTopColor: "transparent", animation: "spin 0.8s linear infinite",
        }} />
        <span style={{ fontSize: 13, color: "var(--sepia-text-secondary)" }}>
          Preparando el andamio conceptual...
        </span>
      </div>
    );
  }

  if (!data) return null;

  if (colapsado) {
    return (
      <button
        onClick={() => setColapsado(false)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "7px 14px", borderRadius: 20, marginBottom: 24,
          border: "1px solid var(--sepia-accent)", background: "none",
          color: "var(--sepia-accent)", fontSize: 12, fontWeight: 700,
          cursor: "pointer",
        }}
      >
        💡 Ver andamio conceptual
      </button>
    );
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, #FFFBF2 0%, #FFF8EC 100%)",
      border: "1.5px solid #E8C97A",
      borderRadius: 20, padding: "22px 24px",
      marginBottom: 28,
      position: "relative",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "#F59E0B", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 18, flexShrink: 0,
          }}>
            💡
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#B45309" }}>
              Antes de la teoría formal
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#78350F", marginTop: 1 }}>
              {data.titulo_intuitivo}
            </div>
          </div>
        </div>
        <button
          onClick={() => setColapsado(true)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#B45309", fontSize: 18, lineHeight: 1, padding: "2px 4px",
            flexShrink: 0,
          }}
          title="Colapsar"
        >
          ×
        </button>
      </div>

      {/* Pregunta gancho */}
      <div style={{
        background: "#FEF3C7", borderRadius: 12, padding: "12px 16px",
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#92400E", marginBottom: 4, letterSpacing: "0.06em" }}>
          La pregunta que este tema responde
        </div>
        <div style={{ fontSize: 15, color: "#78350F", fontWeight: 600, lineHeight: 1.5 }}>
          {data.pregunta_gancho}
        </div>
      </div>

      {/* Grid de 3 cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {/* Imagen mental */}
        <div style={{
          background: "#FFF", borderRadius: 12, padding: "12px 14px",
          border: "1px solid #F5DFA0",
          gridColumn: "1 / -1",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#B45309", marginBottom: 6, letterSpacing: "0.06em" }}>
            👁️ Imagen mental (sin fórmulas)
          </div>
          <div style={{ fontSize: 13, color: "#44321A", lineHeight: 1.65 }}>
            {data.imagen_mental}
          </div>
        </div>

        {/* Analogía */}
        <div style={{
          background: "#FFF", borderRadius: 12, padding: "12px 14px",
          border: "1px solid #F5DFA0",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#B45309", marginBottom: 6, letterSpacing: "0.06em" }}>
            🔁 Analogía
          </div>
          <div style={{ fontSize: 12, color: "#44321A", lineHeight: 1.6 }}>
            {data.analogia}
          </div>
        </div>

        {/* Por qué importa */}
        <div style={{
          background: "#FFF", borderRadius: 12, padding: "12px 14px",
          border: "1px solid #F5DFA0",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#B45309", marginBottom: 6, letterSpacing: "0.06em" }}>
            🎯 Para qué sirve
          </div>
          <div style={{ fontSize: 12, color: "#44321A", lineHeight: 1.6 }}>
            {data.por_que_importa}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, color: "#B45309", opacity: 0.6 }}>
          {data.cached ? "⚡ Caché" : "🧠 Generado con IA"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={regenerar}
            disabled={regenerando}
            style={{
              background: "none", border: "1px solid #E8C97A", borderRadius: 8,
              padding: "5px 12px", color: "#B45309", fontSize: 11, fontWeight: 700,
              cursor: regenerando ? "wait" : "pointer", opacity: regenerando ? 0.5 : 1,
            }}
          >
            {regenerando ? "⟳" : "Regenerar"}
          </button>
          <button
            onClick={() => setColapsado(true)}
            style={{
              background: "#F59E0B", border: "none", borderRadius: 8,
              padding: "5px 14px", color: "#fff", fontSize: 11, fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Entendido, ver teoría →
          </button>
        </div>
      </div>
    </div>
  );
}
