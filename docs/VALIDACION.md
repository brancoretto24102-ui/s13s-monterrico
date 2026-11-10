# Evidencia de esta entrega

Validaciones realizadas localmente el 09/11/2026 con los insumos privados indicados en la especificación. No se han ejecutado acciones en GitHub, desplegado servicios ni creado usuarios reales.

**Actualización de puesta en marcha:** ya se configuró el proyecto Supabase del propietario y se desplegó `invite-user`. Se verificó por HTTP el rechazo anónimo, se corrigieron los avisos de la revisión de seguridad de la base y se amplió la prueba de PostgreSQL a 43 comprobaciones. No se han creado usuarios reales ni importado datos de producción; GitHub Pages sigue pendiente. El párrafo anterior describe la primera entrega local. Ver [estado actual](ESTADO_DESPLIEGUE.md).

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

La interfaz implementa diseño adaptable, menú móvil, formularios de ancho flexible y tablas con desplazamiento propio. La prueba visual en teléfono real queda pendiente de la publicación; no se afirma que se haya realizado. El visor e impresión de PDFs deben probarse en los equipos de los usuarios.

## Compilación y dependencias

Compilación TypeScript/Vite y pruebas unitarias completadas. Las dependencias de producción no presentaron vulnerabilidades conocidas en `npm audit --omit=dev` durante esta entrega. Las versiones resueltas están fijadas; el resultado del análisis depende de la base de avisos disponible en la fecha de ejecución.

## Pendiente antes de aceptación final

- Autorización y acceso al repositorio específico.
- Proyecto Supabase del propietario, configuración Auth y correo, Edge Function y primera cuenta administrativa.
- Prueba real de inicio/recuperación/invitaciones, RLS de API, Storage y actualización entre dos navegadores contra Supabase.
- Migración de producción aprobada y verificación de respaldo/recuperación.
- Publicación en GitHub Pages, URL comprobada y revisión en teléfono real.

El código y el paquete son una implementación funcional preparada para conectarse; la aplicación todavía no está activada para usuarios reales. La URL local de revisión no es una dirección pública de producción.
