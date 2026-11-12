# Territorios geográficos

Disponible en **Configuración → Maestros → Territorios geográficos**. El mapa y el maestro usan la misma ficha del territorio del registro S-13-S. Un territorio puede incluir varias partes separadas sin perder su número ni su historial.

## Mapa y prioridades

El mapa abre en **Estado de asignación**. Los colores reflejan la situación actual, con la fecha del día en Perú:

| Color    | Estado           | Regla                                                |
| -------- | ---------------- | ---------------------------------------------------- |
| Verde    | Disponible       | Sin asignación abierta ni descanso pendiente         |
| Morado   | En descanso      | Hasta completar 14 días desde la última finalización |
| Azul     | Abierto          | Faltan más de 14 días para cumplir 3 meses           |
| Amarillo | Por vencer       | Faltan de 1 a 14 días para cumplir 3 meses           |
| Rojo     | Límite alcanzado | Se cumplen hoy los 3 meses o se superó ese plazo     |
| Gris     | Inactivo         | Territorio desactivado                               |

Los 3 meses son calendario, con ajuste al último día del mes; no equivalen siempre a 90 días. Por ejemplo, un inicio del 31/01 vence el 30/04: azul hasta el 15/04, amarillo del 16/04 al 29/04 y rojo desde el 30/04. El rojo de ese último día se identifica como **Vence hoy**: cerrar ese día sigue permitido por la validación vigente. Una finalización del 01/01 mantiene el descanso hasta el 14/01 inclusive; el 15/01 vuelve a disponible. Una asignación abierta tiene precedencia sobre el descanso y la antigüedad de la finalización anterior.

Las cinco tarjetas de la leyenda filtran el mapa y el maestro; pulsar la misma tarjeta retira el filtro. **Ordenar por alerta** coloca primero límite alcanzado, por vencer, abierto, descanso y disponible; dentro de cada grupo, primero la fecha límite más próxima. El orden inicial sigue siendo por número. La ficha muestra el inicio, fecha límite y días restantes, o la fecha en que termina el descanso. Los avisos son visuales dentro de la aplicación; no se envían correos. Cambiar colores no altera los permisos de excepción, fechas ni registros.

**Antigüedad de predicación** conserva la vista anterior: verde antes de 4 meses, amarillo desde 4, anaranjado desde 8 y rojo desde 12 meses o sin registro. Se calcula desde la última finalización válida, excluyendo futuras y anuladas. En esta vista, **Ordenar por prioridad** mantiene rojo, anaranjado, amarillo y verde, con las fechas más antiguas primero. Cambiar de vista limpia el filtro de estado y color para evitar combinaciones ocultas; conserva búsqueda, rango de fechas y revisión.

En ambas vistas se puede buscar y filtrar la última fecha predicada, estados y revisión. Seleccionar un área o una ficha muestra fechas, estado y revisión. El borde seleccionado conserva el color de su estado. **Ver historial** requiere además visualizar el registro de asignaciones. Los datos se actualizan con la consulta compartida del mapa y al cambiar el día peruano.

Los borradores llevan borde discontinuo. El fondo de calles es OpenStreetMap; «Mostrar calles» permite ocultarlo. Si el proveedor no responde, siguen disponibles los polígonos. El servicio de calles es comunitario, sin garantía de disponibilidad; no se descarga masivamente ni para uso sin conexión.

## Revisar y corregir límites

La extracción de un PDF sin coordenadas GPS exige georreferenciación. Una alineación aproximada no es una medición de campo. Revisar también la fecha impresa del plano y los cambios de calles, manzanas y numeración. La procedencia original se conserva para trazabilidad; la ficha de consulta muestra solo la información operativa.

1. En el maestro, buscar el territorio. «Dibujar» aparece si todavía no tiene polígono; «Editar» abre límites existentes.
2. Hacer clic en el mapa para agregar vértices. Arrastrarlos o ajustar sus coordenadas WGS84. «Agregar parte» permite conservar manzanas separadas. Cada contorno se cierra al guardar.
3. Indicar un motivo obligatorio de al menos 8 caracteres. La procedencia se conserva automáticamente. Si falta, Guardar como borrador muestra el aviso y enfoca el campo; los vértices editados se conservan. Guardar siempre deja el área como borrador, aunque antes estuviera validada.
4. Una persona con «Validar límites revisados» debe comprobar el área real, confirmar la revisión y registrar el motivo. Validar no certifica un levantamiento GPS.
5. «Eliminar» envía el polígono a Papelera sin cambiar el territorio ni las asignaciones. Restaurarlo lo devuelve a borrador.

No se permite trasladar una geometría a otro territorio, cambiar su huella original ni borrar físicamente el historial. Si otra persona guarda cambios mientras está abierto el editor, se rechaza la versión antigua; revisar la actualización y abrirlo de nuevo.

## Permisos en Perfiles

