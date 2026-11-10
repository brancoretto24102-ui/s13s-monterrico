# Evidencia de esta entrega

Validación local inicial realizada el 09/11/2026. La puesta en marcha se completó el 10/11/2026 con GitHub Pages, Supabase, la primera cuenta administrativa y el historial real.

**Validación en producción:** 820 registros importados en un único lote y comparados campo por campo, sin diferencias. La segunda carga no generó duplicados. Los cuatro resultados históricos coinciden en la base alojada. Se comprobaron RLS y permisos de lector, editor, exportación explícita, perfil inactivo y anónimo mediante cambios temporales revertidos.

Se inició sesión por contraseña en el sitio publicado. Se generó y descargó el PDF hasta el 10/11/2026: 250 asignaciones, 101 filas, seis páginas y 931 campos correctos. Coinciden las palabras con la referencia aprobada, actualizando explícitamente solo la fecha de actualidad del encabezado; no hay píxeles cambiados fuera de las zonas previstas. Se descargó el respaldo JSON desde la web y se conciliaron nuevamente sus 820 registros. Ver [resultado agregado](production-qa-2026-11-10.json) y [estado actual](ESTADO_DESPLIEGUE.md).

## Reglas y PostgreSQL

- 15 pruebas unitarias: fechas, día peruano, año de servicio, rangos, actualidad, cierres al corte, historial previo, continuidad y previsualización de errores Excel.
- 43 comprobaciones con PostgreSQL 18.6 real: permisos, RLS, anonimato, perfil inactivo, rechazo de escalamiento de rol, cierre el mismo día, reasignación inválida, corrección con conflicto, versiones, auditoría inmutable, último administrador, importación atómica y deduplicación, crecimiento del catálogo, respaldo, más de mil registros y acceso privado al PDF.
- Dos conexiones PostgreSQL independientes intentaron asignar el mismo territorio con la misma versión: una confirmó y la otra recibió `40001`. No se simuló el bloqueo únicamente en JavaScript.
- Prueba separada con el historial real: 820 asignaciones importadas y comparadas campo por campo; 82 territorios; repetición del archivo con cero duplicados; una entrada de auditoría para la corrección aprobada de T64.

El esquema Auth/Storage de las pruebas se emula para ejecutar las migraciones y políticas en PostgreSQL. Esto verifica SQL, privilegios y bloqueos, pero no equivale a una prueba del servicio Supabase alojado.

## Conciliaciones históricas

| Filtro | Asignaciones | Territorios con asignaciones | Filas | Páginas |
|---|---:|---:|---:|---:|
| Excepción 02/07/2025–31/08/2026 | 739 | 80 | 217 | 11 |
| Año de servicio 2025-2026 | 580 | 80 | 179 | 9 |
| Año de servicio 2026-2027, datos disponibles | 81 | 52 | 82 | 5 |
| 01/06/2026–09/11/2026 | 250 | 77 | 101 | 6 |

Coinciden exactamente con los cuatro baselines de la especificación, tanto desde el importador como desde el snapshot de PostgreSQL. No se codifican como límites de la aplicación.

Para junio–noviembre: sin asignaciones nuevas en 5, 10, 11, 19 y 20; sin cierre histórico en 10; abiertas al corte en 9, 23, 26, 27, 28, 60 y 66. Las cadenas de nombres y fechas coinciden con el resultado aprobado, incluidas sus continuaciones.

## PDF

Se generó el informe privado de seis páginas. Se reconciliaron los 931 textos superpuestos con los valores esperados y todas las palabras de cada página con el PDF aprobado. La inspección se realiza con PyMuPDF, sin confundir la extracción de texto con la revisión visual.

Se renderizaron las seis páginas. La comprobación de píxeles compara cada página con la plantilla original fuera de las áreas donde se rellenan textos y se reemplaza la raya del encabezado. La tabla, el título y el pie se conservan. Se revisaron dimensiones y anchos reales de los textos; el menor tamaño de fuente del conjunto revisado es 8,1 puntos.

Los insumos, el PDF generado y sus comprobaciones detalladas contienen datos personales y están fuera del código publicable. El script `validate-private-pdf.py` permite repetir la prueba y genera una hoja de contacto privada para revisión visual.

## Navegador e interfaz

Probados en navegador de escritorio: acceso a la sesión ficticia, tablero, apertura de historial, asignación, cierre el mismo día, rechazo de nueva asignación el mismo día, búsqueda por nombre, selector hasta actualidad, validación de la plantilla cargada y generación de PDF con vista previa y enlace de descarga.

La interfaz implementa diseño adaptable, menú móvil, formularios de ancho flexible y tablas con desplazamiento propio. Se revisaron el menú y el formulario a 449 píxeles CSS de ancho en el navegador, sin desbordamiento horizontal general. No se probó un teléfono físico. El visor e impresión de PDFs deben comprobarse también en los equipos de los usuarios.

## Compilación y dependencias

Compilación TypeScript/Vite y pruebas unitarias completadas. Las dependencias de producción no presentaron vulnerabilidades conocidas en `npm audit --omit=dev` durante esta entrega. Las versiones resueltas están fijadas; el resultado del análisis depende de la base de avisos disponible en la fecha de ejecución.

## Comprobaciones con futuras incorporaciones

- Configurar SMTP para invitaciones y recuperación de destinatarios generales, o crear las cuentas de forma controlada desde el panel del propietario. No hay cuentas adicionales autorizadas.
- Comprobar correo de recuperación y el flujo de invitación con cada nuevo usuario.
- Verificar actualización visual entre dos sesiones reales editando simultáneamente. El bloqueo de la base ya se comprobó con dos conexiones independientes.
- Revisar teléfonos físicos y ejecutar un simulacro de restauración en un entorno separado.

La aplicación publicada ya permite al administrador autorizado consultar y gestionar los registros reales y generar sus formularios. Estas comprobaciones adicionales no deben confundirse con pruebas que ya se hayan realizado.
