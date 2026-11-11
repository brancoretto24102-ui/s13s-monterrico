# Validación de la aplicación

La documentación pública describe las comprobaciones reproducibles con datos sintéticos. Los insumos originales, los resultados con nombres y los detalles de infraestructura se conservan fuera del repositorio.

## Pruebas automatizadas

- 38 pruebas unitarias: fechas, día peruano, año de servicio, rangos, actualidad, cierres al corte, historial previo, continuidad, previsualización de errores Excel y plazos de asignación con excepciones justificadas.
- 281 comprobaciones PostgreSQL: permisos, acceso anónimo e inactivo, roles, reglas de fechas, plazos y excepciones, conflictos de versión, auditoría, importación atómica, deduplicación, crecimiento del catálogo, respaldo, historial con más de mil registros y acceso privado a la plantilla.
- Ejecución con PostgreSQL 17 en la validación automática y PostgreSQL 18.6 en la validación local.
- Compilación TypeScript/Vite y revisión del paquete público aprobadas. La auditoría de dependencias de producción no detectó vulnerabilidades conocidas en esta entrega; ese resultado depende de los avisos disponibles en la fecha de ejecución.

Las pruebas de base de datos se ejecutan únicamente sobre una base vacía y desechable. El esquema de Auth/Storage se emula para verificar SQL y políticas; no equivale por sí solo a probar el servicio alojado completo.

## Maestro de conductores (0.2.0)

Se comprobaron altas idempotentes, homónimos con códigos independientes, edición, activación/desactivación, papelera/restauración, motivos, auditoría, respaldo, metadatos inmutables y prohibición de borrado físico. Editor, lector, anónimo y perfil inactivo no pueden gestionar el maestro.

Dos conexiones administrativas intentan modificar la misma versión de una ficha: una confirma y la otra recibe un conflicto. Se rechazan versiones nulas u obsoletas y selecciones de fichas que dejaron de estar activas.

Se comprobó que editar una ficha conserva los nombres históricos, que se pueden completar asignaciones anteriores de conductores inactivos y que una corrección manual del nombre de un responsable retira el vínculo anterior con el maestro. Las correcciones solo de fechas conservan ese vínculo.

En navegador, con datos ficticios temporales: crear, editar, desactivar, eliminar, filtrar Papelera, restaurar a inactivo, activar, buscar por código y seleccionar al asignar un territorio. El maestro muestra el recuento de la asignación vinculada y su estado pendiente.

En la web se comprobó el acceso administrativo, la carga del maestro y la apertura/cancelación del formulario Nuevo conductor. Estas comprobaciones no crearon personas ficticias en el catálogo operativo. El historial existente se verificó antes y después de la migración sin cambios en sus registros.

## Formulario e importación

Las comprobaciones previas del formulario contrastaron textos, fechas, continuaciones, encabezados y distribución con la referencia aprobada. Se verificó que no hubiera cambios fuera de las zonas de relleno y encabezado. Los resultados detallados contienen información personal y no se redistribuyen.

La importación se comprobó con conciliación por registro y repetición del archivo sin duplicados. Las reglas de fechas, continuidad y previsualización también tienen pruebas automatizadas con datos sintéticos. El motor PDF no se modificó en la actualización del maestro.

## Interfaz y límites

Se probaron en navegador de escritorio el tablero, historial, búsqueda, asignación, cierre, validaciones y formulario PDF. La actualización del maestro se revisó además con un ancho aproximado de 450 píxeles CSS, incluidos su listado y formulario. Las tablas amplias tienen desplazamiento propio.

No se probó un teléfono físico. La actualización visual entre dos sesiones de usuarios reales y la restauración completa en un entorno separado siguen siendo comprobaciones complementarias; los conflictos de escritura sí se comprobaron con conexiones PostgreSQL independientes.

Los controles automáticos de publicación ayudan a detectar archivos privados y credenciales, pero no sustituyen la revisión del contenido. No se deben añadir al repositorio los libros originales, PDFs con datos personales ni secretos.

## Perfiles, usuarios e interfaz (0.3.0)

Las pruebas añadidas comprueban acceso granular, unión de perfiles, ausencia de herencia básica al revocar perfiles personalizados, restricciones de tablas y snapshots, permisos de acciones, exportación, respaldo, auditoría, nombres duplicados, códigos, versiones nulas, perfiles del sistema protegidos, eliminación/restauración y protección del último administrador. Dos conexiones actualizando la misma versión de un perfil producen un guardado y un conflicto.

En la vista temporal se creó un perfil, se seleccionaron permisos en el árbol y se asignó a un usuario ficticio mediante las pestañas. Se comprobó que la interfaz rechaza eliminar al último administrador y muestra la explicación en el diálogo. Se revisó el formulario con aproximadamente 450 píxeles CSS de ancho, sin desbordamiento horizontal general; no se utilizó un teléfono físico. No se enviaron invitaciones ni recuperaciones a destinatarios adicionales durante estas pruebas.

