import { useState } from "react";
import { MapPinned, ArrowRight, ShieldCheck, LockKeyhole } from "lucide-react";
import { configured, supabase } from "../lib/client";
import {
  MIN_PASSWORD_LENGTH,
  validPassword,
  validateNewPassword,
} from "../lib/passwordPolicy";
import PasswordRequirements from "./PasswordRequirements";
import InstallApp from "./InstallApp";
import { temporaryPasswordRequest } from "../lib/temporaryPassword";
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
    [reset, setReset] = useState(false),
    [temporary, setTemporary] = useState(false),
    [challenge, setChallenge] = useState<string | null>(null);
  const changing = recovery || !!challenge;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      if (!supabase)
        throw new Error(
          "La conexión con Supabase está pendiente de configuración.",
        );
      if (challenge) {
        validateNewPassword(password, confirmation);
        await temporaryPasswordRequest({
          action: "complete",
          challenge,
          password,
          confirmation,
        });
        setChallenge(null);
        setTemporary(false);
        setPassword("");
        setConfirmation("");
        setNotice(
          "Contraseña personal guardada. Inicia sesión con tu nueva contraseña.",
        );
      } else if (temporary && !reset) {
        const result = await temporaryPasswordRequest<{ challenge: string }>({
          action: "start",
          email,
          temporary_password: password,
        });
        if (!/^[0-9a-f]{64}$/.test(result.challenge))
          throw new Error("No se pudo iniciar el cambio de contraseña.");
        setChallenge(result.challenge);
        setPassword("");
        setConfirmation("");
      } else if (recovery) {
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
        <InstallApp />
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
            {changing
              ? "Establece tu contraseña"
              : reset
                ? "Recupera tu acceso"
                : temporary
                  ? "Ingresa con tu clave temporal"
                  : "Bienvenido de nuevo"}
          </h2>
          <p>
            {configured
              ? changing
                ? "Define una contraseña personal y confirma que coincida."
                : temporary
                  ? "Esta clave solo permite crear tu contraseña personal; todavía no da acceso a los datos."
                  : "Ingresa con el correo autorizado por tu administrador."
              : "La aplicación está lista para conectar con tu proyecto Supabase."}
          </p>
          <form onSubmit={submit}>
            {!changing && (
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
                {changing
                  ? "Nueva contraseña"
                  : temporary
                    ? "Clave temporal"
                    : "Contraseña"}
                <input
                  type="password"
                  autoComplete={
                    changing
                      ? "new-password"
                      : temporary
                        ? "off"
                        : "current-password"
                  }
                  minLength={changing ? MIN_PASSWORD_LENGTH : 1}
                  maxLength={changing || temporary ? 128 : undefined}
                  aria-describedby={
                    changing ? "password-requirements" : undefined
                  }
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                />
              </label>
            )}
            {changing && (
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
                (changing &&
                  (!validPassword(password) || password !== confirmation))
              }
            >
              {busy
                ? "Procesando…"
                : changing
                  ? "Guardar contraseña"
                  : reset
                    ? "Enviar enlace"
                    : temporary
                      ? "Validar clave temporal"
                      : "Iniciar sesión"}
              <ArrowRight size={17} />
            </button>
          </form>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {!changing && (
            <button
              className="text-button"
              onClick={() => {
                setReset(!reset);
                setTemporary(false);
                setPassword("");
                setConfirmation("");
                setNotice("");
              }}
            >
              {reset ? "Volver al inicio de sesión" : "Olvidé mi contraseña"}
            </button>
          )}
          {!recovery && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setChallenge(null);
                setTemporary(!temporary);
                setReset(false);
                setPassword("");
                setConfirmation("");
                setNotice("");
              }}
            >
              {challenge
                ? "Cancelar cambio"
                : temporary
                  ? "Volver al inicio de sesión"
                  : "Tengo una clave temporal"}
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
