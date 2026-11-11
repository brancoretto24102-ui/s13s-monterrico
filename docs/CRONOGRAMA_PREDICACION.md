# Cronograma semanal de predicación

Abrir **Predicación → Procesos → Cronograma semanal**. Se prepara una sola semana para conductores; la vista e imagen de **Publicadores** se generan automáticamente con las mismas salidas, sin la columna Territorio.

## Preparar una semana

1. Elegir el lunes y pulsar **Abrir semana**. Se puede seleccionar libremente otro lunes; cambiar el campo no descarta las ediciones de la semana abierta. Si hay cambios pendientes, permite seguir editando o descartarlos expresamente antes de abrir la otra semana. La aplicación calcula las fechas hasta el domingo, con cambios de mes y año incluidos.
2. Marcar los días con predicación. Desmarcar un día lo retira de las dos versiones y las imágenes. Se pueden volver a marcar sus salidas antes de guardar; después de guardar, la auditoría conserva la versión anterior.
3. Agregar las salidas necesarias de cada día, su hora y punto de reunión. Una salida admite varios conductores activos del maestro y varios territorios; también puede quedar sin territorio, por ejemplo para una reunión virtual. Se permiten salidas simultáneas con distintos conductores y territorios.
4. Revisar los territorios sugeridos arriba. El semáforo usa la última finalización real: rojo desde 12 meses o sin registro, anaranjado desde 8, amarillo desde 4 y verde antes de 4 meses. Es una sugerencia ordenada por prioridad; no obliga a programar esos territorios. Elegir la salida de destino antes de agregar una sugerencia.
5. Guardar. Cambiar a **Conductores** o **Publicadores** para revisar, y usar **Imagen conductores** o **Imagen publicadores**. Es necesario guardar los cambios antes de descargar.

El formato reproduce las columnas del Excel, agrupa Día y Fecha para las salidas de una misma jornada, utiliza el encabezado verde y alterna jornadas grises y blancas. La descarga es una tabla compacta en imagen: fechas cortas como «9 Nov», texto centrado, bordes negros y márgenes blancos, siguiendo la referencia aprobada. Se generan PNG y JPG con la misma resolución y JPG de calidad alta, y se descarga el menor; no se reduce el tamaño del texto para ahorrar peso. La imagen tiene 1848 píxeles de ancho. Si una semana muy extensa necesita varias imágenes, conserva todas las salidas y presenta botones para descargar cada parte, con el encabezado repetido. No se imprimen las justificaciones internas.

## Valores iniciales y continuidad

Una nueva semana utiliza la estructura de la última semana guardada anteriormente: días elegidos, horarios, puntos y conductores que siguen activos. La primera utiliza una estructura inicial privada preparada desde las hojas autorizadas del Excel. El Excel y sus datos personales no forman parte del código público. Esa estructura no se registra como una semana aprobada: debe revisarse y guardarse.

Un territorio que sigue abierto en la fecha de salida se propone en su ubicación conocida de la semana anterior o de la estructura inicial. Se puede retirarlo o cambiarlo de salida. Los territorios que ya se cerraron no se arrastran automáticamente.

Los registros antiguos solo guardan una fecha de inicio, sin horario. Cuando no hay una ubicación previa, solo se propone automáticamente una salida si coinciden el día de la semana y el conductor identificado por UUID y hay una sola opción. Si existen varias opciones, aparece en **Territorios abiertos sin ubicación en este cronograma**, para colocarlo manualmente. No se inventa una hora a partir de la fecha.

## Plazos en la fecha programada

| Situación del territorio en el día de salida                        | Comportamiento                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Sigue abierto y está dentro de sus 3 meses calendario               | Se puede programar como continuación. No se crea otra asignación real.                                  |
| Sigue abierto y el día de salida supera los 3 meses desde el inicio | Se bloquea su programación, incluso para el administrador. Revisar y cerrar la asignación real primero. |
| Cerró hace menos de 14 días                                         | Advertencia con las fechas. Se permite programarlo con un motivo obligatorio de 8 a 2000 caracteres.    |
| Ya cumplió 14 días desde el cierre, o no tiene finalizaciones       | Se puede programar normalmente.                                                                         |

El día 14 ya está permitido. El límite de 3 meses incluye su aniversario; al día siguiente se bloquea. Si un cierre real se registra fuera del trimestre, la operación real requiere la autorización y el motivo habituales; el cronograma cuenta sus 14 días desde esa fecha de cierre real.

Quien tenga permiso para crear o editar el cronograma puede justificar la programación anticipada. Esa justificación queda en las observaciones del territorio y en auditoría, vinculada a semana y salida. Guardar repetidamente el mismo motivo no duplica la observación. Cambiarlo conserva ambas justificaciones en la trazabilidad. Quitar la salida no borra las observaciones anteriores.

Programar **no inicia ni cierra automáticamente** una asignación S-13-S. El cronograma puede preparar fechas futuras; el registro oficial continúa usando las fechas reales y sus permisos propios. La excepción anticipada del cronograma no concede `territories.override_timing` ni permisos para modificar el historial.

## Permisos y trabajo compartido

| Permiso en Perfiles                  | Alcance                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Visualizar                           | Consultar semanas, estructura y catálogo mínimo necesario para planificar.                         |
| Crear semanas                        | Guardar una semana nueva.                                                                          |
| Editar salidas y días                | Modificar una semana existente, incluidas sus salidas, conductores, territorios y justificaciones. |
| Descargar conductores y publicadores | Descargar las dos imágenes de una versión guardada.                                                |

Los accesos de acción incorporan Visualizar. Inicialmente solo el administrador recibe este módulo; Editor, Lector y perfiles existentes mantienen sus permisos. Para delegarlo, crear o editar un perfil y seleccionar sus acciones. El acceso al cronograma no concede acceso a direcciones de domicilios sin visitas ni a nombres históricos de asignaciones. Permite consultar las fechas mínimas necesarias para verificar los plazos.

Cada semana tiene una versión. Dos personas pueden consultarla y trabajar; si una guarda primero, la otra debe actualizar y revisar antes de guardar. No hay mezcla automática de cambios ni sobrescritura silenciosa. La consulta se actualiza cada 30 segundos y al recuperar el foco; conserva las ediciones locales pendientes. **Actualizar semana** solicita confirmación antes de descartarlas.

El servidor vuelve a validar conductores activos, plazos y versión al guardar. Antes de descargar comprueba nuevamente los plazos: si cambió el descanso de un territorio o quedó fuera del trimestre, pide revisar y guardar. Un conductor o territorio no puede aparecer dos veces a la misma fecha y hora. Se admiten hasta 100 salidas por semana, 8 conductores y 64 territorios por salida.

El respaldo JSON incluye semanas, estructura inicial privada, observaciones y auditoría. Las imágenes descargadas deben conservarse y compartirse únicamente con sus destinatarios autorizados.
