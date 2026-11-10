# Validación de la aplicación

La documentación pública describe las comprobaciones reproducibles con datos sintéticos. Los insumos originales, los resultados con nombres y los detalles de infraestructura se conservan fuera del repositorio.

## Pruebas automatizadas

- 19 pruebas unitarias: fechas, día peruano, año de servicio, rangos, actualidad, cierres al corte, historial previo, continuidad y previsualización de errores Excel.
- 159 comprobaciones PostgreSQL: permisos, acceso anónimo e inactivo, roles, reglas de fechas, conflictos de versión, auditoría, importación atómica, deduplicación, crecimiento del catálogo, respaldo, historial con más de mil registros y acceso privado a la plantilla.
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
