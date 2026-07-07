import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json",
    ...(import.meta.env.VITE_MATHOS_API_KEY ? { "X-API-Key": import.meta.env.VITE_MATHOS_API_KEY } : {}),
  },
});

// ── Request interceptor: attach auth token ────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      "Error desconocido";

    if (error.response?.status === 422) {
      const details = error.response?.data?.detail;
      if (Array.isArray(details)) {
        const formatted = details
          .map((d: any) => `${d.loc?.join(".")}: ${d.msg}`)
          .join("\n");
        return Promise.reject(new Error(formatted));
      }
    }

    // ── 401: token inválido/expirado → limpiar y redirigir ────────────────
    if (error.response?.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      // Only redirect if not already on auth pages
      if (
        !window.location.pathname.startsWith("/login") &&
        !window.location.pathname.startsWith("/register")
      ) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(new Error(message));
  }
);

// ── Auth helpers ──────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type?: string;
  user?: { id: string; username: string; email: string };
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  id: string;
  username: string;
  email: string;
}

export async function loginUser(
  email: string,
  password: string
): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/auth/login", {
    email: email,
    password: password,
  });
  return res.data;
}

export async function registerUser(
  payload: RegisterPayload
): Promise<RegisterResponse> {
  const res = await api.post<RegisterResponse>("/auth/register", payload);
  return res.data;
}

export function logoutUser() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
}

export function getStoredToken(): string | null {
  return localStorage.getItem("auth_token");
}

export function getStoredUser(): { id: string; username: string; email: string } | null {
  const raw = localStorage.getItem("auth_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default api;
