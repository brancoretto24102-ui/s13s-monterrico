# Instalar Territorios Monterrico

La aplicación se puede instalar desde el sitio habitual:
https://brancoretto24102-ui.github.io/s13s-monterrico/

## Android

1. Abre el sitio en Brave o Chrome, fuera del modo privado.
2. Pulsa **Instalar aplicación** en la pantalla de acceso o el icono de descarga de la barra superior.
3. Si aparece **Instalar ahora**, púlsalo y confirma el aviso del navegador.
4. También puedes usar el menú del navegador: **Instalar aplicación** o **Instalar y crear acceso directo → Instalar**.
5. Abre **Territorios** desde el icono del teléfono.

Si Brave no ofrece instalar o informa que no está disponible, prueba el mismo enlace en Chrome. La posibilidad de instalar depende también del navegador y del dispositivo. No se probó un teléfono físico.

## iPhone

Abre el sitio en Safari y usa **Compartir → Añadir a pantalla de inicio → Añadir**.

## Uso

- El icono abre una ventana independiente en los navegadores compatibles.
- Se usa la misma cuenta, los mismos permisos y la misma base centralizada.
- Necesita internet para iniciar sesión, consultar y guardar. Al abrir sin conexión muestra una pantalla para reintentar.
- Las actualizaciones se reciben desde el sitio; no hay que distribuir un APK por cada cambio.
- La sesión continúa en memoria: abrir de nuevo o recargar puede requerir iniciar sesión. La instalación no guarda contraseñas ni habilita un acceso nuevo.
- El botón se oculta al abrir desde una ventana instalada compatible.

## Implementación

Se agrega un manifiesto con `display: standalone`, identidad estable, inicio y alcance relativos al directorio de publicación. Incluye iconos PNG de 192 y 512 píxeles, un icono adaptable de 512 y uno de 180 para Apple, rasterizados desde el SVG existente.

El service worker solo intercepta navegaciones GET dentro del directorio de la aplicación. Utiliza la red y entrega una respuesta genérica si falla la conexión. No implementa caché de sesiones, registros, mapas, archivos o respuestas de Supabase. No se cambia la base alojada ni se crea una aplicación Android nativa.

El diálogo de instalación respeta la decisión del usuario. La aceptación del aviso no se anuncia como instalación completada: se espera al evento del navegador. En navegadores sin aviso programático se muestran instrucciones manuales.

## Validación

`npm test` comprueba los eventos de instalación, aceptación/cancelación/error, apertura independiente, rutas de raíz y subdirectorio, manifiesto e iconos reales, navegación actualizada y respuesta sin conexión, además de la ausencia de interceptación de API o escrituras. `npm run check:public` comprueba también los archivos PWA compilados y su alcance de publicación.
