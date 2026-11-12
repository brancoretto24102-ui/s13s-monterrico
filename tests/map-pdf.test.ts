import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  can,
  completePermissions,
  MAP_PDF_PERMISSION,
} from "../src/lib/permissions";
import {
  atlasRegions,
  clipMapLine,
  linePoint,
  mapTransform,
  mergeStreetLines,
  placeMapLabel,
  projectMapPoint,
  rectanglesOverlap,
  type Rect,
} from "../src/lib/mapPdfLayout";
import {
  generateTerritoryMapPdf,
  validatePublicBasemap,
  type PublicBasemap,
} from "../src/lib/territoryMapPdf";
import { demoMapContext } from "../src/lib/territoryMap";
import { demoSnapshot, demoProfile } from "../src/lib/demo";
import { publicBasemap } from "../scripts/prepare-public-basemap";

const fonts = {
  regular: new Uint8Array(
    readFileSync(
      "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",
    ),
  ),
  bold: new Uint8Array(
    readFileSync(
      "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf",
    ),
  ),
};

const streets: PublicBasemap = {
  version: 1,
  captured_at: "2026-11-12T02:30:08Z",
  attribution: "© OpenStreetMap contributors",
  license: "ODbL-1.0",
  features: [
    {
      kind: "road",
      road: "residential",
      name: "Calle de prueba",
      points: [
        [-80.642, -5.204],
        [-80.627, -5.204],
      ],
    },
  ],
};

describe("Independent PDF map permission", () => {
  it("grants active administrators the separate catalog action", () => {
    expect(can(demoProfile, MAP_PDF_PERMISSION)).toBe(true);
    expect(can({ ...demoProfile, active: false }, MAP_PDF_PERMISSION)).toBe(
      false,
    );
  });
  it("never inherits PDF export from GeoJSON, reports or the base role", () => {
    for (const role of ["editor", "lector"] as const) {
      expect(
        can({ ...demoProfile, role, can_export: true }, MAP_PDF_PERMISSION),
      ).toBe(false);
      expect(
        can(
          {
            ...demoProfile,
            role,
            permissions: ["maps.view", "maps.export", "reports.export"],
          },
          MAP_PDF_PERMISSION,
        ),
      ).toBe(false);
    }
  });
  it("adds map viewing without adding other export or edit actions", () => {
    expect(completePermissions([MAP_PDF_PERMISSION])).toEqual([
      "maps.export_pdf",
      "maps.view",
    ]);
    const profile = {
      ...demoProfile,
      role: "lector" as const,
      permissions: completePermissions([MAP_PDF_PERMISSION]),
    };
    expect(can(profile, MAP_PDF_PERMISSION)).toBe(true);
    expect(can(profile, "maps.export")).toBe(false);
    expect(can(profile, "maps.edit")).toBe(false);
  });
});

