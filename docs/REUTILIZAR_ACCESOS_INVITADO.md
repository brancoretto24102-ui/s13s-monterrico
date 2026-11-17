# Reutilizar accesos eliminados y perfil Invitado

Al eliminar un acceso de Territorios, su alias queda disponible. Los accesos inactivos conservan su alias. La identidad de autenticación, la contraseña, el historial y el acceso de S-21 se conservan.

En **Usuarios → Nuevo usuario**, se puede volver a guardar un correo que está en Papelera. Se recupera el mismo identificador y código de usuario con los datos, estado y perfiles elegidos en el formulario. No se crea otra identidad, no se cambia su contraseña compartida y no se envía otra invitación. La persona puede usar su contraseña actual o Google; si la olvidó, un administrador puede generar una clave temporal desde Usuarios.

Un correo cuyo acceso ya existe, activo o inactivo, debe modificarse desde su registro. No se sustituyen sus permisos al repetir el alta. Si se restaura desde Papelera un registro cuyo alias ya usa otro usuario vigente, se recupera inactivo y sin alias. El cambio queda en auditoría.

El perfil personalizado **Invitado** permite únicamente:

- Consultar Territorios geográficos.
- Consultar Registro de asignaciones y su historial.
- Visualizar el Formulario S-13-S y generar/descargar ese PDF.

No concede edición, asignación, importación, cronogramas, seguridad ni exportación del mapa. Es editable por un administrador como cualquier perfil personalizado. Su cuenta se aprovisiona como dato administrativo, sin incluir contraseñas o credenciales en el repositorio ni en el paquete público.
