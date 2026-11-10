# Copias y recuperación

El Excel original permanece intacto y privado como respaldo de origen. La aplicación utiliza PostgreSQL para las operaciones posteriores, de modo que el Excel por sí solo no respalda los cambios nuevos.

## Qué conservar

1. Desde Configuración, descargar el respaldo JSON al terminar una jornada de cambios relevantes y antes de una migración. Incluye asignaciones vigentes y anuladas, catálogo, personas, perfiles, lotes, observaciones, conductores, cronogramas y auditoría, obtenidos de un snapshot consistente.
2. Guardar la plantilla original privada por separado; se reconoce por su hash documentado.
3. Conservar código y migraciones en el repositorio del propietario.
4. Para recuperación técnica completa, el propietario debe mantener además un volcado PostgreSQL de esquema y datos obtenido con las herramientas oficiales de Supabase/pg_dump. Auth y Storage requieren el procedimiento específico del proveedor; no asumir que un JSON de la aplicación contiene contraseñas, sesiones o los bytes del PDF.

Los respaldos contienen datos personales y UUID de usuarios. No guardarlos en GitHub Pages, repositorios públicos ni carpetas compartidas sin control. Conservar dos copias privadas, comprobar fechas y revisar periódicamente que puedan leerse. El CSV es útil para consulta, no sustituye el respaldo completo porque no contiene toda la auditoría y configuración.

## Recuperación controlada

1. Detener las escrituras y conservar una copia del estado dañado antes de hacer cambios.
2. Crear un proyecto/base de recuperación separado y vacío. No probar restauraciones sobre producción.
3. Restaurar el volcado completo siguiendo la documentación del proveedor. Si solo existe JSON, aplicar primero las migraciones y realizar una restauración administrativa revisada, preservando UUID, relaciones, versiones y procedencia. No usar el importador Excel para restaurar auditoría, perfiles o anulaciones.
4. Restablecer Auth por el mecanismo oficial y relacionar los perfiles con los usuarios correctos. Si los UUID de Auth cambian, preparar y revisar un mapa explícito de identidades para perfiles, actores y asignaciones. No sustituir personas automáticamente por coincidencia de nombre.
5. Cargar la plantilla privada y comprobar su hash. Conservar la auditoría histórica íntegra y añadir un evento administrativo de restauración. No alterar los motivos existentes ni tratarlos como nuevas operaciones ordinarias.
6. Comparar todas las asignaciones y anulaciones, recuentos por territorio, últimos cierres, auditoría y lotes con el respaldo. Ejecutar los baselines si corresponden a la versión histórica inicial y probar un nuevo ciclo de asignación/cierre con datos de prueba.
7. Con aprobación del propietario, cambiar la configuración del frontend al proyecto recuperado y comprobar usuarios y documentos antes de reanudar las escrituras.

La entrega no incluye un botón que restaure JSON sobre producción. Evita sobrescrituras y problemas con identidades de Auth; una restauración requiere revisión administrativa. Programar una prueba de recuperación antes de retirar definitivamente el Excel del proceso operativo.

Si el proyecto Free se pausa por inactividad, primero intentar reactivarlo desde Supabase; una pausa no implica por sí sola corrupción. Los plazos de conservación y posibilidades de restauración dependen de las políticas actuales del proveedor.

Fuentes: [respaldos Supabase](https://supabase.com/docs/guides/platform/backups), [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).
