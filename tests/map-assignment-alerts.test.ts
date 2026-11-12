import { describe, expect, it } from "vitest";
import { assignmentTimingIssues } from "../src/lib/assignmentTiming";
import { demoSnapshot } from "../src/lib/demo";
import { todayLima } from "../src/lib/dates";
import {
  compareMapTerritories,
  demoMapContext,
  mapTerritoryAppearance,
  mapTerritoryStatus,
  type MapTerritory,
} from "../src/lib/territoryMap";

const territory: MapTerritory = {
  id: "test-map",
  territory_number: 1,
  active: true,
  description: null,
  last_completed: null,
  assigned_at: null,
};

describe("Map assignment alerts", () => {
  it.each([
    ["2026-01-01", "rest", 14],
    ["2026-01-14", "rest", 1],
    ["2026-01-15", "available", null],
    ["2026-01-16", "available", null],
  ])(
    "keeps a completion on Jan 1 in rest through %s",
    (today, key, remaining) => {
      const status = mapTerritoryStatus(
        { ...territory, last_completed: "2026-01-01" },
        today,
      );
      expect(status.key).toBe(key);
      expect(status.daysRemaining).toBe(remaining);
      expect(status.availableOn).toBe(key === "rest" ? "2026-01-15" : null);
    },
  );

  it.each([
    ["2026-04-15", "assigned", "Abierto", 15, "#2b76b7"],
    ["2026-04-16", "closing-soon", "Por vencer", 14, "#d49b13"],
    ["2026-04-29", "closing-soon", "Por vencer", 1, "#d49b13"],
    ["2026-04-30", "limit", "Vence hoy", 0, "#d74958"],
    ["2026-05-01", "limit", "Plazo de 3 meses superado", -1, "#d74958"],
  ])(
    "shows the correct alert on %s for a Jan 31 start",
    (today, key, label, remaining, color) => {
      const status = mapTerritoryStatus(
        { ...territory, assigned_at: "2026-01-31" },
        today,
      );
      expect(status).toMatchObject({
        key,
        label,
        color,
        daysRemaining: remaining,
        deadline: "2026-04-30",
        availableOn: null,
      });
      expect(status.detail).toContain("30/04/2026");
    },
  );

  it.each([
    ["2025-11-30", "2026-02-14", "2026-02-28"],
    ["2023-11-30", "2024-02-15", "2024-02-29"],
    ["2026-10-31", "2027-01-17", "2027-01-31"],
    ["2026-08-31", "2026-11-16", "2026-11-30"],
  ])(
    "warns 14 days before the calendar deadline for %s",
    (start, today, deadline) => {
      expect(
        mapTerritoryStatus({ ...territory, assigned_at: start }, today),
      ).toMatchObject({ key: "closing-soon", daysRemaining: 14, deadline });
    },
  );

  it("does not turn a deadline-day visual alert into a late-closing exception", () => {
    expect(
      mapTerritoryStatus(
        { ...territory, assigned_at: "2026-01-31" },
        "2026-04-30",
      ).label,
    ).toBe("Vence hoy");
    expect(
      assignmentTimingIssues(
        [],
        "2026-01-31",
        "2026-04-30",
        undefined,
        "2026-04-30",
      ),
    ).toEqual([]);
    expect(
      assignmentTimingIssues(
        [],
        "2026-01-31",
        "2026-05-01",
        undefined,
        "2026-05-01",
      ),
    ).toHaveLength(1);
  });

  it("prioritizes an open assignment over recent completion or old coverage", () => {
    expect(
      mapTerritoryStatus(
        {
          ...territory,
          last_completed: "2026-04-20",
          assigned_at: "2026-04-21",
        },
        "2026-04-25",
      ).key,
    ).toBe("assigned");
    expect(
      mapTerritoryAppearance(
        {
          ...territory,
          last_completed: "2024-01-01",
          assigned_at: "2026-04-21",
        },
        "2026-04-25",
        "assignment",
      ).color,
    ).toBe("#2b76b7");
  });

  it("keeps inactive territories gray in both color modes", () => {
    const inactive = { ...territory, active: false, assigned_at: "2025-01-01" };
    for (const mode of ["assignment", "coverage"] as const) {
      expect(
        mapTerritoryAppearance(inactive, "2026-04-25", mode),
      ).toMatchObject({ key: "inactive", color: "#81939c" });
    }
  });

  it.each([
    ["2026-11-01", "#36a158"],
    ["2026-07-01", "#d6a20b"],
    ["2026-03-01", "#ed852b"],
    ["2025-11-01", "#dd5059"],
    [null, "#dd5059"],
  ])(
    "preserves coverage colors for %s when that mode is chosen",
    (date, color) => {
      expect(
        mapTerritoryAppearance(
          { ...territory, last_completed: date },
          "2026-11-11",
          "coverage",
        ).color,
      ).toBe(color);
    },
  );

  it("orders alerts by severity, then deadline, while default order remains numerical", () => {
    const today = "2026-04-30";
    const rows = [
      { ...territory, territory_number: 1 },
      { ...territory, territory_number: 2, last_completed: "2026-04-29" },
      { ...territory, territory_number: 3, assigned_at: "2026-04-01" },
      { ...territory, territory_number: 4, assigned_at: "2026-02-05" },
      { ...territory, territory_number: 5, assigned_at: "2026-01-31" },
      { ...territory, territory_number: 6, assigned_at: "2026-01-01" },
    ];
    expect(
      [...rows]
        .sort((a, b) => compareMapTerritories(a, b, today, "assignment", true))
        .map((t) => t.territory_number),
    ).toEqual([6, 5, 4, 3, 2, 1]);
    expect(
      [...rows]
        .reverse()
        .sort((a, b) => compareMapTerritories(a, b, today, "assignment", false))
        .map((t) => t.territory_number),
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("includes all five operational colors in synthetic demo data", () => {
    const today = todayLima();
    const keys = new Set(
      demoMapContext(demoSnapshot(), today).territories.map(
        (t) => mapTerritoryStatus(t, today).key,
      ),
    );
    expect([...keys].sort()).toEqual([
      "assigned",
      "available",
      "closing-soon",
      "limit",
      "rest",
    ]);
  });
});
