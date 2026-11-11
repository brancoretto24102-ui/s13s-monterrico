import { describe, expect, it } from "vitest";
import { can, completePermissions } from "../src/lib/permissions";
import {
  geometryCenter,
  geometryFromParts,
  googleMapsUrl,
  mapFeatureCollection,
  mapKml,
  mapTerritoryStatus,
  normalizeMapGeometry,
  prepareMapImport,
  type MapShape,
  type MapTerritory,
  type TerritoryMapContext,
} from "../src/lib/territoryMap";
import type { Profile } from "../src/lib/types";

const square = (x = -80.64, y = -5.19, side = 0.001) => [
  [x, y],
  [x + side, y],
  [x + side, y + side],
  [x, y + side],
  [x, y],
];
const polygon = (ring = square()) => ({ type: "Polygon", coordinates: [ring] });
const geometry = normalizeMapGeometry(polygon());
const territory: MapTerritory = {
  id: "t1",
  territory_number: 1,
  active: true,
  description: null,
  last_completed: null,
  assigned_at: null,
};
const shape: MapShape = {
  id: "shape1",
  territory_id: "t1",
  geometry,
  source: "Plano de prueba",
  source_hash: null,
  review_status: "draft",
  reviewed_at: null,
  reviewed_by: null,
  version: 3,
  deleted_at: null,
  created_at: "",
  updated_at: "",
};
const context: TerritoryMapContext = {
  territories: [territory],
  shapes: [shape],
  revision: "",
};
const collection = (features: unknown[]) =>
  JSON.stringify({ type: "FeatureCollection", features });
const feature = (n: unknown = 1, g: unknown = polygon()) => ({
  type: "Feature",
  properties: { territory_number: n },
  geometry: g,
});

describe("Territory geometry validation", () => {
  it("normalizes clockwise polygons without mutating the input", () => {
    const input = polygon([...square()].reverse()),
      before = JSON.stringify(input);
    expect(normalizeMapGeometry(input)).toEqual(geometry);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("keeps separate parts and closes editor contours", () => {
    const normalized = geometryFromParts([
      square().slice(0, -1) as [number, number][],
      square(-80.63).slice(0, -1) as [number, number][],
    ]);
    expect(normalized.coordinates).toHaveLength(2);
    expect(normalized.coordinates[1][0][0]).toEqual(
      normalized.coordinates[1][0].at(-1),
    );
  });
  it.each([
    null,
    {},
    { type: "Point", coordinates: [0, 0] },
    { type: "MultiPolygon", coordinates: [] },
    { type: "Polygon", coordinates: [square(), square()] },
    polygon(square().slice(0, -1)),
    polygon([
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
      [0, 0],
    ]),
    polygon([
      [0, 0],
      [1, 1],
      [0, 1],
      [1, 0],
      [0, 0],
    ]),
    polygon([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 0],
    ]),
    polygon([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
      [0, 1],
      [0, 0],
    ]),
    polygon([
      [181, 0],
      [182, 0],
      [182, 1],
      [181, 0],
    ]),
    polygon([
      [0, 86],
      [1, 86],
      [1, 87],
      [0, 86],
    ]),
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [NaN, 0],
          [0, 0],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [Infinity, 0],
          [0, 0],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, "1"],
          [0, 0],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0, 4],
          [1, 0],
          [1, 1],
          [0, 0, 4],
        ],
      ],
    },
    { type: "MultiPolygon", coordinates: [[square()], [square(-80.6395)]] },
    { type: "MultiPolygon", coordinates: [[square()], [square(-80.639)]] },
    {
      type: "MultiPolygon",
      coordinates: [[square()], [square(-80.6398, -5.1898, 0.0001)]],
    },
    {
      type: "MultiPolygon",
      coordinates: Array.from({ length: 65 }, () => [square()]),
    },
    polygon(Array.from({ length: 514 }, () => [0, 0])),
  ])("rejects malformed, ambiguous or overlapping boundaries %#", (input) => {
    expect(() => normalizeMapGeometry(input)).toThrow();
  });
  it("bounds total topology cost across parts", () => {
    const coordinates = Array.from({ length: 9 }, (_, i) => [
      Array.from({ length: 500 }, (_, j) => {
        const a = (j / 499) * 2 * Math.PI;
        return [-80 + i * 0.01 + Math.cos(a) * 0.001, -5 + Math.sin(a) * 0.001];
      }),
    ]);
    coordinates.forEach((p) => (p[0][499] = p[0][0]));
    expect(() =>
      normalizeMapGeometry({ type: "MultiPolygon", coordinates }),
    ).toThrow(/4096/);
  });
  it("uses a stable point in the largest part for Google Maps", () => {
    const multiple = normalizeMapGeometry({
      type: "MultiPolygon",
      coordinates: [[square(-80.65, -5.19, 0.0001)], [square()]],
    });
    const [lng, lat] = geometryCenter(multiple);
    expect(lng).toBeCloseTo(-80.6395, 8);
    expect(lat).toBeCloseTo(-5.1895, 8);
    const url = new URL(googleMapsUrl(multiple));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("query")).toBe("-5.1895000,-80.6395000");
    expect([...url.searchParams.keys()]).toEqual(["api", "query"]);
  });
});

