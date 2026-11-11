# Estado funcional — versión 0.8.0

Aplicación: [Territorios · Monterrico](https://brancoretto24102-ui.github.io/s13s-monterrico/).

La aplicación incluye gestión compartida de territorios, importación histórica, formulario oficial S-13-S, maestro de conductores, Perfiles y Usuarios, domicilios sin visitas, plazos con excepciones y seguimiento de la última predicación con semáforo.

## Cronograma semanal

**Predicación → Procesos → Cronograma semanal** permite preparar días y salidas desde un lunes. Las vistas de conductores y publicadores se derivan de la misma semana y generan sus PDF. Se proponen continuaciones abiertas y territorios por prioridad; se pueden retirar. La estructura inicial procede del Excel privado y requiere revisión y guardado.

Se avisa del descanso de 14 días y se permite justificar la programación anticipada. Los territorios que sigan abiertos fuera de 3 meses no se pueden programar hasta cerrar la asignación real. No se crean inicios ni cierres del registro oficial al programar. Los cambios usan permisos, control de versión y auditoría.

## Validación

- 65 pruebas unitarias y 359 comprobaciones PostgreSQL aprobadas con datos sintéticos.
- Conflictos de creación y edición verificados con conexiones independientes.
- PDF de conductores y publicadores descargados desde la interfaz y revisados por extracción y renderizado.
- Navegador de escritorio y vista estrecha; no se probó un teléfono físico.
- Base alojada con estructura inicial privada y sin semanas de prueba ni cambios en el historial real.

Consultar el [manual del cronograma](CRONOGRAMA_PREDICACION.md), el [manual general](USO.md) y los [resultados y límites de validación](VALIDACION.md). La documentación pública no incluye datos personales de los insumos ni credenciales privadas.
