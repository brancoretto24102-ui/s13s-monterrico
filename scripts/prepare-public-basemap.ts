// Input must be an unmodified PUBLIC Overpass JSON response, never a territory
// export. Only public road names and basic OSM geometry enter the static site.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export function publicBasemap(input: any) {
  if (
    !String(input.generator).startsWith("Overpass API") ||
    !String(input.osm3s?.copyright).includes("www.openstreetmap.org") ||
    !Array.isArray(input.elements)
  )
    throw new Error(
      "Se requiere una respuesta pública de Overpass con atribución OSM.",
    );
  const nodes = new Map<number, [number, number]>(
    input.elements
      .filter(
        (n: any) =>
          n.type === "node" && Number.isFinite(n.lon) && Number.isFinite(n.lat),
      )
      .map((n: any) => [n.id, [n.lon, n.lat]]),
  );
  const features = input.elements
    .filter((w: any) => w.type === "way")
    .flatMap((w: any) => {
      const tags = w.tags ?? {},
        points = (w.nodes ?? [])
          .map((id: number) => nodes.get(id))
          .filter(Boolean);
      if (points.length < 2) return [];
      const road =
        tags.highway && !["construction", "proposed"].includes(tags.highway);
      const closed =
        points.length > 3 &&
        points[0][0] === points.at(-1)[0] &&
        points[0][1] === points.at(-1)[1];
      const kind = road
        ? "road"
        : tags.waterway
          ? "waterway"
          : !closed
            ? null
            : tags.building
              ? "building"
              : tags.natural === "water" || tags.landuse === "reservoir"
                ? "water"
                : tags.leisure ||
                    ["grass", "forest", "meadow", "recreation_ground"].includes(
                      tags.landuse,
                    ) ||
                    ["wood", "scrub"].includes(tags.natural)
                  ? "green"
                  : null;
      if (!kind) return [];
      return [
        {
          kind,
          ...(road
            ? {
                road: String(tags.highway),
                ...(tags.name
                  ? { name: String(tags.name).normalize("NFC").slice(0, 180) }
                  : {}),
              }
            : {}),
          points: points.map((p: number[]) =>
            p.map((n) => Number(n.toFixed(7))),
          ),
        },
      ];
    });
  return {
    version: 1,
    captured_at: input.osm3s.timestamp_osm_base,
    attribution: "© OpenStreetMap contributors",
    license: "ODbL-1.0",
    license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
    source: "https://www.openstreetmap.org",
    features,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      "Uso: prepare-public-basemap.ts respuesta-osm.json destino.json",
    );
  const result = publicBasemap(JSON.parse(await readFile(input, "utf8")));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result));
  console.log(
    `Base pública: ${result.features.length} elementos; sin límites privados ni fichas de personas.`,
  );
}
