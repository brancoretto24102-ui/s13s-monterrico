# Guía rápida

## Acceso y roles

Iniciar sesión con el correo autorizado y la contraseña personal. No hay autorregistro público. Al recargar la página se solicita acceso de nuevo porque la sesión se mantiene únicamente en memoria.

| Operación                         | Administrador | Editor      | Lector      |
| --------------------------------- | ------------- | ----------- | ----------- |
| Consultar territorios e historial | Sí            | Sí          | Sí          |
| Asignar y completar               | Sí            | Sí          | No          |
| Excepciones de plazos con motivo  | Sí            | No          | No          |
| Agregar observaciones             | Sí            | Sí          | No          |
| Corregir o anular con motivo      | Sí            | No          | No          |
| Importar y respaldar              | Sí            | No          | No          |
| Gestionar usuarios y catálogo     | Sí            | No          | No          |
| Generar PDF                       | Sí            | Con permiso | Con permiso |

El administrador puede activar o retirar la exportación de editores y lectores. Una persona que puede consultar nombres puede verlos en pantalla; el permiso de exportación controla las funciones de documentos, no impide copiar manualmente información que tiene autorización de consultar.

## Trabajo diario

El listado muestra **Última vez predicado**, calculada desde el último cierre. Permite filtrar esa fecha con **Desde / Hasta** y consultar colores según antigüedad: verde antes de 4 meses, amarillo desde 4, anaranjado desde 8 y rojo desde 12 o sin registro. Mantiene el orden numérico; **Ordenar por prioridad** pone primero los rojos y, al pulsar otra vez, devuelve el orden habitual. Ver [ejemplos, filtros y permisos](PRIORIDAD_TERRITORIOS.md).

Se puede **Asignar** directamente desde la fila. Si hay una asignación abierta, **Editar inicio** y **Eliminar inicio** aparecen según los permisos independientes del perfil. Eliminar anula con motivo y confirmación, conservando auditoría y el resto del historial. **Ver detalle** sigue disponible.

1. Abrir Territorios, buscar un número o responsable y revisar su estado.
2. Entrar al detalle y elegir Asignar si está disponible. Seleccionar un conductor activo del maestro en **Nombre del conductor** e indicar la **Fecha de Inicio**. Buscar por nombre o código; desplazar la lista para ver más opciones. Si no aparece, registrarlo o activarlo en el maestro antes de asignar.
3. Para completar, abrir el territorio asignado, indicar la fecha de finalización y confirmar.
4. La finalización puede ser el mismo día de asignación. Una nueva asignación comienza como mínimo 14 días después del cierre anterior; el cierre debe estar dentro de los 3 meses calendario desde el inicio. El sistema muestra ambas fechas límite.
5. Si otra persona guardó primero, revisar los datos actualizados antes de reintentar. El sistema conserva el primer cambio confirmado.

Las observaciones son independientes del historial oficial. Una corrección histórica solo la realiza un administrador con motivo; el registro anterior y el nuevo quedan en auditoría. La anulación conserva el registro para trazabilidad y lo retira de la historia vigente y los PDFs.

Una excepción de plazo requiere administrador o un perfil con la casilla **Permitir excepciones de 14 días / 3 meses (con motivo)**, además del permiso de la operación. El formulario exige un motivo y lo agrega automáticamente a las observaciones del territorio. No se pueden omitir las reglas de cronología, fechas futuras, identidad del conductor ni conflictos de versión. Ver [plazos y excepciones](PLAZOS_TERRITORIOS.md).

## Maestro de conductores

El administrador o una cuenta con los permisos correspondientes encuentra el maestro en **Configuración → Maestros → Conductores**. Puede crear y editar fichas, activarlas o dejarlas inactivas, eliminarlas a Papelera y restaurarlas. Cada ficha tiene un código independiente; dos personas con el mismo nombre no se fusionan. Las operaciones requieren motivo y quedan en auditoría.

