# Modelo y reglas

El frontend estático no posee privilegios administrativos de base de datos. Supabase Auth identifica la sesión; las funciones y RLS consultan el perfil activo actual. El rol no se toma de metadatos modificables por el usuario ni se confía en ocultar botones.

Desde la tercera migración, los RPC de `public` usan `SECURITY INVOKER` y llaman a implementaciones autorizadas en el esquema `private`, no expuesto por la API. Las implementaciones privadas conservan sus comprobaciones de usuario/rol y los bloqueos transaccionales. Se revocan también los permisos de cliente sobre la función interna de evento `rls_auto_enable` cuando existe en el proyecto.

## Entidades

| Tabla                    | Propósito                                                                  |
| ------------------------ | -------------------------------------------------------------------------- |
| `territories`            | Número único, estado y versión de todo el territorio                       |
| `people`                 | Identidad separada y nombre normalizado, preparada para ampliación         |
| `assignments`            | Registro normalizado, snapshot del nombre, DATE, versiones y procedencia   |
| `profiles`               | Rol, estado y exportación por usuario de Auth                              |
| `audit_log`              | Usuario, hora UTC, antes/después y motivo                                  |
| `import_batches`         | SHA-256 del archivo, responsable, resultados y conciliación                |
| `territory_observations` | Observaciones generales y excepciones de plazos vinculadas a la asignación |
| `conductors`             | Ficha del maestro: código único, persona, estado, papelera y versión       |
| `meeting_schedule`       | Tabla inicial reservada, conservada por compatibilidad                     |
| `preaching_schedules`    | Documento semanal compartido, salidas JSONB normalizadas y versión         |
| `preaching_template`     | Estructura inicial privada, singleton con UUID para auditoría              |

Un nombre histórico no se cambia cuando se amplía la ficha de la persona. Los registros importados conservan snapshot aunque no haya correspondencia inequívoca con un `person_id`; no se fusionan homónimos como si fueran necesariamente la misma persona. Una nueva asignación exige seleccionar un conductor activo identificado por UUID; las sugerencias históricas no identifican automáticamente a personas. La corrección expresa del nombre histórico se conserva como operación independiente con motivo.

## Mutaciones y simultaneidad

`assign_territory`, `complete_assignment` y `correct_assignment` bloquean primero la fila del territorio. Comprueban la versión esperada que vio el usuario. Un trigger adicional valida predecesor y sucesor, actualiza la versión y escribe auditoría. Los índices únicos impiden dos abiertos y dos inicios vigentes en el mismo día por territorio.

Desde la versión 0.6.0, `assign_territory_with_reason` y `complete_assignment_with_reason` agregan un motivo de excepción opcional en la firma, obligatorio cuando se incumple un plazo. Los RPC anteriores delegan sin motivo y no permiten excepciones silenciosas. Los ayudantes privados calculan descanso de 14 días y límite de 3 meses calendario usando fechas DATE; verifican el permiso actual `territories.override_timing` y el motivo dentro del bloqueo de la operación. No están expuestos ni son ejecutables directamente por los clientes. El registro y su observación de tipo `timing_exception`, con `assignment_id`, se confirman o revierten juntos. Las correcciones de fechas verifican también el descanso del sucesor; una corrección solo del nombre no revalida retrospectivamente fechas históricas. No se reescriben importaciones ni registros anteriores. Ver [plazos](PLAZOS_TERRITORIOS.md).

El RPC de importación bloquea territorios en orden estable y ejecuta todo el lote en una transacción. Si una fila rompe reglas, se revierte el lote completo. Los archivos se reconocen por SHA-256 y los registros existentes por territorio y fecha de asignación, con comparación de nombre y cierre. No se actualizan registros existentes silenciosamente. La especificación histórica autoriza únicamente el ajuste particular de T64; la previsualización lo muestra y su motivo se conserva en auditoría.

Los usuarios de la aplicación no tienen INSERT/UPDATE/DELETE directos. Solo los RPC expresamente concedidos pueden mutar datos. Los propietarios y administradores de infraestructura conservan, por definición, control sobre PostgreSQL; la inmutabilidad de auditoría se impone a las sesiones de la aplicación y mediante trigger, no pretende impedir que el dueño de la infraestructura cambie su propio esquema.

Realtime publica invalidaciones de `territories`, `conductors` y del perfil propio. No publica nombres ni eventos DELETE de asignaciones. El navegador vuelve a pedir un snapshot autorizado y consistente; además comprueba cada 30 segundos y al recuperar el foco. La comprobación de permisos en cada operación mantiene la protección aunque el navegador tenga información anterior. Los registros privados se limpian al salir o al detectar desactivación.

## Maestro de conductores

