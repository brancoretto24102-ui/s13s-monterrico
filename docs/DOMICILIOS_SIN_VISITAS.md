# Domicilios que no desean visitas

Disponible en **Configuración → Maestros → Domicilios sin visitas**. El administrador tiene acceso al módulo. Otros perfiles requieren permisos específicos; no se les conceden automáticamente.

| Campo                  | Uso                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Territorio             | Territorio al que pertenece la casa                                                       |
| Domicilio / referencia | Dirección o descripción para identificarla, equivalente a Observación en la hoja NO TOCAR |
| Fecha informada        | Fecha en que se comunicó la solicitud                                                     |
| Puede visitarse desde  | Calculada como un año calendario desde la fecha informada                                 |

Una solicitud del **01/01/2026** muestra **01/01/2027** como fecha desde la que puede visitarse. Hasta el día anterior indica **No visitar**; desde el aniversario indica **Plazo cumplido**. En una solicitud del 29 de febrero se utiliza el 28 de febrero del siguiente año. No se admiten fechas futuras.

El inicio avisa de los plazos cumplidos. En el historial de cada territorio aparece un recuadro con sus domicilios, estados y fechas, o un mensaje si no tiene restricciones activas. El formulario de asignación también muestra el aviso, sin bloquear el trabajo en otras casas del territorio. Si una cuenta solo tiene consulta de territorios, ve los recuentos y necesita acceso al maestro para consultar las referencias.

| Acción            | Resultado                                                                  |
| ----------------- | -------------------------------------------------------------------------- |
| Registrar         | Crea una solicitud y calcula su aniversario                                |
| Editar            | Corrige los datos con motivo y auditoría                                   |
| Renovar solicitud | Registra un aviso posterior y vuelve a calcular el año                     |
| Archivar          | Retira de los recordatorios un caso revisado, después de cumplir el año    |
| Activar           | Vuelve a mostrar el aviso correspondiente a la fecha conservada            |
| Eliminar          | Envía un registro incorrecto o duplicado a Papelera; conserva la auditoría |
| Restaurar         | Recupera el domicilio y reactiva el aviso correspondiente                  |

El aviso de plazo cumplido permanece hasta revisar o renovar el caso. No se envían correos ni se generan notificaciones fuera de la web. Cerrar el navegador no pierde el registro; al volver a entrar, se calcula el estado correspondiente a la fecha de Perú.

Los permisos se administran en Seguridad → Maestros → Perfiles: visualizar, registrar, editar/renovar, archivar/activar y eliminar/restaurar. Las operaciones se validan otra vez en la base de datos. Si otra persona modificó la misma ficha, se rechaza la versión anterior y debe revisarse el registro antes de reintentar.

La referencia no se duplica dentro del mismo territorio por diferencias de espacios o mayúsculas. Las casas con una referencia distinta no se fusionan automáticamente. El mismo texto puede existir en territorios diferentes.

La carga inicial desde NO TOCAR conserva fecha, territorio, observación y celdas de procedencia; separa el encabezado de los domicilios. `scripts/prepare-visit-import.ts` valida y prepara un archivo privado fuera del repositorio, sin modificar la base ni mostrar direcciones en consola. La carga se ejecuta expresamente en la base privada, con auditoría y deduplicación por procedencia. La importación habitual S-13-S sigue dedicada a las asignaciones.

Las referencias privadas no se publican con el código ni se agregan al PDF oficial. Los respaldos administrativos incluyen todos los estados y la auditoría.
