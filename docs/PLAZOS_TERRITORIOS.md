# Plazos y excepciones de territorios

Desde la versión 0.6.0, las nuevas operaciones respetan dos reglas: esperar **14 días** desde el cierre anterior antes de iniciar otra asignación y completar cada asignación en un máximo de **3 meses calendario** desde su Fecha de Inicio. Las fechas se comprueban tanto en la interfaz como en PostgreSQL, con el día vigente de Perú.

| Caso | Resultado habitual |
| --- | --- |
| Cierre anterior 01/01/2026 | Próximo inicio desde 15/01/2026, inclusive |
| Inicio 01/01/2026 | Cierre hasta 01/04/2026, inclusive |
| Inicio 31/01/2026 | Cierre hasta 30/04/2026, último día válido del mes |
| Inicio 30/11/2023 | Cierre hasta 29/02/2024, por año bisiesto |

Los 3 meses no se sustituyen por 90 días. El tablero muestra **En descanso** y **Plazo vencido**, permite filtrarlos y presenta la próxima fecha de inicio o el límite de cierre. El historial muestra también el límite de las asignaciones abiertas. Un territorio con plazo vencido conserva su asignación abierta; el sistema no inventa una fecha de cierre.

## Autorizar una excepción

El administrador puede realizar excepciones. Para un perfil personalizado, ir a **Seguridad → Maestros → Perfiles**, editar o crear el perfil y marcar **Territorios → Procesos → Registro de asignaciones → Permitir excepciones de 14 días / 3 meses (con motivo)**. Además, seleccionar el permiso para la operación concreta: asignar, completar o corregir. Los permisos se pueden sumar entre perfiles activos.

Esta casilla no se concede automáticamente a los perfiles existentes ni al Editor o Lector. No desactiva las reglas para toda la organización: autoriza a la cuenta a justificar operaciones concretas. Una revocación se comprueba en el servidor al guardar.

Al iniciar antes de los 14 días o cerrar después de los 3 meses, el formulario explica la condición y pide **Motivo de la excepción**. Es obligatorio incluso para el administrador: entre 8 y 2000 caracteres, con contenido y sin contar espacios de relleno como justificación. Si una fecha de inicio ya deja la nueva asignación abierta por más de 3 meses al registrarla, también se necesita excepción.

Al guardar, el motivo, las fechas relevantes y las condiciones autorizadas aparecen automáticamente en **Observaciones** del territorio, con la etiqueta **Excepción autorizada de plazos**. La observación se vincula a la asignación y conserva autor, fecha y auditoría; no se sobrescribe ni elimina desde la aplicación. El registro y su justificación se guardan juntos: un conflicto o error revierte ambos. Una vez justificado un inicio anticipado, completar dentro de los 3 meses no exige repetir ese motivo.

## Correcciones e historial

Una corrección de fechas debe conservar los plazos respecto a la asignación anterior y la siguiente; si necesita excepción, usa el motivo obligatorio de la corrección y agrega la observación correspondiente. Corregir únicamente un nombre no cambia las fechas históricas ni les impone retrospectivamente esta regla. Una anulación conserva su flujo y auditoría propios.

Las importaciones históricas y los registros existentes se conservan. El formulario S-13-S mantiene las fechas reales de inicio y finalización; las justificaciones se consultan en las observaciones y no alteran el modelo oficial.

La excepción solo afecta a los plazos de descanso y duración. No permite solapar asignaciones, iniciar el mismo día del cierre anterior, completar antes del inicio, usar fechas futuras, seleccionar un conductor que no esté activo en el maestro ni sobrescribir una versión guardada por otra persona. Si otra persona guardó primero, hay que revisar el estado actualizado antes de reintentar.
