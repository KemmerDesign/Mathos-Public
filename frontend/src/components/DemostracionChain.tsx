import { useState, useEffect } from "react";
import api from "@/services/api";

interface Atomo {
  id: string;
  orden: number;
  premisa: string;
  conclusion: string;
  razon_llana: string;
  razon_formal: string;
  flashcard_id: string | null;
}

interface Demostracion {
  teorema: string;
  atomos: Atomo[];
}

interface Props {
  temaId: string;
  materiaId: string;
  temaNombre: string;
}

export default function DemostracionChain({ temaId, materiaId, temaNombre }: Props) {
  const [demos, setDemos] = useState<Demostracion[]>([]);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [generando, setGenerando] = useState(false);
  const [teoremaInput, setTeoremInput] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  useEffect(() => {
    api.get(`/srs/demostraciones/${temaId}`)
      .then(r => setDemos(r.data))
      .catch(() => {});
  }, [temaId]);

  async function atomizar() {
    if (!teoremaInput.trim()) return;
    setGenerando(true);
    setMsg(null);
    try {
      const res = await api.post("/srs/atomizar-prueba", {
        tema_id: temaId,
        materia_id: materiaId,
        teorema: teoremaInput.trim(),
        texto_base: "",
      });
      const nueva: Demostracion = {
        teorema: res.data.teorema,
        atomos: res.data.atomos,
      };
      setDemos(prev => {
        const sin = prev.filter(d => d.teorema !== nueva.teorema);
        return [...sin, nueva];
      });
      setMsg({ tipo: "ok", texto: `${res.data.pasos} pasos generados. ${res.data.flashcards_generadas} flashcards añadidas al SRS.` });
      setTeoremInput("");
      setMostrarForm(false);
    } catch {
      setMsg({ tipo: "err", texto: "Error al atomizar. Inténtalo de nuevo." });
    } finally {
      setGenerando(false);
    }
  }

  const t = {
    bg: "var(--sepia-bg)",
    panel: "var(--sepia-panel)",
    border: "var(--sepia-border)",
    text: "var(--sepia-text)",
    textSec: "var(--sepia-text-secondary)",
    accent: "var(--sepia-accent)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Demostraciones atomizadas</div>
          <div style={{ fontSize: 12, color: t.textSec, marginTop: 2 }}>
            Cada demostración descompuesta en pasos lógicos mínimos
          </div>
        </div>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          style={{
            padding: "7px 14px", borderRadius: 8, border: `1px solid ${t.accent}`,
            background: "none", color: t.accent, fontSize: 12, fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + Atomizar teorema
        </button>
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <div style={{
          background: t.panel, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10,
        }}>
          <input
            value={teoremaInput}
            onChange={e => setTeoremInput(e.target.value)}
            placeholder={`Ej: "El teorema de Pitágoras" o "Suma de ángulos de un triángulo = 180°"`}
            style={{
              padding: "9px 12px", borderRadius: 8, border: `1px solid ${t.border}`,
              background: t.bg, color: t.text, fontSize: 13, outline: "none",
            }}
          />
          <button
            onClick={atomizar}
            disabled={generando || !teoremaInput.trim()}
            style={{
              padding: "9px 0", borderRadius: 8, background: t.accent,
              color: "#fff", fontWeight: 700, fontSize: 13, border: "none",
              cursor: generando ? "wait" : "pointer", opacity: generando ? 0.7 : 1,
            }}
          >
            {generando ? "Generando pasos..." : "Generar cadena de pasos"}
          </button>
          {msg && (
            <div style={{
              fontSize: 12, padding: "7px 10px", borderRadius: 7,
              background: msg.tipo === "ok" ? "#F0F9F4" : "#FEF2F2",
              color: msg.tipo === "ok" ? "#2E9E63" : "#DC2626",
            }}>
              {msg.texto}
            </div>
          )}
        </div>
      )}

      {/* Lista de demostraciones */}
      {demos.length === 0 && !mostrarForm && (
        <div style={{
          textAlign: "center", padding: "32px 16px",
          color: t.textSec, fontSize: 13,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
          Ninguna demostración atomizada aún.<br />
          Usa el botón de arriba para descomponer un teorema en pasos lógicos mínimos.
        </div>
      )}

      {demos.map((demo, di) => (
        <div key={demo.teorema} style={{
          background: t.panel, border: `1px solid ${t.border}`,
          borderRadius: 14, overflow: "hidden",
        }}>
          {/* Header demostración */}
          <div style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${t.border}`,
            background: t.bg,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: t.text }}>
              {demo.teorema}
            </div>
            <div style={{ fontSize: 11, color: t.textSec, marginTop: 2 }}>
              {demo.atomos.length} pasos · {demo.atomos.length} flashcards en tu SRS
            </div>
          </div>

          {/* Cadena de pasos */}
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            {demo.atomos.map((atomo, ai) => {
              const isExpanded = expandido === di * 100 + ai;
              return (
                <div key={atomo.id}>
                  {/* Paso */}
                  <button
                    onClick={() => setExpandido(isExpanded ? null : di * 100 + ai)}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 12px",
                      borderRadius: 10, border: `1px solid ${isExpanded ? t.accent : t.border}`,
                      background: isExpanded ? `${t.accent}08` : t.bg,
                      cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10,
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                      background: t.accent, color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {atomo.orden}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: t.textSec, lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 600, color: t.text }}>Si</span> {atomo.premisa}
                      </div>
                      <div style={{ fontSize: 12, color: t.text, marginTop: 3, lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 600 }}>→</span> {atomo.conclusion}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: t.textSec, flexShrink: 0 }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </button>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      margin: "4px 0 4px 34px",
                      padding: "10px 12px", borderRadius: 8,
                      background: t.panel, border: `1px solid ${t.border}`,
                      display: "flex", flexDirection: "column", gap: 8,
                    }}>
                      <div style={{
                        background: `${t.accent}12`, borderLeft: `3px solid ${t.accent}`,
                        borderRadius: "0 6px 6px 0", padding: "8px 10px",
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: t.accent, marginBottom: 3 }}>
                          Por qué es verdad (lenguaje llano)
                        </div>
                        <div style={{ fontSize: 12, color: t.text, lineHeight: 1.55 }}>
                          {atomo.razon_llana}
                        </div>
                      </div>
                      <div style={{ padding: "8px 10px", background: t.bg, borderRadius: 6, border: `1px solid ${t.border}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: t.textSec, marginBottom: 3 }}>
                          Argumento formal
                        </div>
                        <div style={{ fontSize: 12, color: t.textSec, lineHeight: 1.55 }}>
                          {atomo.razon_formal}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Flecha entre pasos */}
                  {ai < demo.atomos.length - 1 && (
                    <div style={{ textAlign: "center", color: t.textSec, fontSize: 16, margin: "2px 0" }}>↓</div>
                  )}
                </div>
              );
            })}

            {/* QED */}
            <div style={{
              textAlign: "center", padding: "10px", background: "#F0F9F4",
              borderRadius: 10, border: "1px solid #BCE3CC",
              color: "#2E9E63", fontWeight: 700, fontSize: 13, marginTop: 4,
            }}>
              ∎ Q.E.D.
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
