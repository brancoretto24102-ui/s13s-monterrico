# Estado funcional — versión 0.3.0

Aplicación: [Territorios · Monterrico](https://brancoretto24102-ui.github.io/s13s-monterrico/).

## Maestro de conductores

El administrador dispone de **Administración → Conductores** para crear, editar, activar, desactivar, eliminar a Papelera y restaurar fichas. Cada ficha tiene un código independiente. La búsqueda admite nombre o código y los filtros separan activos, inactivos y Papelera.

La eliminación es recuperable y conserva el historial. Restaurar deja la ficha inactiva. Un conductor inactivo o en Papelera no aparece como opción para nuevas asignaciones; sus asignaciones anteriores se pueden completar. Los cambios requieren motivo y quedan en auditoría.

Al asignar un territorio se puede elegir un conductor registrado activo o escribir un nombre manual. Las fichas no se crean ni vinculan automáticamente por coincidencia de nombres históricos. Una edición de ficha conserva el nombre registrado en cada asignación anterior.

## Validación de la actualización

- 19 pruebas unitarias y 159 comprobaciones de base de datos aprobadas.
- Comprobaciones de PostgreSQL con datos sintéticos, incluidos permisos, versiones, historial y dos conexiones concurrentes.
- Compilación y revisión del paquete público aprobadas.
- En la vista temporal se probaron todas las operaciones del maestro, búsqueda, filtros y selección al asignar un territorio.
- En la web se comprobó el acceso administrativo, la carga del maestro y la apertura/cancelación del formulario de alta.
- Se revisaron la vista temporal y su formulario con un ancho aproximado de 450 píxeles CSS. No se probó un teléfono físico.

La actualización no modifica el motor del formulario PDF. Los datos de ejemplo usados para comprobar el maestro son temporales y no se insertan en el catálogo operativo.

Consultar la [guía del maestro](CONDUCTORES.md), el [manual de uso](USO.md) y la [validación](VALIDACION.md). La documentación pública omite identificadores de infraestructura, credenciales y resultados con datos personales.

## Interfaz modular y accesos

La versión 0.3.0 añade menú lateral verde con grupos desplegables y pantallas independientes de Perfiles y Usuarios. Los perfiles definen acciones de los módulos y las cuentas pueden recibir varios perfiles personalizados. La guía pública describe funciones y validaciones sin incluir identificadores privados de infraestructura ni información de personas.
