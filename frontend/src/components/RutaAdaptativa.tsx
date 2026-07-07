import { useEffect, useState } from "react";
import api from "@/services/api";

interface Paso {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: "teoria" | "asistente" | "flashcards" | "taller";
  accion: string;
  completado: boolean;
  prioritario: boolean;
}

interface Ruta {
  pasos: Paso[];
  mensaje: string;
  nivel_actual: string;
  puntuacion_actual: number;
  paso_actual: number;
  completado: boolean;
}

interface Props {
  temaId: string;
  temaNombre: string;
  onNavegar: (accion: string) => void;
  refetchKey?: number; // incrementar para forzar recarga
}

const TIPO_ICON: Record<string, string> = {
  teoria: "📖",
  asistente: "💬",
  flashcards: "🃏",
  taller: "✏️",
};

const NIVEL_LABEL: Record<string, { label: string; color: string }> = {
  no_iniciado: { label: "Sin empezar", color: "#A89C8B" },
  en_curso:    { label: "En curso",    color: "#6A45DE" },
  practicando: { label: "Practicando", color: "#D38A2C" },
  dominado:    { label: "Dominado",    color: "#2E9E63" },
};

export default function RutaAdaptativa({ temaId, temaNombre, onNavegar, refetchKey = 0 }: Props) {
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [expandido, setExpandido] = useState(true);

  useEffect(() => {
    if (!temaId) return;
    api.get(`/temas/${temaId}/ruta-adaptativa`)
      .then(r => setRuta(r.data))
      .catch(() => {});
  }, [temaId, refetchKey]);

  if (!ruta) return null;

  const nivelInfo = NIVEL_LABEL[ruta.nivel_actual] || NIVEL_LABEL.no_iniciado;

  return (
    <div style={{
      background: "#FAF5EC",
      border: "1px solid var(--sepia-border)",
      borderRadius: 14,
      marginBottom: 20,
      overflow: "hidden",
    }}>
      {/* Header */}
      <button
        onClick={() => setExpandido(!expandido)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "12px 16px",
          background: "none", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🗺️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--sepia-text)" }}>
              Tu ruta para dominar este tema
            </div>
            <div style={{ fontSize: 11, color: nivelInfo.color, fontWeight: 600, marginTop: 1 }}>
              {nivelInfo.label}
              {ruta.puntuacion_actual > 0 && ` · ${ruta.puntuacion_actual}% mejor resultado`}
            </div>
          </div>
        </div>
        <span style={{ fontSize: 11, color: "#A89C8B", userSelect: "none" }}>
          {expandido ? "▲ ocultar" : "▼ ver ruta"}
        </span>
      </button>

      {/* Mensaje adaptativo */}
      {expandido && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{
            fontSize: 12, color: "var(--sepia-text-secondary)",
            background: "var(--sepia-bg)", borderRadius: 8,
            padding: "8px 12px", marginBottom: 14, lineHeight: 1.55,
            borderLeft: "3px solid var(--sepia-accent)",
          }}>
            {ruta.mensaje}
          </div>

          {/* Pasos */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ruta.pasos.map((paso, i) => {
              const esCurrent = i === ruta.paso_actual;
              const isPast = paso.completado;
              const isFuture = !paso.completado && i > ruta.paso_actual;

              return (
                <button
                  key={paso.id}
                  onClick={() => !isFuture && onNavegar(paso.accion)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 12px", borderRadius: 10, textAlign: "left",
                    border: esCurrent
                      ? "2px solid var(--sepia-accent)"
                      : paso.prioritario
                      ? "2px solid #E07020"
                      : "1px solid var(--sepia-border)",
                    background: isPast ? "#F0F9F4" : esCurrent ? "#FBF5E8" : "var(--sepia-panel)",
                    opacity: isFuture ? 0.5 : 1,
                    cursor: isFuture ? "default" : "pointer",
                    transition: "border-color .15s",
                  }}
                >
                  {/* Indicador de estado */}
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700,
                    background: isPast ? "#2E9E63" : esCurrent ? "var(--sepia-accent)" : "#D8CDBC",
                    color: isPast || esCurrent ? "#fff" : "#8A7F70",
                  }}>
                    {isPast ? "✓" : TIPO_ICON[paso.tipo] || String(i + 1)}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: isPast ? "#2E9E63" : esCurrent ? "var(--sepia-accent)" : "var(--sepia-text)",
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      {paso.titulo}
                      {paso.prioritario && !isPast && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, background: "#E07020",
                          color: "#fff", borderRadius: 4, padding: "1px 5px",
                          textTransform: "uppercase", letterSpacing: ".04em",
                        }}>
                          Prioritario
                        </span>
                      )}
                    </div>
                    {esCurrent && (
                      <div style={{ fontSize: 11, color: "var(--sepia-text-secondary)", marginTop: 3, lineHeight: 1.45 }}>
                        {paso.descripcion}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {ruta.completado && (
            <div style={{
              marginTop: 10, textAlign: "center", fontSize: 12,
              color: "#2E9E63", fontWeight: 700, padding: "8px",
              background: "#F0F9F4", borderRadius: 8,
            }}>
              ✅ Has superado este tema. El siguiente está desbloqueado.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
