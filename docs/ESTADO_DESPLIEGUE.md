# Puesta en marcha — 10/11/2026

Sitio operativo: **https://brancoretto24102-ui.github.io/s13s-monterrico/**

Repositorio: https://github.com/brancoretto24102-ui/s13s-monterrico

La cuenta administrativa autorizada está activa. Se comprobó el inicio de sesión por contraseña desde la web, la consulta de los registros reales, la generación del PDF y la descarga del respaldo.

## Publicación y privacidad

- Código publicado sin Excel, nombres del historial, PDFs originales ni credenciales privadas.
- Validación inicial de GitHub Actions: `42757456725`. Validación de la actualización documental: `42759415552`, también correcta.
- Publicación manual de Pages: `42757845679`. Versión de aplicación publicada: `9ffbbc77439006ac286a02913492d111b601524d`.
- Pantalla de acceso y tablero autenticado comprobados en la dirección real.
- Proyecto Supabase `lexohsdrmgunjacocxtx`, en organización Free. No se contrató una suscripción ni se creó otro proyecto.

## Datos y acceso

- Cuatro migraciones aplicadas, 82 territorios y 820 asignaciones históricas. La actualización del maestro conserva exactamente los registros históricos; se comprobó su huella completa antes y después.
- Un único lote de importación. Una segunda carga no añadió registros.
- Cero diferencias en territorio, responsable, asignación, cierre, celda de origen y orden, comparando todos los registros con el Excel validado.
- Ajuste aprobado de T64 conservado: asignación y cierre el 29/08/2026, con exactamente una entrada de auditoría de migración.
- Primera cuenta invitada y activada tras la autorización expresa del propietario. Invitación aceptada e inicio de sesión por contraseña comprobado; no hay credenciales predeterminadas.
- Activación inicial e importación ejecutadas mediante la conexión administrativa autorizada. La importación utilizó el RPC con la identidad de la primera cuenta y guardó esa procedencia en el informe del lote.
- RLS en todas las tablas, sin escritura directa de asignaciones desde el cliente. Implementaciones privilegiadas en el esquema privado con comprobación de rol activo.
- URL de Auth y redirección exacta de Pages configuradas. Autorregistro y acceso anónimo desactivados; confirmación de correo y cambio seguro de contraseña activados; longitud mínima de 12 caracteres.
- Plantilla original guardada como `template/S-13_S.pdf` en `s13s-private`, con acceso público desactivado. La descarga privada funcionó durante la generación desde la web.
- Edge Function `invite-user` desplegada con verificación JWT y comprobación de administrador activo. No se dio acceso a otras personas.
- SMTP privado de Gmail activo con TLS en el puerto 465. El propietario introdujo la contraseña de aplicación directamente en el panel; la configuración se comprobó después de recargar.
- Prueba de recuperación al correo del propietario aceptada y registrada en Auth el 10/11/2026. Se mantiene una cuenta y 820 asignaciones. Ver [configuración del correo](CORREO.md).

## Verificaciones realizadas

- 15 pruebas unitarias y 90 comprobaciones PostgreSQL, incluida concurrencia real entre dos conexiones para territorios y conductores.
- En la base alojada: lector sin exportación, editor, lector con exportación, perfil inactivo y anónimo respetan sus permisos. Las modificaciones temporales de esas comprobaciones se revirtieron en la misma transacción; el administrador y el historial quedaron intactos.
- Los cuatro resultados de referencia coinciden también en producción: 739/217/11, 580/179/9, 81/82/5 y 250/101/6 (asignaciones/filas/páginas).
- Desde la web autenticada: informe 01/06/2026–10/11/2026 con 250 asignaciones, 101 filas y seis páginas.
- Los 931 campos de ese PDF coinciden con los datos esperados. Las palabras coinciden con la referencia aprobada actualizando explícitamente solo la fecha del encabezado del 09 al 10/11/2026. Ningún píxel cambió fuera de las zonas de relleno y encabezado. Fuente mínima: 8,1 puntos.
- Respaldo JSON descargado desde Configuración: 82 territorios, 820 asignaciones, un lote y la auditoría de T64; comparación completa con el historial validado sin diferencias.
- Menú y formulario revisados a 449 píxeles CSS de ancho, sin desbordamiento horizontal general. No se realizó una prueba en un teléfono físico.

Ver [evidencia de validación](VALIDACION.md) y [resultado agregado de la comprobación web](production-qa-2026-11-10.json).

## Maestro de conductores — versión 0.2.0

Se añadió el maestro administrativo para crear, editar, activar/desactivar, enviar a Papelera y restaurar conductores. El código individual evita confundir homónimos; se mantienen versiones, auditoría e historial. La selección de conductor registrado es opcional al asignar territorios. La base alojada contiene las funciones del maestro y las comprobaciones de rol correspondientes.

Se verificaron en la vista temporal todas las operaciones, búsqueda por código, selección al asignar y recuento del historial vinculado. No se crearon personas ficticias en producción. El maestro inicial está vacío: el administrador crea las fichas reales cuando corresponda; los 820 nombres históricos no se convierten en identidades automáticamente.

## Límites y siguientes incorporaciones

- El SMTP propio ya está configurado con la cuenta Gmail autorizada. Las invitaciones y recuperaciones utilizan ese servicio y sus cuotas. No se contrató un servicio de pago ni se dio acceso a destinatarios adicionales.
- Antes de incorporar personas, el administrador debe determinar sus identidades, roles y permiso de exportación. No compartir la cuenta inicial.
- El asesor de Auth informa que la comprobación de contraseñas filtradas no está habilitada; el panel ofrece ese control en Pro. Se conservó el plan gratuito y la política mínima de 12 caracteres. Los controles de RLS, privilegios y Storage se verificaron sin fallos. [Referencia del control](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- La recepción en el buzón, el cambio completo de contraseña por recuperación, dos sesiones reales editando simultáneamente y teléfonos físicos se comprobarán con los usuarios que se incorporen. El envío de recuperación por SMTP y el bloqueo con conexiones PostgreSQL independientes ya se verificaron.
- El respaldo descargable incluye datos y auditoría; Auth y la plantilla se conservan por separado. No se ejecutó una restauración sobre producción.

La operación básica está habilitada. Los insumos y resultados privados permanecen fuera de GitHub.
