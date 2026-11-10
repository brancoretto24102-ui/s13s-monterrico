# Publicación bajo control del propietario

**Proyecto conectado:** las tres migraciones siguientes ya se aplicaron en Supabase. No reejecutarlas en ese proyecto. La primera cuenta, la carga del historial y GitHub Pages siguen pendientes; consultar [el estado actual](ESTADO_DESPLIEGUE.md). Las instrucciones siguientes también sirven para una instalación nueva.

## Autorizaciones pendientes

1. Seleccionar el repositorio GitHub concreto y autorizar subir este código. La integración disponible no devolvió repositorios accesibles durante la preparación.
2. Conectar Supabase y elegir un proyecto nuevo o uno expresamente autorizado. No reutilizar una base que ya aloje otros sistemas sin revisar nombres, políticas y migraciones.
3. Autorizar aplicar las migraciones, configurar autenticación, guardar la plantilla privada y migrar las 820 asignaciones. Los datos irán al proyecto privado seleccionado, nunca a GitHub.
4. Revisar el código/configuración y autorizar la ejecución del workflow manual de GitHub Pages. Verificar después la URL real y el acceso de cada rol.

No enviar contraseñas, access tokens de administración, cadenas de conexión ni service-role keys en el chat ni en el repositorio. Utilizar la conexión del proveedor o su panel para la configuración privada.

## Supabase

Crear el proyecto en el plan Free de una cuenta controlada por el propietario. Ejecutar, en orden y una sola vez:

1. `supabase/migrations/20261110041139_s13s_core.sql`
2. `supabase/migrations/20261110041146_s13s_private_storage_realtime.sql`
3. `supabase/migrations/20261110042222_s13s_api_hardening.sql`

Puede usarse Supabase CLI con migraciones o el editor SQL del panel. Las migraciones son para un proyecto limpio. No deben reejecutarse contra tablas existentes como si fueran comandos idempotentes de mantenimiento. El esquema `private` no debe añadirse a los esquemas expuestos por la API. Se revoca ejecución pública de las funciones; solo los RPC permitidos se conceden a `authenticated`.

En Auth:

- Desactivar registros públicos de usuarios. Los perfiles nuevos siempre nacen inactivos y sin exportación, incluso si alguien intentara registrarse mediante la API.
- Establecer la URL del sitio y añadir únicamente su redirección exacta: `https://PROPIETARIO.github.io/REPOSITORIO/`.
- Elegir contraseña mínima de 12 caracteres y los controles de acceso disponibles en la cuenta.
- Revisar la entrega de correos antes de prometer invitaciones/recuperación. El servicio de correo incorporado de Supabase tiene restricciones y límites; para destinatarios generales normalmente hace falta configurar un SMTP propio. Un servicio externo puede tener plan gratuito, pero depende de sus condiciones y de la disponibilidad de un dominio. El acceso por contraseña funciona con usuarios previamente creados desde el panel, aunque no se configure correo.

Crear el primer usuario desde el panel de Auth. El propietario establece personalmente la contraseña. Después activar exclusivamente su UUID desde el editor SQL:

```sql
begin;
select set_config('app.audit_reason','Alta inicial del administrador autorizada por propietario',true);
update public.profiles
set role='administrador', active=true, can_export=true, version=version+1
where id='UUID_REAL_DEL_USUARIO';
commit;
```

El comando genera auditoría. Comprobar que se actualizó exactamente un perfil. No existe una cuenta, contraseña ni administrador predeterminado en el código.

## Invitaciones administrativas

Desplegar `supabase/functions/invite-user/index.ts` como Edge Function `invite-user`. Su comprobación decisiva es `auth.getUser()` y la consulta del rol activo en la base. El secreto administrativo solo existe en el entorno de la función.

Configurar:

| Variable | Valor |
|---|---|
| `ALLOWED_ORIGINS` | `https://PROPIETARIO.github.io` |
| `ALLOWED_REDIRECT_URLS` | URL completa y exacta del sitio, con `/` final |
| `SUPABASE_URL` | La URL del proyecto; normalmente preconfigurada por la plataforma |
| `SUPABASE_ANON_KEY` | Clave pública heredada para verificar la llamada desde la función, si el entorno la utiliza |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreto de servidor preconfigurado por Supabase; nunca una variable `VITE_*` |

`supabase/config.toml` mantiene `verify_jwt=true`. Además de la verificación de la plataforma, la función verifica cada token con `Auth.getUser()` y comprueba el perfil activo en PostgreSQL antes de usar el cliente administrativo. Sin token se rechaza la solicitud y un lector recibe 403. No retirar esas comprobaciones para resolver un error de configuración; revisar el modo de firma y la documentación actual. Confirmar ambos rechazos en el servicio desplegado antes de habilitar invitaciones reales.

