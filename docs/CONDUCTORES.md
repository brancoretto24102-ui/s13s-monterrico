# Maestro de conductores

Disponible en **Configuración → Maestros → Conductores**. El administrador tiene acceso completo; una cuenta con perfiles personalizados solo ve y utiliza las acciones autorizadas.

| Acción          | Resultado                                                        |
| --------------- | ---------------------------------------------------------------- |
| Nuevo conductor | Crea una ficha activa y asigna un código único como C-0001       |
| Editar          | Cambia el nombre de la ficha; conserva los nombres del historial |
| Desactivar      | Retira la ficha del selector para nuevas asignaciones            |
| Activar         | Habilita una ficha inactiva para seleccionarla otra vez          |
| Eliminar        | Envía la ficha a Papelera y conserva su historial                |
| Restaurar       | Recupera la ficha de Papelera en estado inactivo                 |

Buscar por nombre o código y filtrar Todos, Activos, Inactivos o Papelera. El listado muestra las asignaciones vinculadas mediante la identidad de la persona y cuántas siguen pendientes. Las asignaciones antiguas con solo nombre no se vinculan por coincidencia de texto.

Cada operación requiere un motivo, de 8 a 2000 caracteres; el alta propone uno editable. Los cambios quedan en Auditoría. Si otro administrador modifica la misma ficha primero, el sistema rechaza la versión anterior y refresca el listado para revisarlo antes de reintentar.

Al asignar un territorio, elegir una ficha activa en **Conductor registrado (opcional)** o conservar **Nombre manual**. Una ficha seleccionada se valida de nuevo en el servidor al guardar. Desactivar o eliminar un conductor no impide completar sus asignaciones anteriores.

No se fusionan personas por tener el mismo nombre: revisar el código antes de crear o seleccionar una ficha. Una advertencia de nombre similar permite comprobar si es otra persona o una ficha ya existente. Los códigos pueden tener saltos y no se reutilizan.

El maestro comienza sin fichas importadas automáticamente. El historial del Excel se conserva tal como fue validado. La eliminación usa una papelera recuperable para mantener las referencias y la auditoría; no existe una función de purga definitiva en la aplicación.

La vista de ejemplo permite probar temporalmente el maestro con datos ficticios. Se reinicia al salir o recargar y no guarda fichas en Supabase.
