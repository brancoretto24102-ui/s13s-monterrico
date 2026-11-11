# Perfiles y usuarios

La versión 0.3.0 organiza el menú en módulos, Maestros, Procesos y Reportes. **Seguridad → Maestros** contiene dos pantallas diferentes: **Perfiles**, que define permisos, y **Usuarios**, que administra las cuentas. Un conductor es una ficha operativa y no recibe acceso a la web por existir en el maestro.

## Perfiles

El listado permite buscar, ordenar, filtrar por estado, cambiar el tamaño de página y exportar el resultado filtrado a CSV. Los tres perfiles del sistema —Administrador, Editor y Lector— están protegidos. Se pueden duplicar para crear un perfil personalizado.

En **Nuevo perfil**, indicar una descripción, seleccionar las acciones en el árbol de accesos y revisar el resumen de la derecha. Los accesos necesarios para visualizar se agregan automáticamente. Guardar requiere un motivo y registra los cambios en auditoría.

| Módulo                   | Acciones configurables                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Registro de asignaciones | Visualizar, asignar, completar, corregir, anular, observar, crear y editar territorios; excepciones de plazos con motivo |
| Conductores              | Visualizar, registrar, editar, cambiar estado, eliminar/restaurar y exportar CSV       |
| Formulario S-13-S        | Visualizar y generar/descargar PDF                                                     |
| Importación              | Previsualizar e importar                                                               |
| Auditoría                | Visualizar                                                                             |

Usuarios, Perfiles, respaldos y ajustes del sistema se reservan al administrador. Duplicar el perfil Administrador no convierte a un perfil personalizado en administrador del sistema.

Desde la versión 0.7.0, **Asignar / agregar inicio**, **Editar inicio / corregir historial** y **Eliminar inicio / anular registros** son opciones independientes, con los mismos permisos del servidor que ya utilizaban las operaciones del historial. Un perfil con solo Asignar puede agregar inicios y consultar los datos necesarios, pero no editar, completar ni anular. Revisar también los demás perfiles vinculados: sus permisos se suman. No es necesario conceder Crear territorios ni Editar / cambiar estado de territorios. Ver [acciones directas y ejemplo de perfil](PRIORIDAD_TERRITORIOS.md).

Desde la versión 0.6.0, el árbol de **Territorios → Procesos → Registro de asignaciones** incluye **Permitir excepciones de 14 días / 3 meses (con motivo)** (`territories.override_timing`). Permite autorizar un inicio anticipado o un cierre posterior al plazo únicamente con motivo obligatorio, incluso para administradores. No concede por sí sola permiso para asignar, completar o corregir. Los perfiles Editor, Lector y los perfiles personalizados existentes no reciben esta facultad automáticamente. La observación de excepción se registra junto con la operación en una sola transacción. Ver [reglas y ejemplos](PLAZOS_TERRITORIOS.md).

Los perfiles personalizados admiten edición, activación/desactivación y eliminación a Papelera. Al desactivar o eliminar un perfil, sus usuarios dejan de recibir esos permisos en el servidor; no se activa automáticamente un acceso básico alternativo. Restaurar deja el perfil inactivo. El listado indica cuántas cuentas están vinculadas para revisar el impacto.

## Usuarios

La tabla muestra código, alias, nombre, correo, fecha de creación, última sesión disponible, perfiles y estado. Buscar, ordenar, filtrar y exportar aplican a la tabla. Los códigos se generan automáticamente; el alias es opcional y único. **El inicio de sesión continúa usando el correo**.

En **Nuevo usuario**, completar Datos generales y revisar **Perfiles web**. Se puede elegir un perfil básico del sistema o asignar uno o varios perfiles personalizados activos. Los permisos de varios perfiles se suman. El perfil Administrador mantiene la administración completa.

Guardar un usuario nuevo envía una invitación al correo indicado. La persona define su contraseña mediante un enlace privado. No se muestra ni se introduce la contraseña desde esta pantalla. La pestaña Web cubre computadoras y celulares; no se simula una aplicación móvil independiente.

En un usuario existente se pueden cambiar nombre, alias, estado y perfiles con motivo y control de versión. El correo se muestra protegido. El icono de llave solicita confirmación y motivo antes de enviar un enlace de recuperación al correo de la cuenta; no muestra ni cambia directamente su contraseña.

Eliminar envía la cuenta a Papelera y desactiva su acceso a los registros. No elimina su identidad de Auth ni sus referencias históricas. Restaurar deja la cuenta inactiva para revisar sus permisos antes de habilitarla. El último administrador activo no puede ser eliminado, desactivado ni degradado.

## Seguridad y colaboración

Los permisos se consultan en la base en cada operación y no dependen de metadatos editables del navegador. RLS y los RPC aplican las restricciones. Los menús y acciones se adaptan a los permisos efectivos. La interfaz vuelve a consultar accesos periódicamente y al recuperar el foco; una revocación se aplica en el servidor desde el cambio confirmado.

Las operaciones de seguridad usan versiones y un bloqueo transaccional. Si otro administrador guardó primero, se rechaza la versión anterior y se solicita revisar los datos actuales. La eliminación es recuperable y las referencias y auditoría se conservan. Los respaldos incluyen perfiles personalizados y sus vínculos.

La vista de ejemplo utiliza datos ficticios temporales. Permite practicar la gestión sin enviar correos ni crear cuentas reales. Se reinicia al salir o recargar.
