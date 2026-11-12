import { describe, expect, it } from "vitest";
import {
  normalizePartLabels,
  normalizeMapGeometry,
  partLabelPoint,
  mapFeatureCollection,
  mapKml,
  prepareMapImport,
  type MapShape,
  type TerritoryMapContext,
} from "../src/lib/territoryMap";
const ring: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 1],
  [1, 1],
  [1, 4],
  [0, 4],
  [0, 0],
];
const geometry = normalizeMapGeometry({ type: "Polygon", coordinates: [ring] });
const shape: MapShape = {
  id: "s",
  territory_id: "t",
  geometry,
  part_labels: ["A1 & <B>"],
  source: "Fuente sintética",
  source_hash: null,
  review_status: "draft",
  reviewed_at: null,
  reviewed_by: null,
  version: 1,
  deleted_at: null,
  created_at: "",
  updated_at: "",
};
const territory = {
  id: "t",
  territory_number: 62,
  active: true,
  description: null,
  last_completed: null,
  assigned_at: null,
};
const context: TerritoryMapContext = {
  territories: [territory],
  shapes: [shape],
  revision: "",
};
describe("Manzanas opcionales por parte", () => {
  it("permite dejar todas o algunas partes sin etiqueta", () => {
    expect(normalizePartLabels(undefined, 3)).toEqual([null, null, null]);
    expect(normalizePartLabels([" H ", null, "\u00a0 "], 3)).toEqual([
      "H",
      null,
      null,
    ]);
  });
  it("conserva letras, números, subíndices escritos como A1 y espacios normalizados", () => {
    expect(normalizePartLabels(["A1", "W2", "Área\n  norte"], 3)).toEqual([
      "A1",
      "W2",
      "Área norte",
    ]);
  });
  it.each([true, {}, [1], ["a".repeat(41)], ["H", "I"], ["\u0001"]])(
    "rechaza valores sin correspondencia o fuera del límite: %j",
    (v) => {
      expect(() => normalizePartLabels(v, 1)).toThrow();
    },
  );
  it("coloca el texto dentro de una parte cóncava", () => {
    const [x, y] = partLabelPoint(ring);
    expect(x > 0 && y > 0 && x < 4 && y < 4 && (x < 1 || y < 1)).toBe(true);
  });
  it("conserva las etiquetas al exportar e importar GeoJSON", () => {
    const file = mapFeatureCollection([shape], [territory]);
    expect(
      prepareMapImport(JSON.stringify(file), context)[0].part_labels,
    ).toEqual(shape.part_labels);
    expect(file.features[0].geometry).toEqual(geometry);
  });
  it("un archivo anterior conserva etiquetas solo si mantiene los mismos contornos", () => {
    const file = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { territory_number: 62 }, geometry },
      ],
    };
    expect(
      prepareMapImport(JSON.stringify(file), context)[0].part_labels,
    ).toEqual(shape.part_labels);
    file.features[0].geometry = {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((part) =>
        part.map((ring) =>
          ring.map(([x, y]) => [x + 10, y] as [number, number]),
        ),
      ),
    };
    expect(() => prepareMapImport(JSON.stringify(file), context)).toThrow(
      /etiquetas/,
    );
    file.features[0].geometry = {
      type: "MultiPolygon",
      coordinates: [
        ...geometry.coordinates,
        [
          [
            [5, 0],
            [6, 0],
            [6, 1],
            [5, 1],
            [5, 0],
          ],
        ],
      ],
    };
    expect(() => prepareMapImport(JSON.stringify(file), context)).toThrow(
      /etiquetas/,
    );
  });
  it("escapa el texto libre en KML y conserva los metadatos", () => {
    const xml = mapKml([shape], [territory]);
    expect(xml).toContain('name="part_labels"');
    expect(xml).toContain("&amp;");
    expect(xml).not.toContain("<B>");
  });
});