Si el correo se envía pero la asignación de permisos falla, el perfil permanece inactivo. Revisar el registro en Usuarios antes de reenviar. Las invitaciones reales son comunicaciones externas: enviarlas solo por encargo del administrador.

## Plantilla e importación

Desde Configuración, iniciar sesión como administrador y cargar `S-13_S(1).pdf`. El hash admitido es:

```text
ce5e73842993004875b2e1dc4caff121f3d9c9e1a3c8fbf65617bc6f73cde3de
```

Se guarda como `template/S-13_S.pdf` en el bucket privado `s13s-private`. El paquete no contiene la plantilla. Revisar Storage y confirmar que el bucket continúa privado. No activar enlaces públicos.

Desde Importar historial, seleccionar el Excel original privado. Revisar 820 registros y el ajuste explícito de T64. La aplicación valida la cronología y no envía nada hasta confirmar. Una segunda carga idéntica devuelve el lote existente. Un archivo diferente con datos idénticos omite registros existentes; diferencias para la misma fecha/territorio provocan un rechazo que debe resolverse mediante corrección administrativa.

## GitHub Pages

Subir únicamente el directorio del proyecto, sin `node_modules`, `dist`, `.env`, insumos ni resultados de validación. `npm run check:public` detecta formatos privados comunes y claves privilegiadas; complementar con revisión manual antes de publicar. `.gitignore` evita incorporaciones accidentales habituales.

Para GitHub Free, Pages requiere normalmente un repositorio público. Eso hace público el código, no la base. Si el propietario no desea abrir el código, elegir un plan que admita Pages desde repositorios privados o acordar otro alojamiento; no cambiar de proveedor sin aprobación.

En Settings → Secrets and variables → Actions → Variables, configurar solo:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…` o anon heredada, nunca service role)

Seleccionar GitHub Actions como fuente de Pages. Para un repositorio de proyecto, el workflow fija la base como `/REPOSITORIO/`. Si se usa un repositorio `PROPIETARIO.github.io`, adaptar `VITE_BASE_PATH` a `/` antes de construir.

Ejecutar primero Validación y revisar sus resultados. Luego, con autorización, ejecutar manualmente Publicar en GitHub Pages. El workflow no se dispara automáticamente con un push. La ausencia de variables debe corregirse antes de publicar: sin ellas la web solo permite la vista ficticia.

## Verificación obligatoria en el alojamiento real

- Abrir la URL devuelta por GitHub Pages y confirmar carga de JS/CSS desde la subruta.
- Probar inicio/cierre de sesión y enlace de recuperación con una cuenta controlada por el propietario.
- Confirmar que la API rechaza usuario anónimo, lector que escribe y usuario desactivado.
- Probar dos navegadores con editores: una asignación confirma, la otra muestra conflicto; ambas pantallas se actualizan.
- Descargar la plantilla como administrador o perfil con exportación. Probar rechazo para lector sin ese permiso.
- Importar una sola vez el historial aprobado; conciliar 820 registros y los cuatro baselines.
- Generar el PDF desde la web y descargar el respaldo en un lugar privado.
- Verificar en un teléfono real menú, asignación, cierre, historial y descarga; la impresión depende del visor PDF del equipo.

La validación local no sustituye estas comprobaciones del servicio alojado.

## Plan gratuito y operación

Información consultada en fuentes oficiales el 09/11/2026:

| Servicio | Referencia gratuita |
|---|---|
| GitHub Pages | Disponible para repositorios públicos en GitHub Free |
| Supabase PostgreSQL | 500 MB por proyecto |
| Supabase Storage | 1 GB |
| Egress | 5 GB según tabla del plan |
| Auth | 50 000 usuarios activos mensuales |
| Realtime | 200 conexiones pico; 2 millones de mensajes mensuales |
| Inactividad | Un proyecto Free puede pausarse tras siete días de poca actividad |

Son cuotas del proveedor, no una garantía contractual de costo perpetuo. Supervisar uso y exportar respaldos periódicos; no activar servicios pagados para resolver límites sin autorización. Si se pausa, reactivarlo desde el panel y verificar integridad/acceso. No se han añadido automatismos de actividad artificial.

Fuentes: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [cuotas Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase), [Realtime](https://supabase.com/docs/guides/realtime/limits), [pausa](https://supabase.com/docs/guides/platform/free-project-pausing), [correo de Auth](https://supabase.com/docs/guides/auth/auth-smtp), [funciones autenticadas](https://supabase.com/docs/guides/functions/auth).
