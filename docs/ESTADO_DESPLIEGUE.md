# Estado funcional — versión 0.12.0

Aplicación: [Territorios · Monterrico](https://brancoretto24102-ui.github.io/s13s-monterrico/).

La aplicación incluye gestión compartida de territorios, importación histórica, formulario oficial S-13-S, maestro de conductores, Perfiles y Usuarios, domicilios sin visitas, plazos con excepciones y seguimiento de la última predicación con semáforo.

## Cronograma semanal

**Predicación → Procesos → Cronograma semanal** permite preparar días y salidas desde un lunes. Las vistas de conductores y publicadores se derivan de la misma semana y generan sus imágenes PNG/JPG. Se proponen continuaciones abiertas y territorios por prioridad; se pueden retirar. La estructura inicial procede del Excel privado y requiere revisión y guardado.

Se avisa del descanso de 14 días y se permite justificar la programación anticipada. Los territorios que sigan abiertos fuera de 3 meses no se pueden programar hasta cerrar la asignación real. No se crean inicios ni cierres del registro oficial al programar. Los cambios usan permisos, control de versión y auditoría.

## Validación

- 185 pruebas unitarias y 569 comprobaciones PostgreSQL aprobadas con datos sintéticos.
- Conflictos de creación y edición verificados con conexiones independientes.
- Imágenes de conductores y publicadores descargadas desde la interfaz y revisadas visualmente, con el diseño compacto solicitado.
- Navegador de escritorio y vista estrecha; no se probó un teléfono físico.
- Base alojada con estructura inicial privada y sin semanas de prueba ni cambios en el historial real.

Consultar el [manual del cronograma](CRONOGRAMA_PREDICACION.md), el [manual general](USO.md) y los [resultados y límites de validación](VALIDACION.md). La documentación pública no incluye datos personales de los insumos ni credenciales privadas.

La actualización 0.8.1 corrige el selector de conductores fuera de ventanas de asignación y permite elegir el lunes antes de abrir la semana, con confirmación visible si hay cambios pendientes. La exportación de cronogramas compara PNG y JPG y descarga el menor; el formulario oficial S-13-S conserva su PDF.

La versión 0.8.2 retira de las sugerencias los territorios incluidos en cualquier salida de la semana y los recupera cuando dejan de estar programados. Ajusta cada columna según el texto más ancho y muestra las imágenes finales antes de una descarga opcional. La preparación no genera un evento de exportación; el servidor revalida al descargar.

La versión 0.9.0 corrige los accesos de Cronograma semanal en Perfiles y agrega una casilla destacada para las excepciones de 14 días y 3 meses. No concede accesos nuevos a usuarios existentes. Refuerza la definición privada de contraseñas y exige confirmación.

La versión 0.10.0 agrega **Configuración → Maestros → Territorios geográficos**: mapa OpenStreetMap con semáforo, filtros, editor de varias partes, revisión con motivo, Papelera, importación atómica y exportación GeoJSON/KML. El administrador accede al catálogo completo; otros perfiles deben habilitar acciones explícitamente. Los límites de un plano se importan como borradores pendientes de revisión humana.

La versión 0.10.1 corrige el guardado de vértices con una validación visible y foco en el motivo obligatorio. La vista previa del S-13-S dibuja una página a la vez y permite avanzar o ampliar sin depender del visor PDF incrustado del teléfono. Se verificaron ambas imágenes del cronograma a 449 px; no se probó un dispositivo físico ni el navegador Brave de la captura.

La versión 0.10.2 conserva el foco al escribir en las ventanas, simplifica la ficha geográfica y muestra sus avisos de domicilios según permisos. Agrega Cerrar al listado de asignaciones, oculta el menú por completo con dobles flechas y utiliza el símbolo de la aplicación en la pestaña. No cambia los permisos existentes ni los registros históricos.

La versión 0.11.0 añade etiquetas opcionales de manzana por cada parte del territorio, con visualización en el mapa y en el maestro. La carga inicial desde el plano queda pendiente de revisión humana. Las etiquetas conservan permisos, motivo, auditoría y control de concurrencia; no se modifican los vértices ni las asignaciones.

La versión 0.12.0 añade el modo inicial **Estado de asignación** en el mapa: descanso de 14 días, abierto, alerta desde 14 días antes del vencimiento y límite de 3 meses alcanzado o superado. Incluye leyenda con filtros, orden por alerta y fechas en la ficha. Permite alternar con el semáforo de antigüedad existente. El botón PDF cartográfico de alta calidad queda pendiente de autorización tras el análisis de consumo; no se activaron servicios de pago.
