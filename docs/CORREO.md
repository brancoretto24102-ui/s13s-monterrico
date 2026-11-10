# Correo de autenticación

Configuración operativa comprobada el 10/11/2026.

| Ajuste | Valor |
|---|---|
| Estado | SMTP propio activo |
| Servidor | `smtp.gmail.com` |
| Puerto | `465` |
| Transporte | TLS implícito |
| Nombre del remitente | Territorios · Monterrico |
| Remitente y usuario | Cuenta Gmail autorizada por el propietario; consultar el panel privado |
| Credencial | Contraseña de aplicación creada e introducida por el propietario |

La credencial se administra en Authentication → Emails → SMTP Settings de Supabase y se conserva cifrada según el panel. La aplicación solicita los mensajes a Supabase Auth. El propietario controla la clave desde su cuenta de Google.

## Prueba realizada

Se comprobó la configuración después de recargar el panel. Se solicitó un correo de recuperación para la cuenta administrativa autorizada y Auth registró el envío aceptado. Se mantuvieron una cuenta y las 820 asignaciones históricas.

La prueba acredita el envío. La carpeta de recepción y el cambio completo de contraseña se comprueban en el buzón y equipo del destinatario.

## Operación

- Revisar cuotas en Auth → Rate Limits y en la cuenta Gmail. El intervalo mínimo observado entre correos al mismo usuario es de 60 segundos.
- Supabase advierte que Gmail es un servicio de correo personal y que la entregabilidad puede variar. Comprobar la recepción durante la incorporación de usuarios.
- Google revoca las contraseñas de aplicación al cambiar la contraseña de la cuenta. El propietario debe generar otra y actualizar el campo privado de Supabase cuando ocurra.
- Las invitaciones deben dirigirse a personas autorizadas y con su rol y permiso de exportación definidos.

La configuración utiliza la cuenta Gmail existente. No se contrató un servicio de pago.

Fuentes oficiales: [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [servidor y puertos de Gmail](https://developers.google.com/workspace/gmail/imap/imap-smtp), [contraseñas de aplicación de Google](https://support.google.com/mail/answer/185833?hl=en).
