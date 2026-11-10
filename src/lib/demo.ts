import { todayLima } from "./dates";
import type { Snapshot, Profile } from "./types";
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
  return {
    territories,
    assignments,
    people: [],
    revision: new Date().toISOString(),
  };
}
