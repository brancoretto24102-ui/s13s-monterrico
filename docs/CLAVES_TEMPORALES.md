# Claves temporales · Territorios Monterrico

**Estado:** propuesta preparada y validada, pendiente de activación. No se publicaron cambios de autenticación ni se modificaron contraseñas reales. La configuración mantiene la verificación JWT de la nueva función. La ruta de cambio necesita autorización explícita para aceptar solicitudes sin una sesión previa y autenticar en su lugar la clave temporal y el desafío limitado; la revisión automática bloqueó esa activación. No publicar la interfaz ni desplegar la función antes de resolverlo.

## Administrador

En **Seguridad → Usuarios**, utiliza la llave **Restablecer contraseña** de una cuenta activa. Indica el motivo y pulsa **Generar clave temporal**. Copia los datos y entrégalos de forma privada a la persona. La clave solo se muestra durante esa ventana, vence a las 24 horas y una nueva generación sustituye la anterior.

Otro administrador debe generar la clave temporal de tu propia cuenta. Para recuperar tu propio acceso también se conserva **Olvidé mi contraseña** por correo.

## Usuario

1. En el acceso, pulsa **Tengo una clave temporal**.
2. Introduce tu correo y la clave entregada por el administrador.
3. Crea tu contraseña personal y escríbela de nuevo para confirmarla. Debe ser diferente de la temporal y cumplir los cinco requisitos mostrados: al menos 12 caracteres, mayúscula, minúscula, número y símbolo.
4. Guarda e inicia sesión con tu contraseña personal.

La clave temporal no abre una sesión de la aplicación ni permite consultar datos. Después de validarla tienes diez minutos para completar el cambio. Si se vence esa pantalla, puedes volver a validar la clave mientras siga vigente. Al completar el cambio, la clave y la pantalla anterior quedan inutilizadas.

La contraseña actual se sustituye al completar el cambio. Si utilizas la misma cuenta en S-21, esa contraseña personal también cambia allí. Generar la clave temporal por sí solo no cierra sesiones existentes. Las invitaciones de nuevas cuentas y la recuperación por correo conservan su funcionamiento.

## Verificación y límites

Las pruebas usan datos sintéticos: claves diferentes, ausencia de tokens de Auth antes del cambio, coincidencia de correo, requisitos, clave personal distinta de la temporal, vencimientos, cuentas inactivas, rotación, uso único y finalizaciones concurrentes. PostgreSQL verifica la ausencia de permisos de lectura/escritura para usuarios normales, la exclusión de secretos de la auditoría y el bloqueo de generaciones mientras hay un cambio en curso.

El diseño guarda solo hashes de la clave y del desafío; las contraseñas personales no se escriben en tablas de la aplicación ni en auditoría. La ruta propuesta de cambio autentica estos secretos breves y no entrega una sesión de Auth. La generación requiere JWT válido y administrador activo. La política compartida de Auth no se reduce, y el flujo no registra ni modifica permisos de usuarios.

No se restablecen contraseñas reales para probar esta función.