La cuarta migración añade `get_conductors` y `manage_conductor`. Sus envoltorios públicos son `SECURITY INVOKER`; la implementación privada comprueba administrador activo. Los clientes no escriben directamente en las tablas. El catálogo completo, incluidos inactivos y papelera, es administrativo; el snapshot autorizado entrega solo fichas activas disponibles para asignar.

Cada conductor tiene UUID estable, código generado por identidad, `person_id` único, versión y metadatos de creación/actualización/eliminación. El código no se reutiliza ni se puede cambiar. El nombre se valida y normaliza sin convertirlo en identidad única. La eliminación es lógica y recuperable; restaurar deja la ficha inactiva. Se conserva la referencia desde asignaciones y cronogramas.

Las mutaciones se serializan con un bloqueo transaccional del catálogo y comprueban la versión que vio el administrador. Repetir un alta con el mismo UUID y nombre es idempotente. Una versión obsoleta se rechaza con `40001`; el usuario recibe los datos actuales antes de reintentar. El motivo, actor y antes/después se guardan en la auditoría existente.

Cuando se asigna con `person_id`, el servidor bloquea y comprueba la ficha y la persona activas y verifica que el nombre mostrado sea el vigente. Guarda ese nombre como snapshot, sin reescribir asignaciones anteriores al editar la ficha. Una corrección manual que cambia el nombre del responsable retira el vínculo anterior; una corrección solo de fechas lo conserva. Los respaldos incluyen personas, fichas en todos los estados y auditoría.

## Informes

Las fechas de registros son `DATE`; no se convierten a medianoche local. “Hoy” se obtiene con `Intl.DateTimeFormat` en `America/Lima`. Los timestamps de auditoría se conservan con zona y se presentan en Perú.

- Año de servicio: septiembre–agosto. La excepción histórica de julio solo se reproduce con rango personalizado.
- Asignaciones impresas: `assigned_at` dentro de los extremos inclusivos.
- Cierre impreso: solamente si no supera el corte.
- Última fecha: máximo cierre de todo el historial disponible que no supere el corte, aunque la asignación comenzara antes del periodo.
- Filas: `max(1, ceil(n/4))`; veinte por página; número repetido en continuaciones y última fecha solo en la primera fila física.

El motor exige el hash de la plantilla validada y clona su página original. Las coordenadas proceden de sus vectores, no de una tabla redibujada. Solo se tapa la raya corta del encabezado para dibujar otra de ancho medido. Los anchos se calculan sumando avances de glifos, porque `drawText` no aplica el kerning que incluye una medición completa de cadenas de fuentes estándar. Se limita el tamaño y se rechaza un nombre que no pueda mostrarse de forma legible antes de omitirlo o cortarlo.

La fuente superpuesta es Helvetica estándar, compatible con los nombres del conjunto revisado; la tipografía impresa del original se conserva. Nombres futuros con caracteres fuera de esa fuente requieren ampliar el motor con una fuente embebida autorizada; la aplicación avisa y no genera un PDF incompleto.

El encabezado, periodo, fecha local de generación, hash de plantilla, revisión del snapshot y recuentos se guardan en metadatos del PDF y en un JSON externo descargable. Ese resumen no altera el formulario oficial.

## Límites prácticos

`get_snapshot` devuelve el historial completo mediante un agregado JSON en una única respuesta, evitando el límite habitual de mil filas del API de tablas. Se probó con más de mil registros. Esto no fija un máximo de historial, pero antes de llegar a decenas o cientos de miles de registros conviene paginar consultas interactivas y generar snapshots de exportación separados, conservando consistencia. Las cuotas de almacenamiento y transferencia siguen siendo las del proveedor.

La tabla de auditoría se pagina en la interfaz. Los respaldos completos y el formulario deben descargarse en equipos autorizados: una vez descargados, su protección también depende de quien conserva esos archivos.

## Perfiles y usuarios (0.3.0)

`profiles` continúa representando cuentas de Auth. `access_profiles` representa conjuntos de permisos y `user_access_profiles` sus vínculos, separados de las fichas operativas de conductores. El catálogo de permisos contiene únicamente acciones implementadas. Los perfiles del sistema están protegidos y los personalizados usan una papelera recuperable.

`get_access_context` devuelve únicamente la cuenta actual y sus permisos efectivos. `get_users`, `get_access_profiles`, `manage_user` y `manage_access_profile` se reservan a administradores activos. Los RPC públicos conservan `SECURITY INVOKER`; las implementaciones privilegiadas siguen en el esquema privado. Las tablas nuevas tienen RLS y no permiten escritura directa del cliente.

Para cuentas básicas se conservan las reglas de Administrador, Editor y Lector. Para cuentas personalizadas se usa la unión de los perfiles vinculados activos; si todos se desactivan, no hay herencia de permisos básicos. Las comprobaciones consultan la base actual y no claims JWT obsoletos ni metadatos del usuario. El administrador conserva acceso completo y la protección del último administrador se aplica bajo un bloqueo común de seguridad.

