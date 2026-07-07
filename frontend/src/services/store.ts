import { create } from "zustand";
import api from "./api";
import axios from "axios";

export type NivelDominio = "no_iniciado" | "en_curso" | "practicando" | "dominado";

export interface Tema {
  id: string;
  nombre: string;
  orden: number;
  descripcion?: string;
  nivel: NivelDominio;
  puntuacion?: number; // 0-100
}

export interface Materia {
  id: string;
  nombre: string;
  descripcion: string;
  codigo_uned?: string;
  progreso: number;
  temas: Tema[];
  categoria?: "carrera" | "certificacion";
  sandbox_tipo?: "cpp" | "sql" | "none";
}

export interface Mensaje {
  id: string;
  rol: "user" | "assistant";
  contenido: string;
  timestamp: string;
}

export interface Taller {
  id: string;
  titulo: string;
  nivel_dificultad: "basico" | "intermedio" | "avanzado";
  feedback?: string;
  puntuacion?: number;
  completado: boolean;
}

interface AppState {
  materias: Materia[];
  chatHistory: Mensaje[];
  selectedMateriaId: string | null;
  isLoading: boolean;
  error: string | null;
  sidebarIzquierdoAbierto: boolean;
  layoutEstudio: 'A' | 'C';
  temaActualId: string | null;
  talleres: Taller[];

  fetchMaterias: () => Promise<void>;
  fetchMateriaDetalle: (materiaId: string) => Promise<void>;
  fetchTeoriaTema: (temaId: string, materiaId: string) => Promise<{ respuesta: string; cache: string }>;
  sendPregunta: (pregunta: string, codigoMateria?: string, nivel?: string) => Promise<string>;
  enviarMensajeAlChat: (pregunta: string, codigoMateria?: string, nivel?: string) => Promise<void>;
  compileCode: (code: string) => Promise<{ success: boolean; output: string; error?: string }>;
  evaluarTaller: (temaId: string, respuesta: string, codigo?: string, modo?: string, dificultad?: string) => Promise<any>;
  
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedMateria: (id: string | null) => void;
  addMensaje: (msg: Mensaje) => void;
  setChatHistory: (msgs: Mensaje[]) => void;
  setTemaActual: (temaId: string | null) => void;
  setTalleres: (talleres: Taller[]) => void;
  toggleSidebarIzquierdo: () => void;
  setLayoutEstudio: (layout: 'A' | 'C') => void;
  marcarTemaCompletado: (materiaId: string, temaId: string, puntuacion: number) => void;

  // Canal compartido: cualquier herramienta deposita aquí, ChatSidebar lo consume al montar
  pendingChatImage: { base64: string; filename: string; mime: string; hint?: string } | null;
  setPendingChatImage: (img: AppState['pendingChatImage']) => void;
}

