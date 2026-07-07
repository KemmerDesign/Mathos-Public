import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../services/api";

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Validaciones
    if (!username.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError("Completa todos los campos");
      return;
    }

    if (username.trim().length < 3) {
      setError("El nombre de usuario debe tener al menos 3 caracteres");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await registerUser({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      // Redirigir a login después del registro exitoso
      navigate("/login?registered=1");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al registrarse";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--sepia-bg)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          borderRadius: 20,
          border: "1px solid var(--sepia-border)",
          padding: "32px 28px",
          boxShadow: "0 20px 50px -24px rgba(60,40,30,.35)",
        }}
      >
        {/* Logo / Title */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                position: "relative",
                width: 44,
                height: 44,
                borderRadius: 14,
                background:
                  "radial-gradient(125% 115% at 30% 22%, #9A7CF4 0%, #6A45DE 52%, #B85C97 128%)",
                boxShadow:
                  "inset 0 2px 4px rgba(255,255,255,.5), inset 0 -4px 7px rgba(50,22,100,.4), 0 9px 18px -7px rgba(106,69,222,.8)",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 5,
                  left: 7,
                  width: 24,
                  height: 16,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 40% 35%, rgba(255,255,255,.7), rgba(255,255,255,0) 70%)",
                }}
              />
              <svg
                width="44"
                height="44"
                viewBox="0 0 40 40"
                fill="none"
                style={{ position: "absolute", inset: 0 }}
              >
                <path
                  d="M8 23.5 L19 20.5 Q21.2 19.8 22 17.2 L31 8 L27.8 19 Q31.6 21.6 30 26.6 Q27.4 31.6 21 30 L18 24.5 L10.2 24.5 Q6.6 24 8 23.5 Z"
                  fill="#fff"
                />
                <path
                  d="M24 14 L29.6 8.8"
                  stroke="#7FD8FF"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <circle cx="19.6" cy="19.6" r="2.5" fill="#2A9FE6" />
                <circle cx="19.6" cy="19.6" r="1.1" fill="#EAFBFF" />
              </svg>
            </div>
            <span
              style={{
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "-.03em",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                color: "var(--sepia-text)",
              }}
            >
              Math<span style={{ color: "#6A45DE" }}>ó</span>s
            </span>
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--sepia-text-secondary)",
              margin: 0,
            }}
          >
            Crea tu cuenta para empezar
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#DC2626",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 16,
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        {/* Success banner if redirected from login */}
        {new URLSearchParams(window.location.search).get("registered") === "1" && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "#ECFDF5",
              border: "1px solid #A7F3D0",
              color: "#059669",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 16,
              lineHeight: 1.4,
            }}
          >
            ✓ Registro exitoso. Ahora puedes iniciar sesión.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--sepia-text)",
                marginBottom: 5,
              }}
            >
              Nombre de usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="usuario123"
              autoComplete="username"
              autoFocus
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1.5px solid var(--sepia-border)",
                background: "var(--sepia-bg)",
                fontSize: 14,
                color: "var(--sepia-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#6A45DE";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--sepia-border)";
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--sepia-text)",
                marginBottom: 5,
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1.5px solid var(--sepia-border)",
                background: "var(--sepia-bg)",
                fontSize: 14,
                color: "var(--sepia-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#6A45DE";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--sepia-border)";
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--sepia-text)",
                marginBottom: 5,
              }}
            >
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1.5px solid var(--sepia-border)",
                background: "var(--sepia-bg)",
                fontSize: 14,
                color: "var(--sepia-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#6A45DE";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--sepia-border)";
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--sepia-text)",
                marginBottom: 5,
              }}
            >
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              autoComplete="new-password"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1.5px solid var(--sepia-border)",
                background: "var(--sepia-bg)",
                fontSize: 14,
                color: "var(--sepia-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#6A45DE";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--sepia-border)";
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: 12,
              border: "none",
              background: loading
                ? "#C4B5E3"
                : "linear-gradient(135deg, #7C3AED 0%, #6A45DE 100%)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all .15s",
              boxShadow: loading
                ? "none"
                : "0 6px 16px -6px rgba(106,69,222,.5)",
            }}
          >
            {loading ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </form>

        {/* Link to login */}
        <div
          style={{
            textAlign: "center",
            marginTop: 20,
            fontSize: 13,
            color: "var(--sepia-text-secondary)",
          }}
        >
          ¿Ya tienes cuenta?{" "}
          <Link
            to="/login"
            style={{
              color: "#6A45DE",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
