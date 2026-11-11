# Contraseñas personales

La persona invitada establece su contraseña mediante el enlace privado enviado por Auth. El administrador nunca debe pedirla ni introducirla en su nombre. La recuperación utiliza el mismo formulario.

## Requisitos

Se conserva el mínimo anterior de **12 caracteres**, que supera el mínimo solicitado de más de seis. Se exige al menos una mayúscula A–Z, una minúscula a–z, un número 0–9 y un símbolo admitido por Auth, como `@`, `#` o `%`. Un espacio o un emoji no sustituye el símbolo.

La pantalla indica cuáles de los cinco requisitos se cumplen y solicita escribir de nuevo la contraseña. Guardar se habilita únicamente cuando cumple todos y la confirmación coincide exactamente. La validación se repite antes de llamar a Auth. La contraseña no se recorta, registra en auditoría ni guarda en las tablas de la aplicación.

La configuración del proyecto debe exigir **longitud mínima 12** y **letras mayúsculas, minúsculas, números y símbolos** en Authentication → Sign In / Providers → Email. Debe mantenerse también en el servidor: ocultar o deshabilitar el botón del navegador no basta para proteger solicitudes directas.

La composición se configuró en el proyecto alojado el 11/11/2026 y se verificó al recargar y reabrir el proveedor Email. Se conservó la longitud mínima de 12 caracteres. No se enviaron invitaciones ni cambios de contraseña de prueba para esta comprobación.

## Cuentas existentes

Una regla nueva no modifica las contraseñas existentes ni revela si las cumplen. En la web, después de un acceso válido con una contraseña que incumpla la política o que Auth identifique como débil, se solicita establecer una nueva antes de continuar. La contraseña anterior no se conserva en el formulario. Esto no revoca sesiones anteriores ni reemplaza las restricciones de Auth para otros clientes.

No se cambian contraseñas de personas para hacer pruebas. La comprobación del formulario utiliza datos sintéticos sin enviar cambios al servicio. El cambio completo de una contraseña real lo realiza su titular.

Documentación oficial: [seguridad de contraseñas de Supabase](https://supabase.com/docs/guides/auth/password-security).
