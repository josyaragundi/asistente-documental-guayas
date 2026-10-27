import { useState } from "react";
import { insforge } from "./insforge.js";

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationMethod, setVerificationMethod] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!insforge) {
      setError("Falta configurar la URL o la clave pública de InsForge.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        const { data, error: authError } = await insforge.auth.signUp({
          email,
          password,
          name: name.trim() || undefined,
          redirectTo: window.location.origin,
        });
        if (authError) throw authError;
        if (data?.accessToken) {
          onAuthenticated(data.user);
        } else if (data?.requireEmailVerification && data?.verifyEmailMethod === "code") {
          setVerificationMethod("code");
          setNotice("Te enviamos un código de verificación por correo.");
        } else {
          setVerificationMethod("link");
          setMode("signin");
          setNotice("Revisa tu correo para verificar la cuenta y luego inicia sesión.");
        }
      } else {
        const { data, error: authError } = await insforge.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
        onAuthenticated(data.user);
      }
    } catch (authError) {
      const message = authError.message || "No se pudo completar la autenticación.";
      if (mode === "signin" && /email verification required/i.test(message)) {
        setVerificationMethod("code");
        setNotice("Tu correo todavía no está verificado. Ingresa el código de 6 dígitos que recibiste.");
        setError("");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data, error: verifyError } = await insforge.auth.verifyEmail({ email, otp });
      if (verifyError) throw verifyError;
      onAuthenticated(data.user);
    } catch (verifyError) {
      setError(verifyError.message || "No se pudo verificar el correo.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!insforge || !email.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: resendError } = await insforge.auth.resendVerificationEmail({
        email: email.trim(),
        redirectTo: window.location.origin,
      });
      if (resendError) throw resendError;
      setNotice("Te enviamos un nuevo código de verificación.");
    } catch (resendError) {
      setError(resendError.message || "No se pudo reenviar el código.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-mark" aria-hidden="true">✳</div>
        <h1>
          {verificationMethod === "code"
            ? "Verifica tu correo"
            : mode === "signin" ? "Te damos la bienvenida" : "Crea tu cuenta"}
        </h1>
        <p className="auth-subtitle">
          {verificationMethod === "code"
            ? "Escribe el código de 6 dígitos que enviamos a tu correo."
            : "Inicia sesión para guardar tus conversaciones."}
        </p>
        <form className="auth-form" onSubmit={verificationMethod === "code" ? verifyCode : handleSubmit}>
          {mode === "signup" && (
            <label>
              Nombre
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            Correo electrónico
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          {verificationMethod === "code" ? (
            <label>
              Código de verificación
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                minLength={6}
                maxLength={6}
                required
              />
            </label>
          ) : (
            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                required
              />
            </label>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy
              ? "Un momento…"
              : verificationMethod === "code"
                ? "Verificar correo"
                : mode === "signin"
                  ? "Iniciar sesión"
                  : "Crear cuenta"}
          </button>
        </form>
        {verificationMethod === "code" && (
          <p className="auth-switch">
            ¿No te llegó o venció el código?{" "}
            <button type="button" onClick={resendCode} disabled={busy}>
              Reenviar código
            </button>
          </p>
        )}
        {verificationMethod !== "code" && <p className="auth-switch">
          {mode === "signin" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setVerificationMethod(null);
              setError("");
              setNotice("");
            }}
          >
            {mode === "signin" ? "Regístrate" : "Inicia sesión"}
          </button>
        </p>}
      </section>
    </main>
  );
}
