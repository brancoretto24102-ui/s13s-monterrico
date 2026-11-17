# Accesos independientes e ingreso con Google

## Eliminación y estado de las cuentas

- **Eliminar en Territorios (S-13):** retira únicamente el acceso de S-13 y lo mueve a Papelera. No elimina la identidad de autenticación ni la autorización de S-21. El historial y la auditoría se conservan.
- **Eliminar en S-21:** retira la autorización de S-21, conservando el acceso de S-13 y la identidad compartida. Los informes se conservan.
- Activar, desactivar o restaurar un acceso en un sistema no habilita automáticamente el otro. Restaurar desde Papelera en S-13 conserva el estado inactivo hasta la revisión administrativa.
- **Cerrar sesión:** cada aplicación termina solo su sesión actual. No revoca las sesiones de la otra aplicación.

La identidad compartida permite utilizar el mismo correo o proveedor. Los permisos y el estado de acceso se comprueban por separado en cada aplicación. Una contraseña personal de la identidad compartida sigue siendo común; eliminar el acceso de una aplicación no elimina esa identidad.

## Ingreso con Gmail

En la pantalla de acceso de Territorios, pulsa **Continuar con Google** y selecciona el correo que el administrador autorizó. Google verifica la identidad; los permisos de Territorios determinan si puede entrar. Una cuenta inactiva o en Papelera sigue bloqueada aunque Google la autentique. El registro público permanece cerrado.

Se conserva el ingreso por contraseña, la clave temporal y los enlaces privados de invitación o recuperación.

## Implementación y comprobaciones

Google ya está configurado en el servicio. La interfaz consulta su disponibilidad real y usa PKCE, retorno al directorio de S-13 y selección explícita de cuenta. El verificador solo permanece diez minutos en el almacenamiento de la pestaña; sesiones y tokens permanecen en memoria. Las claves temporales de OAuth y la sesión de S-13 utilizan nombres distintos de los de S-21. Los códigos y errores del retorno se retiran de la dirección antes de completar el ingreso. Los enlaces de invitación y recuperación conservan su flujo anterior.

Las pruebas sintéticas de PostgreSQL verifican eliminación en S-13, restauración inactiva, eliminación local equivalente de S-21 e inactivación en ambos sentidos sin borrar la identidad compartida. El backend publicado de S-21 ya preserva Auth al eliminar su autorización. Las pruebas con el SDK instalado verifican PKCE, almacenamiento temporal, limpieza del retorno y cierre local para una identidad con dos sesiones independientes. No se eliminan ni desactivan cuentas reales para estas comprobaciones.
