# Validación de la aplicación

La documentación pública describe las comprobaciones reproducibles con datos sintéticos. Los insumos originales, los resultados con nombres y los detalles de infraestructura se conservan fuera del repositorio.

## Pruebas automatizadas

- 145 pruebas unitarias: fechas, día peruano, año de servicio, rangos, actualidad, cierres al corte, historial previo, continuidad, previsualización de errores Excel, plazos y excepciones, última predicación, semáforo, orden y filtros combinados.
- 534 comprobaciones PostgreSQL: permisos, acceso anónimo e inactivo, roles, reglas de fechas, plazos y excepciones, conflictos de versión, auditoría, importación atómica, deduplicación, crecimiento del catálogo, respaldo, historial con más de mil registros y acceso privado a la plantilla.
- Ejecución con PostgreSQL 17 en la validación automática y PostgreSQL 18.6 en la validación local.
- Compilación TypeScript/Vite y revisión del paquete público aprobadas. La auditoría de dependencias de producción no detectó vulnerabilidades conocidas en esta entrega; ese resultado depende de los avisos disponibles en la fecha de ejecución.

Las pruebas de base de datos se ejecutan únicamente sobre una base vacía y desechable. El esquema de Auth/Storage se emula para verificar SQL y políticas; no equivale por sí solo a probar el servicio alojado completo.

## Maestro de conductores (0.2.0)

Se comprobaron altas idempotentes, homónimos con códigos independientes, edición, activación/desactivación, papelera/restauración, motivos, auditoría, respaldo, metadatos inmutables y prohibición de borrado físico. Editor, lector, anónimo y perfil inactivo no pueden gestionar el maestro.

Dos conexiones administrativas intentan modificar la misma versión de una ficha: una confirma y la otra recibe un conflicto. Se rechazan versiones nulas u obsoletas y selecciones de fichas que dejaron de estar activas.

Se comprobó que editar una ficha conserva los nombres históricos, que se pueden completar asignaciones anteriores de conductores inactivos y que una corrección manual del nombre de un responsable retira el vínculo anterior con el maestro. Las correcciones solo de fechas conservan ese vínculo.

En navegador, con datos ficticios temporales: crear, editar, desactivar, eliminar, filtrar Papelera, restaurar a inactivo, activar, buscar por código y seleccionar al asignar un territorio. El maestro muestra el recuento de la asignación vinculada y su estado pendiente.

En la web se comprobó el acceso administrativo, la carga del maestro y la apertura/cancelación del formulario Nuevo conductor. Estas comprobaciones no crearon personas ficticias en el catálogo operativo. El historial existente se verificó antes y después de la migración sin cambios en sus registros.

## Formulario e importación

Las comprobaciones previas del formulario contrastaron textos, fechas, continuaciones, encabezados y distribución con la referencia aprobada. Se verificó que no hubiera cambios fuera de las zonas de relleno y encabezado. Los resultados detallados contienen información personal y no se redistribuyen.

La importación se comprobó con conciliación por registro y repetición del archivo sin duplicados. Las reglas de fechas, continuidad y previsualización también tienen pruebas automatizadas con datos sintéticos. El motor PDF no se modificó en la actualización del maestro.

## Interfaz y límites

Se probaron en navegador de escritorio el tablero, historial, búsqueda, asignación, cierre, validaciones y formulario PDF. La actualización del maestro se revisó además con un ancho aproximado de 450 píxeles CSS, incluidos su listado y formulario. Las tablas amplias tienen desplazamiento propio.

No se probó un teléfono físico. La actualización visual entre dos sesiones de usuarios reales y la restauración completa en un entorno separado siguen siendo comprobaciones complementarias; los conflictos de escritura sí se comprobaron con conexiones PostgreSQL independientes.

Los controles automáticos de publicación ayudan a detectar archivos privados y credenciales, pero no sustituyen la revisión del contenido. No se deben añadir al repositorio los libros originales, PDFs con datos personales ni secretos.

