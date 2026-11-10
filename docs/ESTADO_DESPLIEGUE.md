# Puesta en marcha — 09/11/2026

El propietario autorizó continuar con la puesta en marcha. Esta actualización registra lo ejecutado realmente y lo que permanece pendiente.

## Supabase configurado

- Proyecto seleccionado: `lexohsdrmgunjacocxtx`, ya existente y vacío antes de configurar.
- Organización en plan Free. No se creó una suscripción ni un proyecto adicional.
- Tres migraciones aplicadas y archivos locales alineados con los identificadores devueltos por el historial del servicio.
- 82 territorios creados. Cero asignaciones históricas y cero usuarios de la aplicación al cierre de esta etapa.
- Todas las tablas de la aplicación tienen RLS. Los clientes no pueden escribir directamente las asignaciones.
- Implementaciones con privilegios en el esquema privado; los RPC públicos son envoltorios sin privilegios elevados y mantienen las mismas firmas.
- Bucket `s13s-private` creado con acceso público desactivado. El PDF original todavía no se ha cargado.
- Edge Function `invite-user` desplegada con verificación de JWT activada y comprobación adicional del administrador activo. El despliegue no envió invitaciones.
- Revisión de seguridad de la base: cero avisos después del ajuste. Las observaciones de rendimiento restantes indican índices todavía sin uso, normal antes de cargar registros. Referencia: [índices sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Pruebas HTTP reales: consulta de asignaciones, snapshot e invitación devuelven 401 sin autenticar.
- Pruebas locales ampliadas: 15 unitarias y 43 comprobaciones en PostgreSQL, incluida concurrencia entre dos conexiones.

## Configuración publicable

`config/public.json` solo contiene datos que pueden estar en el cliente: endpoint, clave publicable, origen y subruta prevista del sitio. No contiene contraseñas ni una clave `service_role`. El workflow de Pages carga esos valores automáticamente y valida la configuración antes de construir.

## Pendiente

1. Completar el acceso web a GitHub para crear el repositorio `s13s-monterrico`. La integración de GitHub está conectada, pero todavía no tiene repositorios y no ofrece una operación para crearlos.
2. Subir el código, ejecutar validación y configurar/publicar Pages.
3. Configurar las URL de Auth, desactivar el autorregistro público y preparar la primera cuenta administrativa por un flujo controlado. Los perfiles nuevos nacen inactivos y sin permisos, por lo que no pueden leer el registro aunque se registren mientras se termina esta configuración.
4. Preparar correo para recuperación e invitaciones; el correo incorporado de Supabase tiene restricciones de destinatarios y frecuencia. No dar acceso a otras personas sin que el propietario indique quiénes son.
5. Cargar la plantilla y aprobar/importar las 820 asignaciones históricas mediante la sesión administrativa, conservando el ajuste de T64 y su auditoría.
6. Verificar roles, actualización entre dos navegadores, exportación desde la web, respaldo y un teléfono real antes de declarar terminada la activación.

La conexión a Supabase ya está realizada. La aplicación aún no tiene una URL de producción comprobada y el historial original permanece fuera del repositorio.
