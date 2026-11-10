# Registro de territorios S-13-S · Monterrico

Aplicación React + TypeScript con PostgreSQL/Supabase para consultar, asignar, completar y corregir territorios, importar el historial de Excel y generar el formulario oficial S-13-S. La aplicación operativa requiere un proyecto Supabase configurado. Sin configuración ofrece una sesión temporal con datos ficticios claramente identificados.

**Sitio publicado:** [Abrir Territorios · Monterrico](https://brancoretto24102-ui.github.io/s13s-monterrico/). GitHub Actions validó y publicó la aplicación correctamente. Supabase está configurado en el plan Free, con 82 territorios, RLS y la plantilla oficial en almacenamiento privado. La cuenta administrativa ya está activa y se importaron las 820 asignaciones históricas. Se comprobaron el acceso autenticado, el PDF y el respaldo desde el sitio real. Ver [estado de puesta en marcha](docs/ESTADO_DESPLIEGUE.md). La vista ficticia no sustituye a los registros reales.

## Funciones implementadas

- 82 territorios iniciales, ampliables sin reutilizar números. Historial sin máximo de asignaciones por territorio.
- Acceso con correo/contraseña; recuperación por correo comprobada hasta el envío; invitaciones administrativas mediante Edge Function y SMTP privado configurado.
- Administrador, editor y lector; permiso específico para exportar. RLS en todas las tablas privadas y almacenamiento privado del PDF original.
- Operaciones SQL transaccionales, bloqueo por territorio y versiones optimistas. Nunca se sobrescribe una modificación concurrente silenciosamente.
- Cierre el mismo día permitido; nueva asignación estrictamente posterior al cierre; comprobación del predecesor y sucesor en correcciones.
- Auditoría inmutable para usuarios de la aplicación; correcciones y anulaciones con motivo; sin borrado físico habitual.
- Importación local del Excel con previsualización, procedencia por celda, ajustes visibles, transacción atómica y deduplicación por archivo y por registro.
- Formulario oficial: cuatro asignaciones por fila, veinte filas por página, continuaciones, cierres al corte, última finalización histórica y encabezado con raya de ancho medido en cada página.
- Búsqueda, filtros, historial, observaciones y actualización por Realtime con comprobación cada 30 segundos como respaldo.
- Respaldo completo JSON y exportación CSV administrativa; los datos nunca se guardan en el repositorio ni en localStorage.
- Maestro de conductores para administradores: crear, editar, activar/desactivar, eliminar a papelera y restaurar. Código único, motivo y auditoría; selección opcional al asignar territorios. Los cronogramas quedan para la segunda etapa.

## Ejecución local

Se utiliza Node.js 24 y npm. Versiones resueltas y fijadas en `package-lock.json`.

```bash
npm ci
npm run dev
```

`config/public.json` contiene únicamente la URL y la clave PUBLICABLE del proyecto elegido. Las variables de entorno pueden sobrescribir esa configuración. La sesión ficticia permite asignar/completar temporalmente y probar el PDF cargando la plantilla oficial; no importa datos a PostgreSQL, no invita usuarios ni descarga respaldos operativos. Se reinicia al salir o recargar.

La sesión autenticada se mantiene en memoria. Al recargar la página se solicita iniciar sesión nuevamente; se evita guardar tokens o registros en almacenamiento persistente del navegador. Los enlaces de invitación y recuperación se procesan con Supabase Auth.

## Preparación de producción

Seguir [la guía de despliegue](docs/DESPLIEGUE.md), que incluye base de datos, primer administrador, correo, plantilla privada y GitHub Pages. No ejecutar migraciones ni publicar sin autorización del propietario. `pages.yml` se activa manualmente; un push no publica el sitio.

## Pruebas

```bash
npm test
npm run build
npm run check:public
npm audit --omit=dev --audit-level=high
```

Integración con una base **vacía y desechable** PostgreSQL:

```bash
TEST_DATABASE_URL=postgresql://postgres:CONTRASENA_LOCAL@localhost:5432/postgres npm run test:db
```

En Linux x64 también se puede crear un PostgreSQL efímero, sin Docker:

```bash
npm run test:db:local
```

Las pruebas rechazan una base que contenga tablas públicas. Usan usuarios y datos sintéticos. El workflow de validación utiliza un servicio PostgreSQL 17; la validación local de esta entrega utilizó PostgreSQL 18.6.

Para reproducir las conciliaciones privadas, conservar los insumos **fuera** del proyecto:

```bash
npm run verify:private -- /ruta-privada/historial.xlsx /ruta-privada/plantilla.pdf /ruta-privada/validacion
bash scripts/test-db-local.sh scripts/verify-private-db.ts /ruta-privada/validacion/preview.json
python3 scripts/validate-private-pdf.py /ruta-privada/plantilla.pdf /ruta-privada/referencia-aprobada.pdf /ruta-privada/validacion
```

La comprobación visual requiere Python, PyMuPDF, NumPy y Pillow. No forman parte del funcionamiento normal de la aplicación web. Los archivos de validación contienen nombres y deben permanecer privados.

La versión 0.3.0 incorpora [Perfiles y Usuarios](docs/PERFILES_Y_USUARIOS.md), permisos por módulo y acción, y un menú modular inspirado en la referencia visual proporcionada. El maestro de conductores se encuentra en Configuración → Maestros. La validación incluye 19 pruebas unitarias y 159 comprobaciones PostgreSQL.

Consultar [configuración del correo](docs/CORREO.md), [resultados y límites de verificación](docs/VALIDACION.md), [reglas y arquitectura](docs/ARQUITECTURA.md), [manual de uso](docs/USO.md) y [respaldo y recuperación](docs/RESPALDOS.md).

## Privacidad y costos

El código puede publicarse sin nombres, Excel, resultados PDF, plantilla ni credenciales privadas. El formulario original se valida por SHA-256 y se descarga únicamente desde almacenamiento privado autenticado. El propietario conserva los derechos y el control de sus archivos; la plantilla no se redistribuye en este paquete.

GitHub Pages y Supabase permiten comenzar con costo mensual de S/ 0 dentro de sus cuotas gratuitas. No se ha contratado ningún servicio. Los límites, la pausa por inactividad y las restricciones de envío de correo se explican en la guía de despliegue. El historial no tiene un límite artificial por territorio, pero la capacidad total está sujeta al proveedor.

Los insumos originales no se redistribuyen. La licencia del código queda a elección del propietario.