## Perfiles, usuarios e interfaz (0.3.0)

Las pruebas añadidas comprueban acceso granular, unión de perfiles, ausencia de herencia básica al revocar perfiles personalizados, restricciones de tablas y snapshots, permisos de acciones, exportación, respaldo, auditoría, nombres duplicados, códigos, versiones nulas, perfiles del sistema protegidos, eliminación/restauración y protección del último administrador. Dos conexiones actualizando la misma versión de un perfil producen un guardado y un conflicto.

En la vista temporal se creó un perfil, se seleccionaron permisos en el árbol y se asignó a un usuario ficticio mediante las pestañas. Se comprobó que la interfaz rechaza eliminar al último administrador y muestra la explicación en el diálogo. Se revisó el formulario con aproximadamente 450 píxeles CSS de ancho, sin desbordamiento horizontal general; no se utilizó un teléfono físico. No se enviaron invitaciones ni recuperaciones a destinatarios adicionales durante estas pruebas.

La actualización de la base alojada conservó el acceso administrativo y los registros existentes: se comparó su huella completa antes y después, sin diferencias. Las verificaciones no crearon cuentas ni perfiles personalizados ficticios en el entorno operativo. Las pruebas del envío de correos de la puesta en marcha anterior no equivalen a probar un alta real adicional en esta actualización.

Se comprobó también el inicio de sesión en la versión publicada, la carga de los listados de Usuarios y Perfiles y la apertura del formulario Nuevo perfil con su árbol de accesos. Se canceló el formulario sin crear datos de prueba en el entorno operativo.

## Asignación desde el maestro (0.4.0)

Se comprueban selección obligatoria, búsqueda por nombre y código, homónimos independientes y exclusión de fichas inactivas o eliminadas. El RPC rechaza nombres libres, identidades inexistentes y personas sin ficha en el maestro. Un perfil autorizado a asignar recibe las opciones activas sin requerir permisos para administrar el maestro.

Una prueba con dos conexiones mantiene una desactivación sin confirmar, observa que la asignación espera el bloqueo y luego confirma la desactivación: la asignación se rechaza sin crear registros. La incorporación inicial de fichas se realiza en la base privada con auditoría; no cambia las asignaciones históricas ni se publica su contenido.

## Domicilios que no desean visitas (0.5.0)

La fecha permitida se calcula como un año calendario desde la fecha informada. Se prueban el aniversario exacto, el cambio de estado ese mismo día, el primer día del año y el 29 de febrero (28 de febrero del siguiente año). Se rechazan fechas futuras, referencias vacías y domicilios duplicados dentro del mismo territorio.

Se comprueban altas idempotentes, edición, renovación, archivo después del plazo, reactivación, Papelera/restauración, procedencia inmutable, auditoría y respaldo. Dos conexiones compiten tanto por una misma versión como por crear la misma referencia: solo una confirma. El cliente no puede escribir la fecha calculada ni modificar directamente la tabla. Los avisos activos y los plazos cumplidos se conservan hasta una acción expresa.

Los perfiles existentes mantienen sus permisos. La consulta de direcciones requiere `visits.view`; los permisos de territorios permiten consultar únicamente recuentos de avisos cuando no se dispone de ese acceso. Se prueba un perfil limitado al maestro, su selector mínimo de territorios, la revocación inmediata de sus permisos y la ausencia de datos de asignaciones fuera de su alcance.

La preparación de la hoja NO TOCAR diferencia encabezados, filas vacías y domicilios; valida sus columnas y rechaza registros incompletos o repetidos antes de la carga privada. Las comprobaciones verifican que la gestión del nuevo maestro no modifica las asignaciones.

## Plazos y excepciones (0.6.0)

Se comprueba el bloqueo al día 13 y la aceptación al día 14 después del cierre, así como el cierre inclusivo a los 3 meses calendario. Se cubren cambios de año, fines de mes y años bisiestos. La apertura con un inicio que ya excede los 3 meses también necesita autorización y motivo. Un cierre normal no vuelve a pedir la justificación de un inicio anticipado previamente autorizado.

