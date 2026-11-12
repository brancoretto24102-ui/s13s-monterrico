# Territorios geográficos

Disponible en **Configuración → Maestros → Territorios geográficos**. El mapa y el maestro usan la misma ficha del territorio del registro S-13-S. Un territorio puede incluir varias partes separadas sin perder su número ni su historial.

## Mapa y prioridades

El color procede de la última finalización registrada: verde antes de 4 meses, amarillo desde 4, anaranjado desde 8 y rojo desde 12 meses o sin registro. Son meses calendario; se excluyen finalizaciones futuras y anuladas. El color representa antigüedad, no calidad de los límites.

Las cuatro tarjetas filtran por color. También se puede buscar, filtrar fechas y consultar disponibles, asignados, en descanso, vencidos e inactivos. El orden inicial es por número; «Ordenar por prioridad» coloca primero rojo, anaranjado, amarillo y verde, con las fechas más antiguas primero. Seleccionar un área o una ficha muestra fechas, estado y revisión, sin el texto técnico de procedencia. «Ver historial» requiere además visualizar el registro de asignaciones.

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

| Acceso                         | Permiso        | Alcance                                                              |
| ------------------------------ | -------------- | -------------------------------------------------------------------- |
| Visualizar mapa y prioridades  | `maps.view`    | Consultar límites, catálogo y fechas agregadas                       |
| Crear polígonos                | `maps.create`  | Dibujar límites donde no existan                                     |
| Editar límites                 | `maps.edit`    | Cambiar contornos con motivo                                         |
| Validar límites revisados      | `maps.approve` | Confirmar una revisión con motivo                                    |
| Eliminar / restaurar polígonos | `maps.delete`  | Consultar Papelera y recuperar contornos                             |
| Importar GeoJSON               | `maps.import`  | Ejecutar lotes; necesita también crear y/o editar según su contenido |
| Exportar GeoJSON y KML         | `maps.export`  | Descargar límites con revalidación y auditoría                       |

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
