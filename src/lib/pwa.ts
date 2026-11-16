interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export interface InstallationState {
  available: boolean;
  installed: boolean;
}
export type InstallationResult =
  "accepted" | "dismissed" | "unavailable" | "failed";

let pending: InstallPromptEvent | null = null;
let state: InstallationState = { available: false, installed: false };
const listeners = new Set<() => void>();

function update(next: InstallationState) {
  state = next;
  for (const listener of listeners) listener();
}
export const getInstallationState = () => state;
export function subscribeInstallation(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function requestInstallation(): Promise<InstallationResult> {
  const event = pending;
  if (!event) return "unavailable";
  pending = null;
  update({ ...state, available: false });
  try {
    // Se invoca directamente desde el botón para conservar el gesto del usuario.
    await event.prompt();
    return (await event.userChoice).outcome;
  } catch {
    return "failed";
  }
}

export function initializePwa(base: string, production: boolean) {
  const display = window.matchMedia("(display-mode: standalone)");
  const standalone = () =>
    display.matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  update({ available: false, installed: standalone() });
  const onPrompt = (event: Event) => {
    event.preventDefault();
    pending = event as InstallPromptEvent;
    update({ installed: standalone(), available: !standalone() });
  };
  const onInstalled = () => {
    pending = null;
    update({ available: false, installed: true });
  };
  const onDisplay = () => {
    if (standalone()) onInstalled();
    else update({ installed: false, available: Boolean(pending) });
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  display.addEventListener("change", onDisplay);

  if (production && window.isSecureContext && "serviceWorker" in navigator) {
    const scope = new URL(base, window.location.origin);
    void navigator.serviceWorker
      .register(new URL("sw.js", scope), {
        scope: scope.pathname,
        updateViaCache: "none",
      })
      .catch(() => {
        // El acceso web continúa disponible si el navegador bloquea la instalación.
        console.warn("No se pudo preparar la instalación de Territorios.");
      });
  }
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
    display.removeEventListener("change", onDisplay);
  };
}