El administrador necesita motivo; los perfiles personalizados necesitan tanto el permiso de excepción como el de la operación. Se prueban denegación por perfil lector y acceso anónimo, revocación inmediata, metadatos de usuario sin efecto y ausencia de acceso directo a los ayudantes privados. Los clientes con firmas de RPC anteriores siguen operando dentro de los plazos, pero no pueden omitir las nuevas reglas.

Se rechazan motivos vacíos, compuestos solo por espacios, tabulaciones o espacios no separables, demasiado cortos o de más de 2000 caracteres. Se verifica la conservación completa de un motivo de 2000 caracteres, la observación vinculada a su asignación y la auditoría. Dos conexiones compitiendo por una excepción producen una sola operación y una sola observación; la otra recibe un conflicto de versión.

Las correcciones de fechas revisan los descansos anterior y siguiente. Se comprueba que un parámetro de anulación nulo no permita saltarse la validación. Una corrección solo del nombre conserva las fechas históricas. Los solapamientos, las fechas futuras y las identidades no autorizadas siguen bloqueados; los errores revierten también la observación. El respaldo conserva las justificaciones.

En navegador se comprobaron, con datos ficticios temporales, el inicio durante el descanso, el cierre fuera del trimestre, el guardado deshabilitado sin motivo válido, la observación en el territorio correspondiente y la nueva casilla de Perfiles. La actualización de la base alojada conservó la huella del historial anterior, sin crear asignaciones, observaciones ni cuentas ficticias en el entorno operativo.

## Última predicación y acciones directas (0.7.0)

Se verifica el máximo cierre de todo el historial, aunque haya una asignación más reciente abierta; se excluyen anulados, fechas futuras e inválidas. Los límites de 4, 8 y 12 meses se comprueban en su aniversario exacto, con cambios de año, fines de mes y años bisiestos. Sin finalizaciones no se inventa una fecha y el color es rojo.

Se comprueban el orden numérico predeterminado, el orden de colores, las fechas más antiguas dentro del color, desempates por número, rangos inclusivos y de un solo extremo, combinaciones de color y rango, casos sin registro y rangos invertidos. El máximo cierre se calcula antes de filtrar; el rango no transforma un cierre anterior en el último. La ordenación no muta el conjunto original.

Las pruebas de permisos verifican que una cuenta que solo puede asignar no puede completar, editar ni anular, y que los permisos de corrección y anulación son independientes. En PostgreSQL se ejercitan las denegaciones directas al RPC, una corrección autorizada, una anulación autorizada y su auditoría con los perfiles mínimos correspondientes. No se cambian las reglas ni las funciones de la base alojada para ofrecer estos accesos directos.

En navegador, con datos ficticios temporales, se verificaron el filtro exacto de una fecha, la selección por color, el orden prioritario, la asignación desde la tabla, la edición del inicio, el motivo obligatorio de la anulación y la conservación de la última finalización anterior después de anular el inicio de prueba. No se modificaron registros operativos para estas comprobaciones.

## Cronograma semanal de predicación (0.8.0)

Las pruebas unitarias verifican las siete fechas desde el lunes, cruces de mes y año, día 13/14, aniversario exacto de 3 meses, bloqueo posterior y cierre que reinicia el descanso. Comprueban los valores iniciales, el retiro de territorios cerrados y días omitidos, los casos sin horario conocido, las salidas simultáneas con identidades diferentes y las prohibiciones de duplicar conductor o territorio a la misma hora.

Las comprobaciones PostgreSQL ejercitan los cuatro permisos mínimos, acceso anónimo y revocación, contexto sin nombres históricos, escritura directa prohibida, resolución de nombres/números desde UUID, motivos vacíos o inválidos, observaciones atómicas sin duplicados y trazabilidad de salidas retiradas. Incluyen el alta de la estructura inicial y su auditoría, protección frente al borrado físico y respaldo. Dos conexiones compiten por crear la misma semana y por editar la misma versión: solo una confirma. El servidor rechaza la exportación cuando cambian el descanso o la versión, y bloquea abiertos fuera del trimestre incluso para el administrador.