**Seguridad → Maestros → Perfiles → Nuevo perfil → CONFIGURACIÓN → Territorios geográficos.**

| Acceso                         | Permiso           | Alcance                                                              |
| ------------------------------ | ----------------- | -------------------------------------------------------------------- |
| Visualizar mapa y prioridades  | `maps.view`       | Consultar límites, catálogo y fechas agregadas                       |
| Crear polígonos                | `maps.create`     | Dibujar límites donde no existan                                     |
| Editar límites                 | `maps.edit`       | Cambiar contornos con motivo                                         |
| Validar límites revisados      | `maps.approve`    | Confirmar una revisión con motivo                                    |
| Eliminar / restaurar polígonos | `maps.delete`     | Consultar Papelera y recuperar contornos                             |
| Importar GeoJSON               | `maps.import`     | Ejecutar lotes; necesita también crear y/o editar según su contenido |
| Exportar GeoJSON y KML         | `maps.export`     | Descargar límites con revalidación y auditoría                       |
| Exportar mapa PDF              | `maps.export_pdf` | Preparar y descargar el atlas con permiso independiente              |

Seleccionar una acción agrega visualización. Los roles base editor y lector no reciben acceso nuevo automáticamente. El administrador ve el catálogo completo; los perfiles personalizados conservan solo sus acciones asignadas. Las excepciones de 14 días / 3 meses siguen siendo independientes del mapa.

## Importación y Google Maps

El importador acepta un `FeatureCollection` GeoJSON de hasta 2 MB con 1 a 500 elementos `Feature`. Cada uno debe incluir `properties.territory_number` entero, único y activo en el catálogo y geometría `Polygon` o `MultiPolygon` WGS84. Se admiten hasta 64 partes separadas, 512 vértices más el cierre por contorno y 4096 puntos totales por territorio. Se rechazan huecos, puntos inválidos, cruces y superposición entre partes del mismo territorio. No se detectan automáticamente planos desactualizados ni se decide la división correcta entre territorios distintos.

La previsualización muestra altas, cambios y partes antes de confirmar. El lote se guarda en una transacción, con motivo y control de versiones; un error revierte todo. Restaurar primero los límites en Papelera. Importar no asigna, finaliza ni modifica fechas del S-13-S.

«Abrir en Google Maps» abre un punto de referencia dentro de la parte mayor del territorio. Para mostrar contornos en Google My Maps, descargar KML y cargarlo allí voluntariamente. La aplicación no sube límites ni crea mapas públicos. GeoJSON permite transferirlos a herramientas geográficas. Las exportaciones incluyen todas las partes vigentes y excluyen Papelera, conductores, asignaciones y domicilios restringidos. Las notas de procedencia del GeoJSON son las escritas por el usuario: no colocar datos personales en ellas.

## Seguridad y respaldo

Las geometrías se guardan en Supabase con RLS, no en GitHub Pages, el repositorio ni almacenamiento persistente del navegador. Se deniega el acceso anónimo. El mapa recibe fechas agregadas sin fichas de personas ni domicilios que no desean visitas. El servidor autoriza y audita escrituras, revisiones, eliminaciones y exportaciones. Las versiones evitan sobrescrituras; Realtime y comprobaciones periódicas actualizan la consulta.

El respaldo administrativo incluye `territory_geometries`, sus versiones, revisión, huella y Papelera. KML no sustituye ese respaldo. Conservar el PDF y los controles de calibración de forma privada por separado.

