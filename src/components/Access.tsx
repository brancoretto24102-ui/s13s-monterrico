import { useState } from "react";
import { MapPinned, ArrowRight, ShieldCheck, LockKeyhole } from "lucide-react";
import { configured, supabase } from "../lib/client";
import {
  MIN_PASSWORD_LENGTH,
  validPassword,
  validateNewPassword,
} from "../lib/passwordPolicy";
import PasswordRequirements from "./PasswordRequirements";
export default function Access({
  onDemo,
  recovery,
  onRecovered,
  onPasswordUpdateRequired,
}: {
  onDemo: () => void;
  recovery: boolean;
  onRecovered: () => void;
  onPasswordUpdateRequired: () => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [reset, setReset] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      if (!supabase)
        throw new Error(
          "La conexión con Supabase está pendiente de configuración.",
        );
      if (recovery) {
        validateNewPassword(password, confirmation);
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        setConfirmation("");
        setNotice("Contraseña actualizada.");
        onRecovered();
      } else if (reset) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + location.pathname,
        });
        if (error) throw error;
        setNotice(
          "Si el correo está autorizado, recibirá un enlace para recuperar el acceso.",
        );
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error)
          throw new Error(
            "No se pudo iniciar sesión. Verifique el correo y la contraseña.",
          );
        if (data.weakPassword || !validPassword(password)) {
          setPassword("");
          setConfirmation("");
          setNotice(
            "Actualiza tu contraseña para cumplir los requisitos de seguridad.",
          );
          onPasswordUpdateRequired();
        }
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="access">
      <section className="access-story">
        <div className="brand">
          <span className="brand-mark">
            <MapPinned />
          </span>
          <span>
            Territorios<small>MONTERRICO</small>
          </span>
        </div>
        <div className="access-copy">
          <span className="eyebrow">REGISTRO S-13-S</span>
          <h1>
            Un registro.
            <br />
            Todos en sintonía.
          </h1>
          <p>
            Asigna, consulta el historial y prepara tus formularios desde un
            mismo lugar.
          </p>
          <div className="access-points">
            <ShieldCheck />
            <span>Acceso reservado para usuarios autorizados</span>
          </div>
        </div>
        <span className="access-footer">
          Organización sencilla, información al día.
        </span>
      </section>
      <section className="access-form">
        <div className="login-card">
          <span className="login-icon">
            <LockKeyhole size={25} />
          </span>
          <h2>
            {recovery
              ? "Establece tu contraseña"
              : reset
                ? "Recupera tu acceso"
                : "Bienvenido de nuevo"}
          </h2>
          <p>
            {configured
              ? recovery
                ? "Define una contraseña personal y confirma que coincida."
                : "Ingresa con el correo autorizado por tu administrador."
              : "La aplicación está lista para conectar con tu proyecto Supabase."}
          </p>
          <form onSubmit={submit}>
            {!recovery && (
              <label>
                Correo electrónico
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@correo.com"
                />
              </label>
            )}
            {!reset && (
              <label>
                Contraseña
                <input
                  type="password"
                  autoComplete={recovery ? "new-password" : "current-password"}
                  minLength={recovery ? MIN_PASSWORD_LENGTH : 1}
                  aria-describedby={
                    recovery ? "password-requirements" : undefined
                  }
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                />
              </label>
            )}
            {recovery && (
              <>
                <PasswordRequirements password={password} />
                <label>
                  Confirma tu contraseña
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    aria-describedby={
                      confirmation && confirmation !== password
                        ? "password-confirmation"
                        : undefined
                    }
                  />
                </label>
                {confirmation && confirmation !== password && (
                  <p
                    id="password-confirmation"
                    className="password-mismatch"
                    role="status"
                  >
                    Las contraseñas no coinciden.
                  </p>
                )}
              </>
            )}
            <button
              className="primary wide"
              disabled={
                busy ||
                !configured ||
                (recovery &&
                  (!validPassword(password) || password !== confirmation))
              }
            >
              {busy
                ? "Procesando…"
                : recovery
                  ? "Guardar contraseña"
                  : reset
                    ? "Enviar enlace"
                    : "Iniciar sesión"}
              <ArrowRight size={17} />
            </button>
          </form>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {!recovery && (
            <button
              className="text-button"
              onClick={() => {
                setReset(!reset);
                setNotice("");
              }}
            >
              {reset ? "Volver al inicio de sesión" : "Olvidé mi contraseña"}
            </button>
          )}
          <div className="login-divider" />
          <button className="secondary wide" onClick={onDemo}>
            Explorar con datos ficticios
          </button>
          <small className="muted">
            La vista de ejemplo es temporal y no utiliza datos personales.
          </small>
        </div>
      </section>
    </main>
  );
}