En navegador, con datos ficticios temporales, se retiró un territorio propuesto, se omitió el miércoles, se justificó un territorio antes de 14 días, se guardó y se compararon ambas vistas y PDF. Cambiar de semana conservó las fechas y los días elegidos, propuso únicamente las continuaciones abiertas y mantuvo el guardado anterior. También se revisó el formulario y su selector desplazable con 449 píxeles CSS de ancho, sin desbordamiento horizontal general. No se utilizó un teléfono físico. Los dos PDF descargados desde la interfaz se extrajeron y renderizaron para revisar columnas, agrupación, fechas y colores. Las pruebas de PDF comprueban también paginación con textos largos.

La actualización alojada conserva las asignaciones anteriores. La estructura inicial se incorpora de forma privada, sin crear semanas aprobadas, cuentas, conductores ni asignaciones ficticias en producción. El motor del formulario oficial S-13-S no se modifica.

## Selector, lunes e imágenes (0.8.1)

Se reprodujo en la web anterior la pantalla en blanco al abrir el selector fuera de un diálogo. Se corrigió la referencia nula al contenedor y se comprobó en navegador la búsqueda y elección de conductores tanto en el cronograma como dentro del formulario de asignación. En una vista de 449 píxeles CSS se buscó y seleccionó otra ficha, sin desbordamiento horizontal general ni error de aplicación. No se utilizó un teléfono físico.

Se eligió otro lunes con cambios pendientes, se canceló el cambio conservando los conductores y luego se confirmó el descarte para abrir la nueva semana. Se comprobó que un martes no habilita Abrir semana y que el lunes 28/12/2026 produce domingo 03/01/2027. El campo no recarga mientras se está eligiendo la fecha.

Las pruebas automatizadas actuales reemplazan las dos del antiguo PDF de cronogramas por siete de su modelo de imagen: mismas salidas y privacidad de publicadores, formato y nombres sin alterar el registro, ajuste de texto con acentos y palabras largas, división sin pérdidas, aviso ante una salida desmesurada y selección de PNG/JPG por tamaño y MIME, incluido el fallback PNG. Las imágenes de ambas versiones se descargaron desde la interfaz; se revisaron dimensiones, colores y contenido visible. Se conserva la validación de permisos y plazos en el servidor antes de exportar. El formulario oficial S-13-S sigue generándose en PDF y su motor no se modifica.

## Sugerencias, anchos y descarga elegida (0.8.2)

La revisión del paquete comprueba que la política de imágenes del HTML fuente y compilado admita los enlaces `blob:` de las previsualizaciones. La comprobación final publicada detectó y corrigió su bloqueo en la política anterior; se mantienen las restricciones de scripts y conexiones.

Las cinco pruebas unitarias nuevas cubren la exclusión semanal de territorios, varias apariciones y retorno al retirar la última o desmarcar su día; anchos por medida real de glifos, incluidos textos con menos letras pero más anchos; reducción de espacios cuando se acorta el contenido; encabezados y líneas explícitas; y límites de lienzo sin pérdida de texto. La nueva comprobación PostgreSQL verifica que consultar el contexto para previsualizar no registra EXPORT.

En navegador, con datos ficticios, se añadió y retiró un territorio desde sugerencias y se desmarcó y volvió a marcar su día. Se observó el retorno correcto de la tarjeta. Un punto de reunión largo amplió solo su columna. Se preparó una imagen sin evento de descarga automática, se cerró sin descargar y se preparó la otra versión. Después de pulsar Descargar se obtuvieron ambas imágenes y se comprobaron sus dimensiones variables, colores y contenido. El archivo descargado procede del mismo blob que se muestra en la previsualización.

## Perfiles y requisitos de contraseña (0.9.0)

