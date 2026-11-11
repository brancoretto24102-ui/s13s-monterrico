# Última predicación, prioridades y acciones directas

La versión 0.7.0 agrega **Última vez predicado** en el listado y en la tabla del resumen. Esta fecha es la máxima finalización válida de todo el historial del territorio hasta el día actual de Perú. No se escribe manualmente, no depende del año de servicio seleccionado y no se sustituye por la fecha de una asignación abierta. Los registros anulados y los cierres futuros no participan. Si todavía no hay finalización, muestra **Sin registro**.

## Semáforo

| Color | Antigüedad desde la última finalización |
| --- | --- |
| Verde | Menos de 4 meses |
| Amarillo | Desde 4 meses hasta antes de cumplir 8 |
| Anaranjado | Desde 8 meses hasta antes de cumplir 12 |
| Rojo | 12 meses o más, o sin finalizaciones registradas |

Se usan meses calendario: el color cambia el día exacto del aniversario. Si ese día no existe en el mes de destino, se utiliza su último día válido. La antigüedad se recalcula con la fecha peruana al actualizar los datos y al recuperar el foco. El número del territorio y la columna de fecha muestran el color; una etiqueta de texto explica su significado sin depender únicamente del color.

El estado **Disponible / Asignado / En descanso / Plazo vencido** continúa indicando la situación de la asignación. El semáforo describe la antigüedad de la última predicación y se mantiene separado de ese estado. Un territorio puede estar asignado y conservar un color antiguo hasta registrar su finalización real.

## Filtros y orden

**Desde** y **Hasta** filtran la última fecha, incluidos ambos extremos. Se puede completar uno solo o ambos. Los territorios sin fecha quedan fuera al usar un extremo del rango; se pueden consultar con **Antigüedad → Solo sin registro**. Un rango invertido muestra un error. Los filtros se combinan con la búsqueda, el estado y el color; al cambiarlos se vuelve a la primera página.

El rango se aplica después de calcular la última finalización. Por ejemplo, si un territorio tiene cierres en marzo y noviembre y se filtra marzo, no aparece porque su última predicación es noviembre. El filtro no recupera una fecha anterior como si fuera la última.

Por defecto se conserva el **orden por número de territorio**. **Ordenar por prioridad** activa rojo → anaranjado → amarillo → verde. Dentro de cada color aparecen primero los que no tienen fecha y después las fechas más antiguas; los empates se resuelven por número de territorio. Pulsar de nuevo devuelve el orden numérico. La ordenación no cambia ni filtra los registros del formulario PDF.

## Acciones desde la tabla

- **Asignar** abre directamente el formulario para un territorio activo sin asignación abierta. Mantiene el conductor obligatorio del maestro, el descanso de 14 días y las excepciones justificadas.
- **Editar inicio** abre la corrección de la asignación actualmente abierta, con motivo obligatorio. Mantiene las validaciones cronológicas y de duración.
- **Eliminar inicio** muestra la asignación que se anulará y exige un motivo y confirmación. Conserva el territorio, el resto del historial y la auditoría. No borra físicamente el registro.
- **Ver detalle** continúa disponible para consultar el historial. Allí las acciones de corregir y anular también están separadas.

Si otro usuario guardó primero, la base rechaza la versión anterior y solicita revisar el estado actualizado. Los accesos directos utilizan los mismos RPC transaccionales que el historial.

## Perfiles independientes

En **Seguridad → Maestros → Perfiles → Territorios → Registro de asignaciones**:

| Opción | Permiso |
| --- | --- |
| Asignar / agregar inicio | `territories.assign` |
| Editar inicio / corregir historial | `territories.correct` |
| Eliminar inicio / anular registros | `territories.void` |

Para una cuenta que solo deba agregar inicios, crear un perfil personalizado y marcar únicamente **Asignar / agregar inicio**; se agrega la visualización necesaria. No marcar Completar, Editar ni Eliminar, ni vincular otro perfil que conceda esas acciones. Los permisos de varios perfiles activos se suman. Los permisos de crear o editar el catálogo de territorios son distintos y no se conceden al asignar.

No se amplían permisos de cuentas ni se alteran los perfiles existentes en esta actualización. La interfaz comprueba el acceso y la base vuelve a autorizar cada operación; ocultar botones no es la barrera de seguridad.