El snapshot y las políticas de tablas filtran los datos según el acceso efectivo. Un perfil de Conductores no recibe por ese motivo el historial de asignaciones. Los nombres del historial, las reglas de fechas y el motor PDF se conservan. Los cambios concurrentes de ficha de usuario o perfil requieren la versión vigente. Se rechazan también versiones nulas al completar asignaciones o editar territorios.

La función de invitaciones comprueba identidad y administrador activo, valida perfiles y alias, crea la cuenta inicialmente inactiva y aplica el acceso en una transacción. Si falla esa configuración, informa que la invitación ya fue enviada y conserva la cuenta inactiva para revisión. Los enlaces de recuperación usan el correo de Auth obtenido por identificador, no una dirección arbitraria del formulario; el resultado aceptado se registra en auditoría. No se almacenan contraseñas de usuarios en las tablas de la aplicación.

## Domicilios y plazo anual

`visit_restrictions` conserva la referencia, la fecha informada, el territorio, la fecha calculada, estado, versión y procedencia de la carga. `eligible_on` es una columna generada de PostgreSQL; no puede sustituirse por una fecha elegida por el cliente. El 29 de febrero cumple el plazo el 28 de febrero del siguiente año. El día vigente se calcula según America/Lima.

`manage_visit_restriction` mantiene una envoltura pública SECURITY INVOKER y una implementación privada con autorización actual, versiones y un bloqueo transaccional corto. RLS limita la lectura de referencias a `visits.view`. El snapshot entrega un catálogo mínimo de territorios a ese módulo y recuentos sin direcciones para la consulta de territorios. No se amplían los permisos de perfiles existentes.

Los avisos se calculan desde las fechas, sin una tarea de pago. La fecha peruana se actualiza cada 30 segundos y al recuperar el foco. Realtime y el refresco de respaldo mantienen los registros compartidos al día. Los datos de este maestro no se imprimen en el formulario oficial S-13-S.

## Cronograma semanal (0.8.0)

Cada lunes identifica una sola semana. Sus salidas se guardan como un documento JSONB acotado y validado por servidor; nombres y números se resuelven desde UUID, sin confiar en campos suministrados por el cliente. Las vistas de conductores y publicadores se derivan del mismo documento; el segundo omite Territorio. La estructura inicial se incorpora como datos privados, no como una migración con personas o puntos de reunión.

`get_preaching_context`, `save_preaching_schedule` y `export_preaching_schedule` tienen envoltorios públicos invoker y autorización privada. Las tablas tienen RLS y no admiten escritura directa del cliente. El contexto entrega solo el catálogo y las fechas necesarias; no entrega nombres del historial ni domicilios. Los cuatro permisos de cronograma no se conceden automáticamente a los perfiles existentes.

El guardado toma un bloqueo transaccional por semana, comprueba versión y bloquea territorios en orden estable, antes de comprobar las fichas de conductores. Las asignaciones reales usan el mismo bloqueo por territorio. El servidor revisa los plazos según la fecha de cada salida: permite continuación dentro del trimestre, bloquea abiertos después de 3 meses para todos y exige motivo durante los 14 días posteriores al cierre. La excepción del cronograma no otorga permisos de excepción del historial real.

La semana y sus observaciones `schedule_exception` se confirman juntas. Estas observaciones conservan `schedule_id`, `schedule_entry_id`, fechas y motivo; guardados idénticos no duplican notas. La auditoría conserva antes y después de semanas y estructura, incluidas las salidas retiradas. La descarga comprueba la versión y revalida los plazos bajo bloqueo antes de registrar EXPORT. El respaldo agrega ambas tablas en la misma consulta consistente. Consultar [uso y límites del cronograma](CRONOGRAMA_PREDICACION.md).

## Imágenes y selector (0.8.1)

La vista previa y el exportador utilizan `preachingDocument`, un modelo de presentación común. Resuelve filas, fechas cortas, horas y nombres; el estilo solo modifica la presentación, sin reescribir identidades o snapshots. El exportador utiliza Canvas local, sin servicios externos ni nuevas dependencias. Compara los tamaños reales de PNG y JPEG de alta calidad, conserva la extensión correspondiente al MIME recibido y descarga el menor. Los límites por imagen mantienen una resolución legible; las semanas largas se dividen sin omitir filas. Se repiten Día y Fecha cuando un grupo continúa en otra imagen. No se incluyen motivos internos ni identificadores en el texto exportado.

El selector de conductores mide el espacio disponible en el viewport y, cuando existe, en el diálogo contenedor. Admite ambos contextos y reacciona al desplazamiento de sus antecesores. Elegir un lunes cambia solo un campo local; Abrir semana valida y carga explícitamente, conservando la semana abierta mientras la nueva fecha es incompleta o se decide sobre cambios sin guardar.