El HTML renderizado del editor debe contener exactamente una casilla por cada permiso del catálogo, incluidos todos los de Cronograma semanal y la excepción de plazos. Se verifican la selección, el motivo indicado y la independencia entre crear, editar, exportar y autorizar excepciones. Las 360 comprobaciones PostgreSQL existentes cubren la concesión y revocación efectivas, el motivo obligatorio y la auditoría. No se cambian las funciones ni los roles de la base para esta corrección visual.

Las pruebas de contraseñas cubren longitud, ausencia de cada categoría, espacios y emoji que no sustituyen los símbolos admitidos, el límite exacto de 12 caracteres, todos los símbolos reconocidos y la confirmación exacta. La interfaz renderiza los cinco requisitos con su cumplimiento. Los datos de prueba son sintéticos y no son credenciales operativas.

En navegador se creó y reabrió un perfil temporal con los cuatro permisos de cronograma, la excepción y Asignar. Se conservó la selección y se comprobó que retirar la excepción desmarcara la casilla. En el formulario de contraseña, un valor incompleto quedó bloqueado, uno válido con confirmación exacta habilitó Guardar y una confirmación diferente volvió a bloquearlo. No se envió un cambio de contraseña real. La composición obligatoria de Auth se guardó y se verificó al recargar su panel.

## Territorios geográficos (0.10.0)

Las pruebas nuevas cubren geometrías Polygon/MultiPolygon, partes separadas, orientación, límites y cruces, coordenadas WGS84, centro de referencia, importaciones inválidas y exportaciones sin asignaciones. PostgreSQL comprueba RLS, usuarios inactivos y anónimos, permisos granulares, importación atómica, Papelera, revisión, auditoría, respaldo y conflictos con conexiones independientes. El contexto del mapa no devuelve personas ni direcciones restringidas. Se verifica que el historial de asignaciones conserve su huella después de todas las operaciones geográficas.

La georreferenciación del plano privado es aproximada. Los contornos importados quedan en borrador: las pruebas de integridad no certifican límites actuales ni precisión GPS. No se incluyen el plano, controles, coordenadas reales ni resultados privados en este repositorio.

Se comprobaron en navegador los filtros por color y rango, paginación, selección, edición, motivo y confirmación de revisión, Papelera/restauración y descargas GeoJSON/KML de los 82 territorios ficticios. La vista de 449 px no presenta desborde horizontal; no se probó un teléfono físico. En la base alojada se verificaron el contexto y respaldo autenticados, el catálogo de permisos, 82 geometrías en borrador con 184 partes y 6244 puntos y 82 eventos de alta. Las 820 asignaciones conservaron su huella; tabla y RPC geográficos rechazaron consultas REST anónimas. Los insumos privados se mantienen fuera del repositorio.

## Guardado de vértices y vista previa móvil (0.10.1)

Se verificó que Guardar como borrador con motivo vacío muestra el requisito y enfoca ese campo. Después de modificar un vértice y completar el motivo, la versión aumenta y el valor se conserva al reabrir el editor. Se mantienen la validación geométrica, los permisos y la auditoría del servidor.

La vista previa PDF usa PDF.js 6.5.438 con worker y fuentes locales, sin CDN ni iframe. Dibuja solo la página seleccionada, limita su bitmap a 3 millones de píxeles y permite ampliación. El buffer se copia antes de entregarlo al worker para conservar la descarga. Las solicitudes antiguas se descartan si cambia el periodo. Las pruebas cubren el límite de memoria, proporciones y motivos inválidos.

En el navegador con la política de seguridad de producción se mostraron páginas de un S-13-S de ejemplo, se cambió de página y se amplió. El PDF descargado conservó cinco páginas legibles con sus encabezados. Las imágenes de conductores y publicadores cargaron correctamente. A 449 px no hubo desborde horizontal; esta comprobación no sustituye una prueba física en Brave/Android. Solo se usaron datos ficticios y la plantilla oficial privada cargada localmente. No se modificaron registros reales ni se añadieron migraciones de base de datos.
