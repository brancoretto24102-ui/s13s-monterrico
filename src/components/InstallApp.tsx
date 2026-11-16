import { useState, useSyncExternalStore } from "react";
import { Download, Smartphone } from "lucide-react";
import Modal from "./Modal";
import {
  getInstallationState,
  requestInstallation,
  subscribeInstallation,
} from "../lib/pwa";
import "./InstallApp.css";

export default function InstallApp({ compact = false }: { compact?: boolean }) {
  const { available, installed } = useSyncExternalStore(
    subscribeInstallation,
    getInstallationState,
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  if (installed) return null;

  async function install() {
    setBusy(true);
    const result = await requestInstallation();
    setBusy(false);
    if (result === "accepted") {
      setOpen(false);
      setNotice("");
    } else if (result === "dismissed") {
      setNotice(
        "Cancelaste la instalación. Puedes volver a intentarlo desde el menú del navegador.",
      );
    } else {
      setNotice(
        "Usa la opción de instalar del menú del navegador siguiendo estos pasos.",
      );
    }
  }
  return (
    <>
      {compact ? (
        <button
          className="icon pwa-compact"
          type="button"
          title="Instalar aplicación"
          aria-label="Instalar aplicación"
          onClick={() => setOpen(true)}
        >
          <Download size={18} />
        </button>
      ) : (
        <div className="pwa-card">
          <Smartphone size={24} aria-hidden="true" />
          <div>
            <strong>Territorios en tu móvil</strong>
            <p>Ábrelo desde su icono, como una aplicación.</p>
            <button
              type="button"
              className="secondary"
              onClick={() => setOpen(true)}
            >
              <Download size={16} /> Instalar aplicación
            </button>
          </div>
        </div>
      )}
      {open && (
        <Modal
          title="Instalar Territorios"
          onClose={() => setOpen(false)}
          className="pwa-dialog"
        >
          <div className="pwa-identity">
            <img
              src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
              width="56"
              height="56"
              alt=""
            />
            <div>
              <strong>Territorios Monterrico</strong>
              <p>La misma cuenta y tus datos al día.</p>
            </div>
          </div>
          {available && (
            <button
              type="button"
              className="primary wide"
              disabled={busy}
              onClick={() => void install()}
            >
              <Download size={17} />{" "}
              {busy ? "Abriendo instalación…" : "Instalar ahora"}
            </button>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <ol className="pwa-steps">
            <li>
              <strong>Android · Brave o Chrome</strong>
              <p>
                Abre el menú ⋮ y elige <b>Instalar aplicación</b> o{" "}
                <b>Instalar y crear acceso directo → Instalar</b>.
              </p>
            </li>
            <li>
              <strong>iPhone · Safari</strong>
              <p>
                Pulsa <b>Compartir → Añadir a pantalla de inicio → Añadir</b>.
              </p>
            </li>
            <li>
              <strong>Computadora</strong>
              <p>
                Usa el icono de instalar en la barra de direcciones o la opción
                de instalar del menú.
              </p>
            </li>
          </ol>
          <p className="pwa-connection">
            Necesitas internet para iniciar sesión, consultar y guardar. Las
            actualizaciones llegan al abrir la aplicación.
          </p>
          <p className="muted">
            Si solo aparece un acceso directo o la instalación no está
            disponible en Brave, abre este mismo sitio en Chrome e inténtalo
            allí.
          </p>
        </Modal>
      )}
    </>
  );
}