describe("Vector atlas layout", () => {
  it("uses the expected Mercator origin and finite Piura coordinates", () => {
    expect(projectMapPoint([0, 0])[0]).toBe(0);
    expect(projectMapPoint([-80.64, -5.19])[0]).toBeLessThan(0);
    expect(() => projectMapPoint([Infinity, 90])).toThrow();
  });
  it("maps north upward without stretching the map", () => {
    const t = mapTransform([0, 0, 100, 200], {
      x: 20,
      y: 40,
      width: 300,
      height: 300,
    });
    expect(t.scale).toBe(1.5);
    expect(t.point([50, 100])).toEqual([170, 190]);
    expect(t.point([50, 200])[1]).toBeGreaterThan(t.point([50, 0])[1]);
  });
  it("creates a general map and four overlapping detail regions", () => {
    const r = atlasRegions([0, 0, 1000, 1000], true);
    expect(r).toHaveLength(5);
    expect(r[1].bounds[2]).toBeGreaterThan(r[2].bounds[0]);
    expect(atlasRegions([0, 0, 1000, 1000], false)).toHaveLength(1);
  });
  it("rejects overlap between territory, block and rotated street labels", () => {
    const occupied: Rect[] = [],
      frame = { x: 0, y: 0, width: 300, height: 300 };
    const first = placeMapLabel(
      "62",
      [150, 150],
      18,
      13,
      frame,
      occupied,
      "territory",
    );
    expect(first).not.toBeNull();
    expect(
      placeMapLabel("Mz. H", [150, 150], 40, 11, frame, occupied, "block"),
    ).toBeNull();
    const street = placeMapLabel(
      "Calle",
      [150, 150],
      40,
      10,
      frame,
      occupied,
      "street",
      [[0, 65]],
      45,
    );
    expect(street).not.toBeNull();
    expect(rectanglesOverlap(first!.rect, street!.rect)).toBe(false);
  });
  it("clips a crossing road and preserves gaps outside the frame", () => {
    expect(
      clipMapLine(
        [
          [-5, 5],
          [15, 5],
        ],
        [0, 0, 10, 10],
      ),
    ).toEqual([
      [
        [0, 5],
        [10, 5],
      ],
    ]);
    expect(
      clipMapLine(
        [
          [-5, -5],
          [15, -5],
        ],
        [0, 0, 10, 10],
      ),
    ).toEqual([]);
    expect(
      clipMapLine(
        [
          [1, 1],
          [20, 1],
          [20, 9],
          [1, 9],
        ],
        [0, 0, 10, 10],
      ),
    ).toHaveLength(2);
  });
  it("joins split roads and interpolates along their length", () => {
    const merged = mergeStreetLines([
      [
        [0, 0],
        [10, 0],
      ],
      [
        [20, 0],
        [10, 0],
      ],
    ]);
    expect(merged).toHaveLength(1);
    expect(linePoint(merged[0], 15)).toEqual([15, 0]);
  });
  it("rejects malformed public data and invalid coordinates", () => {
    expect(() =>
      validatePublicBasemap({ ...streets, license: "unknown" }),
    ).toThrow();
    expect(() =>
      validatePublicBasemap({
        ...streets,
        features: [
          {
            kind: "road",
            points: [
              [0, 90],
              [0, 91],
            ],
          },
        ],
      }),
    ).toThrow();
  });
  it("copies only allowed public fields and rejects private map formats", () => {
    const output = publicBasemap({
      generator: "Overpass API test",
      osm3s: {
        copyright: "www.openstreetmap.org",
        timestamp_osm_base: streets.captured_at,
      },
      elements: [
        { type: "node", id: 1, lon: -80.64, lat: -5.19 },
        { type: "node", id: 2, lon: -80.63, lat: -5.19 },
        {
          type: "way",
          nodes: [1, 2],
          tags: {
            highway: "residential",
            name: "Calle pública",
            phone: "PRIVATE_SENTINEL",
            email: "PRIVATE_SENTINEL",
            source: "PRIVATE_SENTINEL",
          },
        },
      ],
    });
    expect(JSON.stringify(output)).not.toContain("PRIVATE_SENTINEL");
    expect(() =>
      publicBasemap({ type: "FeatureCollection", features: [] }),
    ).toThrow();
  });
  it("builds a bounded PDF with complete references and collision-free map labels", async () => {
    const context = demoMapContext(demoSnapshot(), "2026-11-12");
    context.shapes[0].part_labels = ["H"];
    context.shapes[0].source = "PRIVATE_SENTINEL";
    context.territories[0].description = "PRIVATE_SENTINEL";
    const result = await generateTerritoryMapPdf(
      context,
      streets,
      {
        colorMode: "assignment",
        territoryIds: context.territories.slice(0, 3).map((t) => t.id),
        includeBlocks: true,
        includeDetails: true,
      },
      "2026-11-12",
      fonts,
      true,
    );
    expect(result.pages).toBe(6);
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(6);
    expect(result.bytes.length).toBeLessThan(1_000_000);
    expect(result.blocks).toBe(1);
    expect(JSON.stringify(result.labels)).not.toContain("PRIVATE_SENTINEL");
    for (const labels of result.labels)
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++)
          expect(rectanglesOverlap(labels[i].rect, labels[j].rect)).toBe(false);
  });
  it("does not export empty, unknown or removed geometry selections", async () => {
    const context = demoMapContext(demoSnapshot(), "2026-11-12"),
      options = {
        colorMode: "coverage" as const,
        territoryIds: [],
        includeDetails: false,
        includeBlocks: false,
      };
    await expect(
      generateTerritoryMapPdf(context, streets, options, "2026-11-12", fonts),
    ).rejects.toThrow(/Selecciona/);
    await expect(
      generateTerritoryMapPdf(
        context,
        streets,
        { ...options, territoryIds: ["unknown"] },
        "2026-11-12",
        fonts,
      ),
    ).rejects.toThrow(/catálogo/);
    context.shapes[0].deleted_at = "2026-11-12";
    await expect(
      generateTerritoryMapPdf(
        context,
        streets,
        { ...options, territoryIds: [context.territories[0].id] },
        "2026-11-12",
        fonts,
      ),
    ).rejects.toThrow(/polígonos/);
  });
  it("stops a cancelled export before generating page data", async () => {
    const context = demoMapContext(demoSnapshot(), "2026-11-12"),
      controller = new AbortController();
    controller.abort();
    await expect(
      generateTerritoryMapPdf(
        context,
        streets,
        {
          colorMode: "assignment",
          territoryIds: [context.territories[0].id],
          includeDetails: false,
          includeBlocks: true,
        },
        "2026-11-12",
        fonts,
        true,
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow(/cancelada/);
  });
});
