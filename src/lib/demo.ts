import { todayLima } from "./dates";
import type { Snapshot, Profile, VisitRestriction } from "./types";
import { eligibleVisitDate } from "./visitRestrictions";
export const demoProfile: Profile = {
  id: "demo",
  display_name: "Sesión de ejemplo",
  role: "administrador",
  active: true,
  can_export: true,
  version: 1,
};
export function demoSnapshot(): Snapshot {
  const today = todayLima();
  const days = (n: number) =>
    new Date(new Date(`${today}T12:00:00Z`).getTime() - n * 86400000)
      .toISOString()
      .slice(0, 10);
  const territories = Array.from({ length: 82 }, (_, i) => ({
    id: `demo-t${i + 1}`,
    territory_number: i + 1,
    active: true,
    description: null,
    version: 1,
  }));
  const assignments = territories.flatMap((t, i) =>
    i % 5 === 0
      ? []
      : [
          {
            id: `demo-a${i}`,
            territory_id: t.id,
            assigned_name_snapshot: `Colaborador ${String(i + 1).padStart(2, "0")}`,
            assigned_at: days(12 + (i % 30)),
            completed_at: i % 3 === 0 ? null : days(i % 10),
            version: 1,
            created_at: `${today}T12:00:00Z`,
          },
        ],
  );
  const conductors = Array.from({ length: 24 }, (_, i) => ({
    id: `demo-conductor-${i + 1}`,
    code: i + 1,
    person_id: `demo-person-${i + 1}`,
    display_name: `Conductor de ejemplo ${String(i + 1).padStart(2, "0")}`,
    active: true,
    deleted_at: null,
    version: 1,
  }));
  const visit_restrictions: VisitRestriction[] = [
    {
      number: 1,
      reported: days(30),
      address: "Domicilio de ejemplo A",
      active: true,
    },
    {
      number: 1,
      reported: days(400),
      address: "Domicilio de ejemplo B",
      active: true,
    },
    {
      number: 51,
      reported: days(10),
      address: "Domicilio de ejemplo C",
      active: true,
    },
    {
      number: 54,
      reported: days(500),
      address: "Domicilio de ejemplo D",
      active: false,
    },
  ].map((row, i) => ({
    id: `demo-visit-${i + 1}`,
    code: i + 1,
    territory_id: `demo-t${row.number}`,
    address_reference: row.address,
    reported_on: row.reported,
    eligible_on: eligibleVisitDate(row.reported),
    active: row.active,
    deleted_at: null,
    version: 1,
    created_at: `${row.reported}T12:00:00Z`,
    updated_at: `${row.reported}T12:00:00Z`,
  }));
  return {
    visit_restrictions,
    visit_territories: territories,
    conductors,
    territories,
    assignments,
    people: conductors.map((c) => ({
      id: c.person_id,
      display_name: c.display_name,
    })),
    revision: new Date().toISOString(),
  };
}
