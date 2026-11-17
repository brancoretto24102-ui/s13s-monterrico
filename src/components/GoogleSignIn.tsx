import { useEffect, useState } from "react";
import { getGoogleAvailability, startGoogleLogin } from "../lib/googleLogin";
export default function GoogleSignIn({
  disabled,
  onError,
}: {
  disabled: boolean;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState("checking"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void getGoogleAvailability(abort.signal)
      .then((ready) => {
        if (!abort.signal.aborted) setStatus(ready ? "ready" : "unavailable");
      })
      .catch(() => {
        if (!abort.signal.aborted) setStatus("error");
      });
    return () => abort.abort();
  }, []);
  return (
    <div className="google-entry">
      <button
        type="button"
        className="secondary wide google-login"
        disabled={disabled || busy || status !== "ready"}
        onClick={() => {
          setBusy(true);
          onError("");
          void startGoogleLogin().catch((error: Error) => {
            setBusy(false);
            onError(error.message);
          });
        }}
      >
        <span className="google-letter" aria-hidden="true">
          G
        </span>
        {busy
          ? "Abriendo Google…"
          : status === "checking"
            ? "Comprobando Google…"
            : "Continuar con Google"}
      </button>
      <small>
        {status === "unavailable"
          ? "Google todavía no está habilitado. Puedes ingresar con tu contraseña."
          : status === "error"
            ? "No se pudo comprobar Google. Actualiza la página para intentarlo de nuevo."
            : "Usa el correo autorizado por tu administrador en Territorios."}
      </small>
    </div>
  );
}