La actualización de la base alojada conservó el acceso administrativo y los registros existentes: se comparó su huella completa antes y después, sin diferencias. Las verificaciones no crearon cuentas ni perfiles personalizados ficticios en el entorno operativo. Las pruebas del envío de correos de la puesta en marcha anterior no equivalen a probar un alta real adicional en esta actualización.

Se comprobó también el inicio de sesión en la versión publicada, la carga de los listados de Usuarios y Perfiles y la apertura del formulario Nuevo perfil con su árbol de accesos. Se canceló el formulario sin crear datos de prueba en el entorno operativo.

## Asignación desde el maestro (0.4.0)

Se comprueban selección obligatoria, búsqueda por nombre y código, homónimos independientes y exclusión de fichas inactivas o eliminadas. El RPC rechaza nombres libres, identidades inexistentes y personas sin ficha en el maestro. Un perfil autorizado a asignar recibe las opciones activas sin requerir permisos para administrar el maestro.

Una prueba con dos conexiones mantiene una desactivación sin confirmar, observa que la asignación espera el bloqueo y luego confirma la desactivación: la asignación se rechaza sin crear registros. La incorporación inicial de fichas se realiza en la base privada con auditoría; no cambia las asignaciones históricas ni se publica su contenido.

## Domicilios que no desean visitas (0.5.0)

La fecha permitida se calcula como un año calendario desde la fecha informada. Se prueban el aniversario exacto, el cambio de estado ese mismo día, el primer día del año y el 29 de febrero (28 de febrero del siguiente año). Se rechazan fechas futuras, referencias vacías y domicilios duplicados dentro del mismo territorio.

Se comprueban altas idempotentes, edición, renovación, archivo después del plazo, reactivación, Papelera/restauración, procedencia inmutable, auditoría y respaldo. Dos conexiones compiten tanto por una misma versión como por crear la misma referencia: solo una confirma. El cliente no puede escribir la fecha calculada ni modificar directamente la tabla. Los avisos activos y los plazos cumplidos se conservan hasta una acción expresa.

Los perfiles existentes mantienen sus permisos. La consulta de direcciones requiere `visits.view`; los permisos de territorios permiten consultar únicamente recuentos de avisos cuando no se dispone de ese acceso. Se prueba un perfil limitado al maestro, su selector mínimo de territorios, la revocación inmediata de sus permisos y la ausencia de datos de asignaciones fuera de su alcance.

La preparación de la hoja NO TOCAR diferencia encabezados, filas vacías y domicilios; valida sus columnas y rechaza registros incompletos o repetidos antes de la carga privada. Las comprobaciones verifican que la gestión del nuevo maestro no modifica las asignaciones.

## Plazos y excepciones (0.6.0)

Se comprueba el bloqueo al día 13 y la aceptación al día 14 después del cierre, así como el cierre inclusivo a los 3 meses calendario. Se cubren cambios de año, fines de mes y años bisiestos. La apertura con un inicio que ya excede los 3 meses también necesita autorización y motivo. Un cierre normal no vuelve a pedir la justificación de un inicio anticipado previamente autorizado.

El administrador necesita motivo; los perfiles personalizados necesitan tanto el permiso de excepción como el de la operación. Se prueban denegación por perfil lector y acceso anónimo, revocación inmediata, metadatos de usuario sin efecto y ausencia de acceso directo a los ayudantes privados. Los clientes con firmas de RPC anteriores siguen operando dentro de los plazos, pero no pueden omitir las nuevas reglas.

Se rechazan motivos vacíos, compuestos solo por espacios, tabulaciones o espacios no separables, demasiado cortos o de más de 2000 caracteres. Se verifica la conservación completa de un motivo de 2000 caracteres, la observación vinculada a su asignación y la auditoría. Dos conexiones compitiendo por una excepción producen una sola operación y una sola observación; la otra recibe un conflicto de versión.

Las correcciones de fechas revisan los descansos anterior y siguiente. Se comprueba que un parámetro de anulación nulo no permita saltarse la validación. Una corrección solo del nombre conserva las fechas históricas. Los solapamientos, las fechas futuras y las identidades no autorizadas siguen bloqueados; los errores revierten también la observación. El respaldo conserva las justificaciones.

En navegador se comprobaron, con datos ficticios temporales, el inicio durante el descanso, el cierre fuera del trimestre, el guardado deshabilitado sin motivo válido, la observación en el territorio correspondiente y la nueva casilla de Perfiles. La actualización de la base alojada conservó la huella del historial anterior, sin crear asignaciones, observaciones ni cuentas ficticias en el entorno operativo.
