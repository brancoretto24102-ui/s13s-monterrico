# Modelo y reglas

El frontend estático no posee privilegios administrativos de base de datos. Supabase Auth identifica la sesión; las funciones y RLS consultan el perfil activo actual. El rol no se toma de metadatos modificables por el usuario ni se confía en ocultar botones.

Desde la tercera migración, los RPC de `public` usan `SECURITY INVOKER` y llaman a implementaciones autorizadas en el esquema `private`, no expuesto por la API. Las implementaciones privadas conservan sus comprobaciones de usuario/rol y los bloqueos transaccionales. Se revocan también los permisos de cliente sobre la función interna de evento `rls_auto_enable` cuando existe en el proyecto.

## Entidades

| Tabla | Propósito |
|---|---|
| `territories` | Número único, estado y versión de todo el territorio |
| `people` | Identidad separada y nombre normalizado, preparada para ampliación |
| `assignments` | Registro normalizado, snapshot del nombre, DATE, versiones y procedencia |
| `profiles` | Rol, estado y exportación por usuario de Auth |
| `audit_log` | Usuario, hora UTC, antes/después y motivo |
| `import_batches` | SHA-256 del archivo, responsable, resultados y conciliación |
| `territory_observations` | Observaciones independientes del formulario |
| `conductors`, `meeting_schedule` | Base para programación en segunda etapa |

Un nombre histórico no se cambia cuando se amplía la ficha de la persona. Los registros importados conservan snapshot aunque no haya correspondencia inequívoca con un `person_id`; no se fusionan homónimos como si fueran necesariamente la misma persona. En el MVP, los responsables se seleccionan a partir de nombres usados en el historial.

## Mutaciones y simultaneidad

`assign_territory`, `complete_assignment` y `correct_assignment` bloquean primero la fila del territorio. Comprueban la versión esperada que vio el usuario. Un trigger adicional valida predecesor y sucesor, actualiza la versión y escribe auditoría. Los índices únicos impiden dos abiertos y dos inicios vigentes en el mismo día por territorio.

El RPC de importación bloquea territorios en orden estable y ejecuta todo el lote en una transacción. Si una fila rompe reglas, se revierte el lote completo. Los archivos se reconocen por SHA-256 y los registros existentes por territorio y fecha de asignación, con comparación de nombre y cierre. No se actualizan registros existentes silenciosamente. La especificación histórica autoriza únicamente el ajuste particular de T64; la previsualización lo muestra y su motivo se conserva en auditoría.

Los usuarios de la aplicación no tienen INSERT/UPDATE/DELETE directos. Solo los RPC expresamente concedidos pueden mutar datos. Los propietarios y administradores de infraestructura conservan, por definición, control sobre PostgreSQL; la inmutabilidad de auditoría se impone a las sesiones de la aplicación y mediante trigger, no pretende impedir que el dueño de la infraestructura cambie su propio esquema.

Realtime publica invalidaciones de `territories` y del perfil propio. No publica nombres ni eventos DELETE de asignaciones. El navegador vuelve a pedir un snapshot autorizado y consistente; además comprueba cada 30 segundos y al recuperar el foco. La comprobación de permisos en cada operación mantiene la protección aunque el navegador tenga información anterior. Los registros privados se limpian al salir o al detectar desactivación.

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
