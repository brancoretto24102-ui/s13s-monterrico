# Puesta en marcha — 09/11/2026

Sitio publicado: **https://brancoretto24102-ui.github.io/s13s-monterrico/**

Repositorio: https://github.com/brancoretto24102-ui/s13s-monterrico

La URL y la pantalla de acceso se comprobaron en el alojamiento real. La activación operativa todavía requiere la primera cuenta administrativa y la importación del historial.

## Publicación realizada

- Código publicado sin el Excel, nombres del historial, PDFs originales ni credenciales privadas.
- Validación de GitHub Actions completada correctamente: ejecución `42757456725`.
- Publicación manual de Pages completada correctamente: ejecución `42757845679`.
- Versión de aplicación publicada: commit `9ffbbc77439006ac286a02913492d111b601524d`.
- Pantalla de acceso conectada al proyecto Supabase real. La vista ficticia es opcional y está identificada.

## Supabase configurado

- Proyecto `lexohsdrmgunjacocxtx`, inicialmente vacío, en una organización Free. No se contrató una suscripción ni se creó un proyecto adicional.
- Tres migraciones aplicadas. 82 territorios preparados; el historial de producción sigue vacío hasta activar al administrador.
- RLS en todas las tablas. Sin escritura directa de asignaciones desde el cliente. Funciones privilegiadas en el esquema privado, con comprobación de permisos.
- Plantilla oficial guardada como `template/S-13_S.pdf` en el bucket `s13s-private`, de acceso público desactivado. Coinciden el hash admitido y los 44 165 bytes del original.
- Edge Function `invite-user` desplegada con verificación JWT y comprobación de administrador activo. No se han enviado invitaciones.
- URL de Auth y única redirección permitida configuradas con la dirección exacta de Pages.
- Autorregistro y acceso anónimo desactivados. Confirmación de correo activada; contraseña mínima de 12 caracteres y cambio seguro de contraseña configurados.
- Revisión de seguridad de la base sin avisos. Las observaciones de rendimiento restantes son índices todavía sin uso.
- Las pruebas HTTP de asignaciones, snapshot e invitación rechazan solicitudes sin autenticar.

## Verificación terminada

- 15 pruebas unitarias y 43 comprobaciones en PostgreSQL, incluida una asignación concurrente desde dos conexiones.
- Excel privado conciliado: 820 registros y un ajuste documentado de T64.
- Cuatro casos de referencia: 739/217/11, 580/179/9, 81/82/5 y 250/101/6 (asignaciones/filas/páginas).
- PDF comparado con la referencia aprobada: 931 campos, texto coincidente y ningún cambio de píxeles fuera de las zonas previstas. Tamaño mínimo observado de texto: 8,1 puntos.

## Activación pendiente

1. Autorizar expresamente el destinatario de la primera invitación y sus permisos de administrador. La revisión automática detuvo el envío; no existe una cuenta predeterminada.
2. El propietario establece su propia contraseña. Activar exclusivamente su perfil con auditoría.
3. Importar las 820 asignaciones con el procedimiento transaccional de la aplicación y comprobar la deduplicación.
4. Probar en producción inicio de sesión, exportación privada, recuperación, roles y colaboración entre dos sesiones; verificar también un teléfono real.
5. Configurar SMTP para invitar a destinatarios generales. El correo incorporado de Supabase tiene restricciones de destinatarios y frecuencia.

No se declara completada la activación mientras falten esas comprobaciones. Los insumos y resultados privados permanecen fuera de GitHub.
