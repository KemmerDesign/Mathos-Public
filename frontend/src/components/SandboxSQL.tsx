import { useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import api from "@/services/api";

interface Props {
  temaNombre?: string;
  className?: string;
}

interface EjecucionResult {
  tipo: string;
  success: boolean;
  columns?: string[];
  rows?: any[][];
  rows_affected?: number;
  error?: string;
  mensaje?: string;
}

interface SchemaTabla {
  nombre: string;
  columnas: string;
  filas: number;
}

const EJEMPLOS_SQL = [
  { label: "Todos los empleados", sql: "SELECT employee_id, first_name, last_name, salary, job_id\nFROM employees\nORDER BY salary DESC;" },
  { label: "Empleados por departamento", sql: "SELECT d.department_name, COUNT(e.employee_id) AS num_empleados, ROUND(AVG(e.salary), 2) AS salario_promedio\nFROM departments d\nLEFT JOIN employees e ON d.department_id = e.department_id\nGROUP BY d.department_name\nORDER BY num_empleados DESC;" },
  { label: "Top 5 salarios", sql: "SELECT first_name || ' ' || last_name AS nombre, salary, job_id\nFROM employees\nORDER BY salary DESC\nLIMIT 5;" },
  { label: "JOIN employees-departments-jobs", sql: "SELECT e.first_name, e.last_name, d.department_name, j.job_title, e.salary\nFROM employees e\nJOIN departments d ON e.department_id = d.department_id\nJOIN jobs j ON e.job_id = j.job_id\nORDER BY e.salary DESC;" },
  { label: "Subquery — salario > promedio", sql: "SELECT first_name, last_name, salary\nFROM employees\nWHERE salary > (SELECT AVG(salary) FROM employees)\nORDER BY salary DESC;" },
  { label: "Window function RANK()", sql: "SELECT first_name, last_name, department_id, salary,\n  RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rk\nFROM employees\nORDER BY department_id, rk;" },
];

export default function SandboxSQL({ temaNombre = "", className = "" }: Props) {
  const [sql, setSql] = useState("-- Escribe tu SQL aquí\n-- Esquema: employees, departments, jobs, locations, countries, regions, job_history\n\nSELECT first_name, last_name, salary FROM employees ORDER BY salary DESC LIMIT 10;");
  const [resultado, setResultado] = useState<EjecucionResult | null>(null);
  const [analisisIA, setAnalisisIA] = useState<string>("");
  const [ejecutando, setEjecutando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [tabActiva, setTabActiva] = useState<"resultado" | "schema">("resultado");
  const [schema, setSchema] = useState<SchemaTabla[]>([]);
  const [schemaLoaded, setSchemaLoaded] = useState(false);

  async function ejecutarSQL(analizar = false) {
    if (!sql.trim()) return;
    setEjecutando(true);
    if (analizar) setAnalizando(true);
    setResultado(null);
    setAnalisisIA("");

    try {
      const res = await api.post("/sandbox/sql/ejecutar", {
        sql: sql.trim(),
        tema_nombre: temaNombre,
        analizar_con_ia: analizar,
      });
      setResultado(res.data.resultado);
      if (res.data.analisis_ia) setAnalisisIA(res.data.analisis_ia);
    } catch (e: any) {
      setResultado({
        tipo: "ERROR",
        success: false,
        error: e.message || "Error al conectar con el backend",
        columns: [],
        rows: [],
        rows_affected: 0,
      });
    } finally {
      setEjecutando(false);
      setAnalizando(false);
    }
  }

  async function soloAnalizarIA() {
    if (!sql.trim()) return;
    setAnalizando(true);
    setAnalisisIA("");
    try {
      const res = await api.post("/sandbox/sql/analizar", {
        sql: sql.trim(),
        tema_nombre: temaNombre,
      });
      setAnalisisIA(res.data.analisis_ia || "");
    } catch (e: any) {
      setAnalisisIA("Error al obtener análisis de IA.");
    } finally {
      setAnalizando(false);
    }
  }

  async function cargarSchema() {
    if (schemaLoaded) { setTabActiva("schema"); return; }
    try {
      const res = await api.get("/sandbox/sql/schema");
      setSchema(res.data.tablas || []);
      setSchemaLoaded(true);
      setTabActiva("schema");
    } catch (_) {}
  }

  function cargarEjemplo(sqlEjemplo: string) {
    setSql(sqlEjemplo);
    setResultado(null);
    setAnalisisIA("");
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--sepia-text-secondary)]">
            Sandbox SQL — Oracle HR Schema
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-mono">
            SQLite · Oracle-compatible
          </span>
        </div>
        <button
          onClick={cargarSchema}
          className="text-xs text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-accent)] underline"
        >
          Ver esquema HR
        </button>
      </div>

      {/* Ejemplos rápidos */}
      <div className="flex flex-wrap gap-2">
        {EJEMPLOS_SQL.map((ej) => (
          <button
            key={ej.label}
            onClick={() => cargarEjemplo(ej.sql)}
            className="text-[11px] px-2 py-1 rounded bg-[var(--sepia-card)] border border-[var(--sepia-border)] hover:border-[var(--sepia-accent)]/50 text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-text)] transition-colors"
          >
            {ej.label}
          </button>
        ))}
      </div>

      {/* Editor SQL */}
      <div className="rounded-xl overflow-hidden border border-[var(--sepia-border)] bg-[#1e1e1e]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-[#252526]">
          <span className="text-[11px] text-gray-400 font-mono">SQL Editor</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
        </div>
        <Editor
          height="220px"
          language="sql"
          theme="vs-dark"
          value={sql}
          onChange={(v) => setSql(v || "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>

      {/* Botones de acción */}
      <div className="flex gap-3">
        <button
          onClick={() => ejecutarSQL(false)}
          disabled={ejecutando}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--sepia-accent)] text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {ejecutando && !analizando ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span>▶</span>
          )}
          Ejecutar
        </button>

        <button
          onClick={() => ejecutarSQL(true)}
          disabled={ejecutando}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--sepia-card)] border border-[var(--sepia-border)] text-[var(--sepia-text)] font-bold text-sm hover:border-[var(--sepia-accent)]/50 disabled:opacity-50 transition-colors"
        >
          {analizando ? (
            <span className="w-4 h-4 border-2 border-orange-500/30 border-t-orange-400 rounded-full animate-spin" />
          ) : (
            <span>🤖</span>
          )}
          Ejecutar + Analizar IA
        </button>

        <button
          onClick={soloAnalizarIA}
          disabled={analizando}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--sepia-card)] border border-[var(--sepia-border)] text-[var(--sepia-text-secondary)] font-bold text-sm hover:border-orange-500/30 disabled:opacity-50 transition-colors"
        >
          {analizando ? (
            <span className="w-4 h-4 border-2 border-orange-500/30 border-t-orange-400 rounded-full animate-spin" />
          ) : (
            <span>💡</span>
          )}
          Solo Analizar (PL/SQL)
        </button>
      </div>

      {/* Tabs resultado / schema */}
      <div className="flex gap-1 border-b border-[var(--sepia-border)]">
        <button
          onClick={() => setTabActiva("resultado")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
            tabActiva === "resultado"
              ? "text-[var(--sepia-accent)] border-b-2 border-[var(--sepia-accent)]"
              : "text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-text)]"
          }`}
        >
          Resultado
        </button>
        <button
          onClick={cargarSchema}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
            tabActiva === "schema"
              ? "text-[var(--sepia-accent)] border-b-2 border-[var(--sepia-accent)]"
              : "text-[var(--sepia-text-secondary)] hover:text-[var(--sepia-text)]"
          }`}
        >
          Esquema HR
        </button>
      </div>

      {/* Contenido del resultado */}
      {tabActiva === "resultado" && (
        <div className="space-y-4">
          {resultado ? (
            <div>
              {/* Badge de tipo + estado */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded font-mono ${
                  resultado.success
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {resultado.success ? "✓" : "✗"} {resultado.tipo}
                </span>
                {resultado.rows_affected !== undefined && resultado.rows_affected > 0 && (
                  <span className="text-[11px] text-[var(--sepia-text-secondary)]">
                    {resultado.rows_affected} fila(s)
                  </span>
                )}
              </div>

              {/* Error */}
              {resultado.error && (
                <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 font-mono text-xs text-red-400 whitespace-pre-wrap">
                  {resultado.error}
                </div>
              )}

              {/* Mensaje informativo */}
              {resultado.mensaje && (
                <div className="p-3 rounded-lg bg-[var(--sepia-card)] border border-[var(--sepia-border)] text-xs text-[var(--sepia-text-secondary)]">
                  {resultado.mensaje}
                </div>
              )}

              {/* Tabla de resultados */}
              {resultado.columns && resultado.columns.length > 0 && (
                <div className="overflow-auto rounded-lg border border-[var(--sepia-border)] max-h-72">
                  <table className="w-full text-xs font-mono border-collapse">
                    <thead>
                      <tr className="bg-[var(--sepia-card)] border-b border-[var(--sepia-border)]">
                        {resultado.columns.map((col) => (
                          <th key={col} className="px-3 py-2 text-left text-[var(--sepia-accent)] font-bold uppercase tracking-wider whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(resultado.rows || []).map((row, i) => (
                        <tr key={i} className={`border-b border-[var(--sepia-border)]/50 hover:bg-[var(--sepia-card)]/30 ${i % 2 === 0 ? "" : "bg-[var(--sepia-bg)]/30"}`}>
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-1.5 text-[var(--sepia-text)] whitespace-nowrap">
                              {cell === null ? <span className="text-gray-500 italic">NULL</span> : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {resultado.success && (!resultado.rows || resultado.rows.length === 0) && !resultado.error && !resultado.mensaje && (
                <div className="text-xs text-[var(--sepia-text-secondary)] italic">Sin resultados.</div>
              )}
            </div>
          ) : (
            <div className="text-xs text-[var(--sepia-text-secondary)] italic py-4 text-center">
              Ejecuta una consulta para ver resultados aquí.
            </div>
          )}

          {/* Análisis IA */}
          {analisisIA && (
            <div className="mt-4 p-4 rounded-xl bg-[var(--sepia-card)] border border-orange-500/20">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-orange-400 font-bold text-xs uppercase tracking-wider">🤖 Análisis Oracle DBA</span>
              </div>
              <div
                className="text-sm text-[var(--sepia-text)] leading-relaxed prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(analisisIA) }}
              />
            </div>
          )}
        </div>
      )}

      {/* Schema HR */}
      {tabActiva === "schema" && schema.length > 0 && (
        <div className="space-y-2">
          {schema.map((tabla) => (
            <div key={tabla.nombre} className="p-3 rounded-lg bg-[var(--sepia-card)] border border-[var(--sepia-border)]">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-bold text-[var(--sepia-accent)] text-sm">{tabla.nombre.toUpperCase()}</span>
                <span className="text-[11px] text-[var(--sepia-text-secondary)]">{tabla.filas} filas</span>
              </div>
              <p className="text-[11px] text-[var(--sepia-text-secondary)] font-mono">{tabla.columnas}</p>
            </div>
          ))}
          <p className="text-[11px] text-[var(--sepia-text-secondary)] italic mt-2">
            Esquema HR (Human Resources) de Oracle — usado en exámenes OCA/OCP 1Z0-082/1Z0-083.
          </p>
        </div>
      )}
    </div>
  );
}

// Markdown renderer mínimo (headings, bold, code, listas)
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^#### (.+)$/gm, "<h4 class='font-bold text-[var(--sepia-text)] mt-3 mb-1'>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3 class='font-bold text-[var(--sepia-accent)] mt-4 mb-2'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class='text-lg font-bold text-[var(--sepia-accent)] mt-4 mb-2'>$2</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code class='font-mono bg-black/20 px-1 rounded text-orange-300 text-[11px]'>$1</code>")
    .replace(/^```[\w]*\n([\s\S]*?)```/gm, "<pre class='bg-[#1e1e1e] rounded p-3 overflow-auto text-[11px] text-gray-300 font-mono my-2'>$1</pre>")
    .replace(/^- (.+)$/gm, "<li class='ml-4 list-disc text-[var(--sepia-text-secondary)]'>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li class='ml-4 list-decimal text-[var(--sepia-text-secondary)]'>$2</li>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}