describe("Geographic import and private exports", () => {
  it("captures optimistic versions and creates ids for missing boundaries", () => {
    expect(prepareMapImport(collection([feature()]), context)[0]).toMatchObject(
      { id: "shape1", territory_number: 1, expected_version: 3, geometry },
    );
    const rows = prepareMapImport(collection([feature()]), {
      ...context,
      shapes: [],
    });
    expect(rows[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(rows[0].expected_version).toBe(0);
  });
  it.each([
    "no JSON",
    JSON.stringify({ features: [] }),
    collection([]),
    collection([feature(), feature()]),
    collection([feature("1")]),
    collection([feature(1.5)]),
    collection([feature(999)]),
    collection([{ ...feature(), type: "Point" }]),
    collection([feature(1, { type: "Point", coordinates: [0, 0] })]),
  ])("rejects the whole invalid preview %#", (text) =>
    expect(() => prepareMapImport(text, context)).toThrow(),
  );
  it("requires active catalog entries and an explicit restore from Papelera", () => {
    expect(() =>
      prepareMapImport(collection([feature()]), {
        ...context,
        territories: [{ ...territory, active: false }],
      }),
    ).toThrow(/inactivo/);
    expect(() =>
      prepareMapImport(collection([feature()]), {
        ...context,
        shapes: [{ ...shape, deleted_at: "2026-01-01" }],
      }),
    ).toThrow(/Restaura/);
    expect(() => prepareMapImport(" ".repeat(2_000_001), context)).toThrow(
      /2 MB/,
    );
  });
  it("exports all active boundary parts without assignments, people or restricted addresses", () => {
    const multipart = {
      ...shape,
      geometry: normalizeMapGeometry({
        type: "MultiPolygon",
        coordinates: [[square()], [square(-80.63)]],
      }),
    };
    const rows = [
      multipart,
      { ...shape, id: "deleted", deleted_at: "2026-01-01" },
    ];
    const exported = mapFeatureCollection(rows, [
      { ...territory, description: "PRIVATE_SENTINEL" },
    ]);
    expect(exported.features).toHaveLength(1);
    expect(exported.features[0].geometry.coordinates).toHaveLength(2);
    expect(Object.keys(exported.features[0].properties)).toEqual([
      "territory_number",
      "review_status",
      "source",
    ]);
    const kml = mapKml(rows, [
      { ...territory, description: "PRIVATE_SENTINEL" },
    ]);
    expect(kml.match(/<Polygon>/g)).toHaveLength(2);
    expect(kml).toContain("Borrador");
    expect(kml).not.toContain("PRIVATE_SENTINEL");
    expect(JSON.stringify(exported)).not.toContain("PRIVATE_SENTINEL");
  });
});

describe("Operational status and granular map permissions", () => {
  it("respects 14 full days and the calendar three-month limit", () => {
    const finished = { ...territory, last_completed: "2026-01-01" };
    expect(mapTerritoryStatus(finished, "2026-01-14").key).toBe("rest");
    expect(mapTerritoryStatus(finished, "2026-01-15").key).toBe("available");
    const opened = { ...finished, assigned_at: "2026-01-31" };
    expect(mapTerritoryStatus(opened, "2026-04-30").key).toBe("assigned");
    expect(mapTerritoryStatus(opened, "2026-05-01").key).toBe("overdue");
    expect(
      mapTerritoryStatus({ ...opened, active: false }, "2026-05-01").key,
    ).toBe("inactive");
  });
  it("does not extend base roles or unrelated permissions", () => {
    const base: Profile = {
      id: "u",
      display_name: "Prueba",
      role: "editor",
      active: true,
      can_export: true,
      version: 1,
    };
    expect(can(base, "maps.view")).toBe(false);
    expect(can({ ...base, role: "lector" }, "maps.view")).toBe(false);
    expect(completePermissions(["maps.import"])).toEqual([
      "maps.import",
      "maps.view",
    ]);
    const custom = { ...base, permissions: completePermissions(["maps.edit"]) };
    expect(can(custom, "maps.view")).toBe(true);
    expect(can(custom, "maps.edit")).toBe(true);
    for (const key of [
      "maps.create",
      "maps.approve",
      "maps.delete",
      "maps.import",
      "maps.export",
      "territories.view",
    ])
      expect(can(custom, key)).toBe(false);
    expect(can({ ...base, role: "administrador" }, "maps.approve")).toBe(true);
    expect(can({ ...custom, active: false }, "maps.view")).toBe(false);
  });
});