Un conductor inactivo o en Papelera no está disponible en el selector para nuevas asignaciones. Su historial y sus asignaciones pendientes se conservan y pueden completarse. Restaurar devuelve la ficha a estado inactivo; activarla permite seleccionarla otra vez. Eliminar no borra definitivamente los datos.

Los registros históricos conservan el nombre original aunque se edite la ficha. Al corregir manualmente el nombre de un responsable en un registro, se retira su vínculo anterior con el maestro; no se deduce una identidad por coincidencia de nombres. Ver [guía del maestro](CONDUCTORES.md).

## Importación inicial

Seleccionar el libro privado en Importar historial. El análisis se realiza en el navegador, sin modificar el Excel. Revisar los recuentos, las incidencias y el ajuste aprobado del territorio 64. La tabla muestra los primeros 30 registros; se validan todos. No se puede confirmar con errores. La segunda carga del mismo archivo no duplica la historia.

Las hojas de conductores, observaciones y cronogramas se reconocen, pero la importación del Excel solo carga las asignaciones S-13-S. Las fichas del maestro se crean expresamente para identificar a cada persona; el historial no genera fichas automáticamente. Conservar el libro completo para las siguientes etapas.

## Formulario

Elegir año de servicio, rango exacto o mes hasta actualidad. Verificar las fechas y el encabezado antes de generar. La actualidad utiliza el día de Perú; no se toma de la última fecha del Excel. Generar la vista previa y descargar el PDF. La fecha de corte permanece fijada en ese archivo aunque se abra otro día.

Si no aparece la plantilla, el administrador debe cargar el original desde Configuración. Si el navegador del teléfono no muestra el visor incrustado, usar Descargar PDF y abrirlo en su visor. La acción Imprimir depende de las capacidades del visor/navegador.

El resumen descargable permite comprobar asignaciones, filas, páginas, territorios sin movimientos y cierres recuperados del historial. Descargar un nuevo formulario después de una corrección no modifica los PDFs descargados anteriormente.

## Administración

En Usuarios se gestionan rol, estado y exportación; cada cambio requiere motivo. El último administrador activo no se puede desactivar ni degradar. Las invitaciones necesitan el servicio de correo correctamente configurado.

En Configuración se guarda la plantilla privada, se descargan respaldos y se agregan territorios. La descripción/activación de un territorio se administra desde su detalle. El número no se cambia ni se reutiliza. Un territorio con asignación abierta debe completarse antes de desactivarlo.

## Perfiles y cuentas de acceso

En **Seguridad → Maestros → Perfiles** se crean los perfiles personalizados mediante un árbol de permisos. En **Seguridad → Maestros → Usuarios** se asignan a las cuentas desde la pestaña Perfiles web. Ver la [guía completa](PERFILES_Y_USUARIOS.md). La vista de ejemplo permite probar estas pantallas sin enviar correos ni guardar usuarios reales.

## Domicilios que no desean visitas

Abrir Configuración → Maestros → Domicilios sin visitas. Registrar Territorio, Domicilio / referencia y Fecha informada. La web calcula y muestra **Puede visitarse desde**, un año calendario después. Por ejemplo, 01/01/2026 produce 01/01/2027.

**No visitar** indica que el año todavía no se cumple. **Plazo cumplido** aparece automáticamente desde el aniversario y muestra la fecha desde la que puede visitarse. Los avisos aparecen en el inicio, en el historial del territorio y al asignarlo. El plazo no se renueva ni el domicilio se elimina automáticamente.

Renovar solicitud registra un aviso posterior y calcula un nuevo año. Archivar retira un caso revisado de los recordatorios después de cumplir el plazo. Eliminar se reserva para registros incorrectos o duplicados y utiliza una Papelera recuperable. Cada cambio requiere un motivo y conserva auditoría.

Inicialmente, el administrador gestiona el maestro. Otros usuarios necesitan permisos específicos de este módulo para consultar referencias o realizar cambios. Sin acceso a direcciones, el historial muestra los recuentos de avisos del territorio. Ver [guía del maestro](DOMICILIOS_SIN_VISITAS.md).