No se usa clave de Google Maps ni se activa facturación. Leaflet 1.9.4 se empaqueta localmente. Las teselas reciben solo el origen público como Referer, sin rutas de sesión ni datos de personas. Consultar la [política de teselas](https://operations.osmfoundation.org/policies/tiles/) y la [referencia de Leaflet](https://leafletjs.com/reference-1.9.4.html).

## Domicilios sin visitas

Al seleccionar un territorio se muestra su aviso de domicilios: solicitudes vigentes, plazo cumplido o ausencia de restricciones activas. Los recuentos excluyen solicitudes archivadas y en Papelera. El mapa recibe solo recuentos por territorio; las referencias y fechas de cada domicilio requieren el permiso **Visualizar** del maestro Domicilios sin visitas (`visits.view`). Con ese permiso, **Ver maestro de domicilios** abre el maestro filtrado por el territorio seleccionado. El aniversario de un año se mantiene como fecha de revisión.

## Manzanas y referencias opcionales

En **Editar → Parte del territorio** se puede escribir **Manzana o referencia (opcional)**. Admite letras, números o una referencia breve de hasta 40 caracteres; dejarla vacía no impide guardar. Cada parte conserva su propia etiqueta al mover sus vértices, agregar partes o retirar otra parte. Se exige el mismo motivo y permiso de creación o edición que para los límites.

La ficha muestra la relación de partes y etiquetas; el maestro incluye la columna **Manzanas / referencias**. **Mostrar manzanas** permite ocultarlas o verlas: aparecen al seleccionar un territorio o al acercar el mapa. El texto se trata como texto plano. Guardar cambios deja la ficha como borrador y la validación requiere el permiso existente de revisión.

Las etiquetas del plano se incorporan de forma privada, vinculando cada texto con su contorno de origen y después con la parte geográfica correspondiente. No se presupone que dos archivos enumeren las partes en el mismo orden. Las referencias dudosas o ausentes se dejan vacías; la carga queda pendiente de revisión humana y conserva los vértices y la huella de procedencia.

GeoJSON conserva las etiquetas en `properties.part_labels`, una lista en el mismo orden que `geometry.coordinates`. KML incluye la misma lista como metadatos. Los archivos anteriores pueden conservar las etiquetas existentes si no cambian los contornos. Si se modifican, reordenan, agregan o retiran partes, se debe incluir la lista explícita para evitar asociar una etiqueta a otra manzana. El servidor valida la longitud, el tipo, la versión y los permisos; un lote inválido se revierte completo. El respaldo incluye las etiquetas.

## Exportar mapa PDF (0.13.0)

En **Territorios geográficos**, el botón **Exportar mapa PDF** aparece en la parte superior, junto a las exportaciones de límites. Solo lo ve el administrador o un usuario con **Exportar mapa PDF** (`maps.export_pdf`). Este permiso es independiente de GeoJSON/KML, del formulario S-13-S y del cronograma.

Para habilitarlo a otra persona:

1. Ir a **Seguridad → Maestros → Perfiles** y crear o editar su perfil.
2. En **CONFIGURACIÓN → Territorios geográficos**, marcar **Exportar mapa PDF**. Se agrega automáticamente **Visualizar mapa y prioridades**; no se habilitan GeoJSON/KML ni edición.
3. Guardar con motivo y asignar ese perfil al usuario desde **Usuarios → Web**. Los perfiles existentes conservan sus accesos; no se concede el permiso nuevo de forma automática. El administrador ya lo tiene.

### Preparación y descarga

1. Elegir todos los territorios activos o los incluidos por los filtros actuales del mapa.
2. Elegir colores por estado de asignación o antigüedad, y si se incluyen sectores ampliados y manzanas/referencias.
3. Pulsar **Preparar vista previa**. El servidor revalida el permiso y devuelve el corte actual con los datos mínimos. No registra una descarga por preparar la vista.
4. Revisar las páginas con las flechas y ampliar a 150 % o 200 %. La previsualización dibuja una sola página y limita el tamaño del lienzo, también en pantallas estrechas.
5. Pulsar **Descargar PDF**. El servidor vuelve a comprobar el permiso y la huella del mapa, incluidos estado, fechas, etiquetas y versiones de geometría. Si cambiaron o se revocó el acceso, se rechaza la descarga; preparar otra vista previa. Una descarga aprobada registra auditoría.

El mapa general usa formato A1 horizontal; los cuatro sectores, A2 horizontal, con área de solape para conservar referencias en los bordes. El índice usa A3 horizontal e incluye las referencias completas, fechas y estados. El número de páginas del índice depende de la selección. Puede imprimirse a menor escala, con la reducción de tamaño de letras correspondiente.

El PDF conserva líneas y textos vectoriales con fuentes incorporadas: no es una captura ampliada de teselas. Las etiquetas de territorios, manzanas y calles se distribuyen evitando intersecciones entre sus cajas de texto; cuando una etiqueta se desplaza, una línea indica su ubicación. En áreas pequeñas o muy densas, consultar también los sectores y el índice. Los bordes discontinuos siguen identificando límites pendientes de revisión. Los caracteres no disponibles en la fuente generan un aviso explícito para revisar la referencia.

Las calles proceden de una **instantánea pública de OpenStreetMap**, cuya fecha se muestra en el PDF. El trazado público puede estar incompleto o cambiar con el tiempo; no certifica los límites privados. El recurso público y su licencia están documentados en [map-assets](../public/map-assets/README.md). No se descargan teselas masivamente ni se usa una API de pago.

### Seguridad y consumo

Los polígonos y etiquetas privados se obtienen con `maps.export_pdf`, solo en memoria. El PDF no incorpora conductores, domicilios sin visitas, observaciones privadas ni las notas técnicas de procedencia. No se guarda en Supabase, GitHub ni almacenamiento persistente del navegador. Al cerrar la ventana o revocarse el permiso se retira la vista previa.

La generación y descarga del archivo se hacen en el dispositivo. La base pública de calles y las fuentes se sirven como recursos estáticos; su carga no consume la transferencia de Supabase. La preparación realiza una consulta autorizada y la descarga revalida mediante una respuesta pequeña, sin retransmitir todos los límites. El historial de auditoría sí crece por las descargas aprobadas. No se contrataron servicios de pago; seguir dentro del plan gratuito depende del uso total de la aplicación y de las cuotas vigentes.
