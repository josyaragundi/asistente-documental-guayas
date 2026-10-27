import { useEffect, useState } from "react";
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
  const [resetToken, setResetToken] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const status = params.get("insforge_status");
    const type = params.get("insforge_type");
    if (token && (type === "reset_password" || status === "ready")) {
      setResetToken(token);
      setMode("reset");
      setNotice("Elige una nueva contraseña para tu cuenta.");
    } else if (status === "error" && type === "reset_password") {
      setError("El enlace de recuperación no es válido o ya venció. Solicita uno nuevo.");
      setMode("forgot");
    }
  }, []);

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
      if (mode === "forgot") {
        if (!otp) {
          const { error: resetError } = await insforge.auth.sendResetPasswordEmail({
            email: email.trim(),
            redirectTo: window.location.origin,
          });
          if (resetError) throw resetError;
          setResetCodeSent(true);
          setNotice("Revisa tu correo e ingresa el código de recuperación.");
        } else {
          const { data, error: exchangeError } = await insforge.auth.exchangeResetPasswordToken({
            email: email.trim(),
            code: otp,
          });
          if (exchangeError) throw exchangeError;
          setResetToken(data?.token || "");
          setOtp("");
          setMode("reset");
          setNotice("Código verificado. Crea tu nueva contraseña.");
        }
      } else if (mode === "reset") {
        if (password !== confirmPassword) throw new Error("Las contraseñas no coinciden.");
        const { error: resetError } = await insforge.auth.resetPassword({
          newPassword: password,
          otp: resetToken,
        });
        if (resetError) throw resetError;
        window.history.replaceState({}, document.title, window.location.pathname);
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
        setResetToken("");
        setNotice("Contraseña actualizada. Ya puedes iniciar sesión.");
      } else if (mode === "signup") {
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
            : mode === "signin" ? "Te damos la bienvenida"
              : mode === "forgot" ? "Recupera tu contraseña"
                : mode === "reset" ? "Crea una nueva contraseña"
                  : "Crea tu cuenta"}
        </h1>
        <p className="auth-subtitle">
          {verificationMethod === "code"
            ? "Escribe el código de 6 dígitos que enviamos a tu correo."
            : mode === "forgot" ? "Te enviaremos un código de recuperación a tu correo."
              : mode === "reset" ? "Usa al menos 8 caracteres para proteger tu cuenta."
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
          {verificationMethod === "code" || mode === "forgot" ? (
            <label>
              {mode === "forgot" ? "Código de recuperación" : "Código de verificación"}
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                minLength={6}
                maxLength={6}
                required={mode !== "forgot" || resetCodeSent}
              />
            </label>
          ) : mode !== "forgot" ? (
            <label>
              {mode === "reset" ? "Nueva contraseña" : "Contraseña"}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                required
              />
            </label>
          ) : null}
          {mode === "reset" && (
            <label>
              Confirmar contraseña
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
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
                : mode === "forgot"
                  ? resetCodeSent ? "Verificar código" : "Enviar código"
                  : mode === "reset"
                    ? "Guardar contraseña"
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
        {mode === "signin" && (
          <p className="auth-switch">
            <button type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}>
              ¿Olvidaste tu contraseña?
            </button>
          </p>
        )}
        {mode === "forgot" && (
          <p className="auth-switch">
            ¿No recibiste el código?{" "}
            <button type="button" onClick={() => { setOtp(""); setResetCodeSent(false); setNotice(""); setError(""); }} disabled={busy}>
              Reenviar código
            </button>
          </p>
        )}
        {verificationMethod !== "code" && mode !== "reset" && <p className="auth-switch">
          {mode === "signin" || mode === "forgot" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" || mode === "forgot" ? "signup" : "signin");
              setVerificationMethod(null);
              setError("");
              setNotice("");
            }}
          >
            {mode === "signin" || mode === "forgot" ? "Regístrate" : "Inicia sesión"}
          </button>
        </p>}
      </section>
    </main>
  );
}
