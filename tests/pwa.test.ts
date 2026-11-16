import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

describe("Instalación de Territorios", () => {
  let target: EventTarget & {
    matchMedia: () => unknown;
    location: { origin: string };
    isSecureContext: boolean;
  };
  let display: EventTarget & { matches: boolean };
  let register: ReturnType<typeof vi.fn>;
  let pwa: typeof import("../src/lib/pwa");
  let cleanup: (() => void) | undefined;
  beforeEach(async () => {
    vi.resetModules();
    display = Object.assign(new EventTarget(), { matches: false });
    target = Object.assign(new EventTarget(), {
      matchMedia: () => display,
      location: { origin: "https://example.test" },
      isSecureContext: true,
    });
    register = vi.fn().mockResolvedValue({});
    vi.stubGlobal("window", target);
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    pwa = await import("../src/lib/pwa");
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  function prompt(outcome: "accepted" | "dismissed" = "accepted") {
    const event = Object.assign(
      new Event("beforeinstallprompt", { cancelable: true }),
      {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome }),
      },
    );
    target.dispatchEvent(event);
    return event;
  }
  it("registra el worker dentro del subdirectorio de GitHub Pages", () => {
    cleanup = pwa.initializePwa("/s13s-monterrico/", true);
    expect(register).toHaveBeenCalledOnce();
    expect(String(register.mock.calls[0][0])).toBe(
      "https://example.test/s13s-monterrico/sw.js",
    );
    expect(register.mock.calls[0][1]).toEqual({
      scope: "/s13s-monterrico/",
      updateViaCache: "none",
    });
  });
  it("permite servir también desde raíz y no registra en desarrollo", () => {
    cleanup = pwa.initializePwa("/", false);
    expect(register).not.toHaveBeenCalled();
    cleanup();
    cleanup = pwa.initializePwa("/", true);
    expect(String(register.mock.calls[0][0])).toBe(
      "https://example.test/sw.js",
    );
  });
  it("captura el aviso antes de montar la interfaz y lo consume una sola vez", async () => {
    cleanup = pwa.initializePwa("/", false);
    const event = prompt();
    const subscriber = vi.fn();
    const unsubscribe = pwa.subscribeInstallation(subscriber);
    expect(event.defaultPrevented).toBe(true);
    expect(pwa.getInstallationState()).toEqual({
      installed: false,
      available: true,
    });
    expect(await pwa.requestInstallation()).toBe("accepted");
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(await pwa.requestInstallation()).toBe("unavailable");
    // Aceptar el aviso no se anuncia como instalación terminada.
    expect(pwa.getInstallationState().installed).toBe(false);
    target.dispatchEvent(new Event("appinstalled"));
    expect(pwa.getInstallationState()).toEqual({
      installed: true,
      available: false,
    });
    expect(subscriber).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  it("respeta la cancelación y los errores del diálogo nativo", async () => {
    cleanup = pwa.initializePwa("/", false);
    prompt("dismissed");
    expect(await pwa.requestInstallation()).toBe("dismissed");
    const event = prompt();
    event.prompt.mockRejectedValueOnce(new Error("blocked"));
    expect(await pwa.requestInstallation()).toBe("failed");
    expect(pwa.getInstallationState().installed).toBe(false);
  });
  it("oculta la instalación cuando se abre como app, también en iOS", () => {
    vi.stubGlobal("navigator", { standalone: true });
    cleanup = pwa.initializePwa("/", true);
    expect(register).not.toHaveBeenCalled();
    expect(pwa.getInstallationState().installed).toBe(true);
  });
  it("reacciona al cambio a ventana independiente y limpia escuchas", () => {
    cleanup = pwa.initializePwa("/", false);
    display.matches = true;
    display.dispatchEvent(new Event("change"));
    expect(pwa.getInstallationState().installed).toBe(true);
    cleanup();
    const event = prompt();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("Manifiesto e iconos", () => {
  const manifest = JSON.parse(
    readFileSync("public/manifest.webmanifest", "utf8"),
  );
  it("tiene una identidad estable y rutas portables, con ventana independiente", () => {
    expect(manifest.name).toBe("Territorios Monterrico");
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("./");
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.prefer_related_applications).toBe(false);
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain(
      'rel="manifest" href="%BASE_URL%manifest.webmanifest"',
    );
  });
  it("incluye PNG reales de 192 y 512 píxeles y un icono adaptable", () => {
    for (const icon of manifest.icons) {
      const png = readFileSync(`public/${icon.src}`);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(
        icon.sizes,
      );
    }
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    expect(
      manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable"),
    ).toBe(true);
  });
});

describe("Worker sin almacenamiento de registros", () => {
  function worker(fetcher: ReturnType<typeof vi.fn>) {
    const handlers = new Map<string, (event: any) => void>();
    runInNewContext(readFileSync("public/sw.js", "utf8"), {
      self: {
        addEventListener: (name: string, handler: (event: any) => void) =>
          handlers.set(name, handler),
        location: { origin: "https://example.test" },
        registration: { scope: "https://example.test/s13s-monterrico/" },
        skipWaiting: () => Promise.resolve(),
        clients: { claim: () => Promise.resolve() },
      },
      fetch: fetcher,
      URL,
      Response,
      // No se ofrece Cache API: cualquier intento de caché haría fallar la prueba.
    });
    return handlers.get("fetch")!;
  }
  it("entrega la respuesta de red actual para la navegación", async () => {
    const response = new Response("current");
    const fetcher = vi.fn().mockResolvedValue(response);
    const respondWith = vi.fn();
    worker(fetcher)({
      request: {
        url: "https://example.test/s13s-monterrico/",
        mode: "navigate",
        method: "GET",
      },
      respondWith,
    });
    expect(await respondWith.mock.calls[0][0]).toBe(response);
  });
  it("ofrece una pantalla clara sin conexión y sin datos de usuarios", async () => {
    const respondWith = vi.fn();
    worker(vi.fn().mockRejectedValue(new Error("offline")))({
      request: {
        url: "https://example.test/s13s-monterrico/",
        mode: "navigate",
        method: "GET",
      },
      respondWith,
    });
    const response: Response = await respondWith.mock.calls[0][0];
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("Necesitas conexión a internet");
  });
  it("no intercepta API, escrituras, archivos ni otras aplicaciones del dominio", () => {
    const fetcher = vi.fn();
    const handler = worker(fetcher);
    for (const request of [
      {
        url: "https://project.supabase.co/rest/v1/territories",
        mode: "cors",
        method: "GET",
      },
      {
        url: "https://example.test/s13s-monterrico/",
        mode: "navigate",
        method: "POST",
      },
      {
        url: "https://example.test/s13s-monterrico/assets/app.js",
        mode: "cors",
        method: "GET",
      },
      { url: "https://example.test/other/", mode: "navigate", method: "GET" },
    ]) {
      const respondWith = vi.fn();
      handler({ request, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
