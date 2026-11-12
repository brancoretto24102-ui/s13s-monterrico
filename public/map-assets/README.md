# Calles públicas para la exportación vectorial

`piura-streets-v1.json` contiene exclusivamente geometría pública de calles,
edificios y áreas verdes/agua de OpenStreetMap. No incluye territorios de la
congregación, asignaciones, manzanas del plano privado ni domicilios sin visitas.

- Fuente: [OpenStreetMap](https://www.openstreetmap.org/copyright), obtenida con
  Overpass para el entorno urbano de Piura.
- Fecha de la instantánea: consultar `captured_at` dentro del archivo.
- Atribución: © OpenStreetMap contributors.
- Datos y adaptación disponibles bajo [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

La exportación usa esta instantánea estática, sin descargar teselas ni consultar
servicios de pago. Para actualizarla se puede volver a preparar una respuesta
pública de Overpass con `scripts/prepare-public-basemap.ts`. Revisar el contenido
antes de publicar: únicamente los campos permitidos por ese script deben entrar
en el paquete. No usar como entrada una exportación de Supabase o un plano privado.

Los límites privados se obtienen en memoria con el permiso `maps.export_pdf` y
no se guardan junto a este recurso público.