export const useStore = create<AppState>((set, get) => ({
  materias: [],
  chatHistory: [],
  selectedMateriaId: null,
  isLoading: false,
  error: null,
  sidebarIzquierdoAbierto: true,
  layoutEstudio: 'A',
  temaActualId: null,
  talleres: [],
  pendingChatImage: null,

  fetchMaterias: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get("/materias");
      const data = res.data.materias || [];
      const materias: Materia[] = await Promise.all(
        data.map(async (m: any) => {
          let progreso = 0;
          try {
            const progRes = await api.get(`/materias/${m.id}/progreso`);
            progreso = progRes.data?.porcentaje || 0;
          } catch (_) {}
          return {
            id: m.id,
            nombre: m.nombre,
            descripcion: m.descripcion || "",
            codigo_uned: m.codigo_uned,
            progreso,
            temas: [],
            categoria: m.categoria || "carrera",
            sandbox_tipo: m.sandbox_tipo || "cpp",
          };
        })
      );
      set({ materias, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  fetchMateriaDetalle: async (materiaId: string) => {
    set({ isLoading: true });
    try {
      const res = await api.get(`/materias/${materiaId}`);
      const data = res.data;

      const temas: Tema[] = (data.temas || []).map((t: any) => ({
        id: t.id,
        nombre: t.nombre,
        orden: t.orden,
        descripcion: t.descripcion,
        nivel: (t.nivel_dominio || "no_iniciado") as NivelDominio,
        puntuacion: t.puntuacion || 0,
      }));

      // Calcular progreso desde los temas cargados
      const iniciados = temas.filter(t => t.nivel !== "no_iniciado").length;
      const dominados = temas.filter(t => t.nivel === "dominado").length;
      const progresoCalculado = Math.round(((dominados * 1.0 + (iniciados - dominados) * 0.5) / Math.max(temas.length, 1)) * 100);

      set((state) => {
        const materiaExiste = state.materias.some((m) => m.id === materiaId);
        return {
          materias: materiaExiste
            ? state.materias.map((m) =>
                m.id === materiaId ? { ...m, temas, descripcion: data.descripcion, progreso: progresoCalculado } : m
              )
            : [...state.materias, { id: data.id, nombre: data.nombre, descripcion: data.descripcion, temas, progreso: progresoCalculado }],
          isLoading: false,
        };
      });

    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  fetchTeoriaTema: async (temaId: string, materiaId: string) => {
    const state = get();
    const materia = state.materias.find(m => m.id === materiaId);
    const tema = materia?.temas.find(t => t.id === temaId);

    set({ isLoading: true });
    try {
      const res = await api.post("/asistente/preguntar", {
        pregunta: `MATERIA: ${materia?.nombre}. TEMA: ${tema?.nombre}. Genera los fundamentos teóricos completos para este tema.`,
        codigo_materia: materia?.codigo_uned || materia?.nombre || materiaId,
        nivel: "normal",
        modo: "teoria",
      });
      set({ isLoading: false });
      return { respuesta: res.data.respuesta, cache: res.data.cache || "MISS" };
    } catch (e: any) {
      set({ isLoading: false });
      return { respuesta: "Error al cargar la teoría desde el sistema RAG.", cache: "ERROR" };
    }
  },

  evaluarTaller: async (temaId, respuesta, codigo, modo = "tecnico", dificultad = "intermedio") => {
    set({ isLoading: true });
    try {
      const res = await api.post("/asistente/evaluar", {
        tema_id: temaId,
        respuesta,
        codigo: codigo || "",
        modo_evaluacion: modo,
        dificultad,
      });
      set({ isLoading: false });
      return res.data;
    } catch (e: any) {
      set({ isLoading: false });
      return {
        puntuacion: 0,
        feedback: "**Evaluación no disponible** — El servicio de IA no responde. Tu respuesta no fue calificada. Inténtalo de nuevo cuando el backend esté activo.",
        completado: false
      };
    }
  },

  marcarTemaCompletado: async (materiaId, temaId, puntuacion) => {
    // 1. Persistir al backend — el backend determina el nivel real
    let nivelReal: NivelDominio = "dominado"; // fallback optimista
    try {
      const res = await api.post(`/temas/${temaId}/estudiar`, {
        tipo: "ejercicio",
        duracion_minutos: 0,
        puntuacion,
      });
      // Usar el nivel y puntuación que el backend determinó
      nivelReal = (res.data?.nivel_dominio || "dominado") as NivelDominio;
      if (res.data?.puntuacion != null) puntuacion = res.data.puntuacion;
    } catch (e: any) {
      console.warn("[Mathos] No se pudo persistir el progreso:", e.message);
      // Si el backend falla, guardamos en localStorage como respaldo
      try {
        const backup = JSON.parse(localStorage.getItem("mathos_progreso_backup") || "{}");
        backup[temaId] = { puntuacion, timestamp: new Date().toISOString() };
        localStorage.setItem("mathos_progreso_backup", JSON.stringify(backup));
      } catch (_) {}
    }

    // 2. Actualizar estado local con el nivel del backend
    set((state) => ({
      materias: state.materias.map(m => {
        if (m.id !== materiaId) return m;
        const nuevosTemas = m.temas.map(t =>
          t.id === temaId ? { ...t, nivel: nivelReal, puntuacion } : t
        );
        // Calcular progreso: cualquier tema que no esté "no_iniciado" cuenta
        const iniciados = nuevosTemas.filter(t => t.nivel !== "no_iniciado").length;
        const dominados = nuevosTemas.filter(t => t.nivel === "dominado").length;
        const nuevoProgreso = Math.round(((iniciados * 0.5 + dominados * 0.5) / nuevosTemas.length) * 100);
        return { ...m, temas: nuevosTemas, progreso: Math.min(100, nuevoProgreso) };
      })
    }));
  },

  sendPregunta: async (pregunta, codigoMateria, nivel = "normal") => {
    set({ isLoading: true });
    try {
      const res = await api.post("/asistente/preguntar", { pregunta, codigo_materia: codigoMateria, nivel });
      set({ isLoading: false });
      return res.data.respuesta;
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
      throw e;
    }
  },

  enviarMensajeAlChat: async (pregunta, codigoMateria, nivel = "dummy") => {
    const mkId = () => `${Date.now()}-${Math.random()}`;
    const ts = () => new Date().toISOString();
    get().addMensaje({ id: mkId(), rol: "user", contenido: pregunta, timestamp: ts() });
    set({ isLoading: true });
    try {
      const res = await api.post("/asistente/preguntar", { pregunta, codigo_materia: codigoMateria, nivel });
      get().addMensaje({ id: mkId(), rol: "assistant", contenido: res.data.respuesta, timestamp: ts() });
    } catch {
      get().addMensaje({ id: mkId(), rol: "assistant", contenido: "Hubo un error al contactar a Ikaro. Inténtalo de nuevo.", timestamp: ts() });
    } finally {
      set({ isLoading: false });
    }
  },

  compileCode: async (code) => {
    try {
      // Usar axios directo (no la instancia api con baseURL /api/v1)
      // porque /compile-api es un proxy de Vite al kernel C++ en :8100
      const res = await axios.post("/compile-api/compile", { code }, {
        headers: { "X-API-Key": import.meta.env.VITE_COMPILE_API_KEY ?? "" },
      });
      return { success: res.data.success, output: res.data.stdout, error: res.data.stderr };
    } catch (e: any) {
      const msg = e?.message || String(e) || "Error desconocido";
      if (msg.includes("Network Error") || e?.code === "ERR_NETWORK") {
        return { success: false, output: "", error: `Error de conexión con el kernel (puerto 8100). ¿Está corriendo? Ejecuta: bash mathos.sh --status` };
      }
      return { success: false, output: "", error: msg };
    }
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setSelectedMateria: (id) => {
    set({ selectedMateriaId: id });
    if (id) get().fetchMateriaDetalle(id);
  },
  addMensaje: (msg) => set((state) => ({ chatHistory: [...state.chatHistory, msg] })),
  setChatHistory: (chatHistory) => set({ chatHistory }),
  setTemaActual: (temaId) => set({ temaActualId: temaId }),
  setTalleres: (talleres) => set({ talleres }),
  toggleSidebarIzquierdo: () => set((state) => ({ sidebarIzquierdoAbierto: !state.sidebarIzquierdoAbierto })),
  setLayoutEstudio: (layout) => set({ layoutEstudio: layout }),
  setPendingChatImage: (pendingChatImage) => set({ pendingChatImage }),
}));
