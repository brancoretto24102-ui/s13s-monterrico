// Network-only: no se guardan sesiones, registros, mapas ni exportaciones.
// El alcance queda limitado al subdirectorio donde se publica la aplicación.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope)
  )
    return;
  event.respondWith(
    fetch(request).catch(
      () =>
        new Response(
          `<!doctype html><html lang="es"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="theme-color" content="#3da34b">
      <title>Sin conexión · Territorios Monterrico</title>
      <style>body{margin:0;background:#edf3e9;color:#19344f;font:16px system-ui;min-height:100vh;display:grid;place-items:center}main{max-width:28rem;margin:1.5rem;padding:2rem;background:white;border-radius:16px}h1{font-size:1.6rem}p{line-height:1.6}a{display:inline-block;background:#31833c;color:white;padding:.8rem 1.2rem;border-radius:8px;text-decoration:none}</style>
      <main><p>Territorios · Monterrico</p><h1>Necesitas conexión a internet</h1>
      <p>Conéctate para iniciar sesión, consultar los territorios y guardar cambios.</p>
      <a href="./">Reintentar</a></main></html>`,
          {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
              "Content-Security-Policy":
                "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
            },
          },
        ),
    ),
  );
});
