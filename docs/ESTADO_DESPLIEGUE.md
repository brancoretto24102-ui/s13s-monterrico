# Estado funcional — versión 0.8.2

Aplicación: [Territorios · Monterrico](https://brancoretto24102-ui.github.io/s13s-monterrico/).

La aplicación incluye gestión compartida de territorios, importación histórica, formulario oficial S-13-S, maestro de conductores, Perfiles y Usuarios, domicilios sin visitas, plazos con excepciones y seguimiento de la última predicación con semáforo.

## Cronograma semanal

**Predicación → Procesos → Cronograma semanal** permite preparar días y salidas desde un lunes. Las vistas de conductores y publicadores se derivan de la misma semana y generan sus imágenes PNG/JPG. Se proponen continuaciones abiertas y territorios por prioridad; se pueden retirar. La estructura inicial procede del Excel privado y requiere revisión y guardado.

Se avisa del descanso de 14 días y se permite justificar la programación anticipada. Los territorios que sigan abiertos fuera de 3 meses no se pueden programar hasta cerrar la asignación real. No se crean inicios ni cierres del registro oficial al programar. Los cambios usan permisos, control de versión y auditoría.

## Validación

- 75 pruebas unitarias y 360 comprobaciones PostgreSQL aprobadas con datos sintéticos.
- Conflictos de creación y edición verificados con conexiones independientes.
- Imágenes de conductores y publicadores descargadas desde la interfaz y revisadas visualmente, con el diseño compacto solicitado.
- Navegador de escritorio y vista estrecha; no se probó un teléfono físico.
- Base alojada con estructura inicial privada y sin semanas de prueba ni cambios en el historial real.

Consultar el [manual del cronograma](CRONOGRAMA_PREDICACION.md), el [manual general](USO.md) y los [resultados y límites de validación](VALIDACION.md). La documentación pública no incluye datos personales de los insumos ni credenciales privadas.

La actualización 0.8.1 corrige el selector de conductores fuera de ventanas de asignación y permite elegir el lunes antes de abrir la semana, con confirmación visible si hay cambios pendientes. La exportación de cronogramas compara PNG y JPG y descarga el menor; el formulario oficial S-13-S conserva su PDF.

La versión 0.8.2 retira de las sugerencias los territorios incluidos en cualquier salida de la semana y los recupera cuando dejan de estar programados. Ajusta cada columna según el texto más ancho y muestra las imágenes finales antes de una descarga opcional. La preparación no genera un evento de exportación; el servidor revalida al descargar.
