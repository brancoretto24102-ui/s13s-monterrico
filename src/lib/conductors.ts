import type { Conductor, ConductorAction } from "./types";
import { normalizeName } from "./dates";

export function assignableConductors(rows: Conductor[], query = "") {
  const search = normalizeName(query.trim());
  return rows
    .filter(
      (row) =>
        row.active &&
        !row.deleted_at &&
        (!search ||
          normalizeName(
            `${row.display_name} ${conductorCode(row.code)}`,
          ).includes(search)),
    )
    .sort(
      (a, b) =>
        a.display_name.localeCompare(b.display_name, "es") || a.code - b.code,
    );
}

export function requireAssignableConductor(
  rows: Conductor[],
  personId: string,
) {
  const selected = rows.find(
    (row) => row.person_id === personId && row.active && !row.deleted_at,
  );
  if (!selected) throw new Error("Seleccione un conductor activo del maestro.");
  return selected;
}

export function conductorCode(code: number) {
  return `C-${String(code).padStart(4, "0")}`;
}

export function conductorStatus(conductor: Conductor) {
  return conductor.deleted_at
    ? "Eliminado"
    : conductor.active
      ? "Activo"
      : "Inactivo";
}

export function conductorName(value: string) {
  const name = value.trim().replace(/\s+/g, " ").normalize("NFC");
  if (name.length < 1 || name.length > 200)
    throw new Error("El nombre debe tener entre 1 y 200 caracteres.");
  return name;
}

// Temporary demo operations use the same identities and states as the catalog.
// Permission checks and concurrency for real data are enforced in PostgreSQL.
export function changeDemoConductor(
  rows: Conductor[],
  action: ConductorAction,
  id: string,
  expectedVersion: number,
  name: string,
): Conductor[] {
  const current = rows.find((row) => row.id === id);
  if (action === "create") {
    const displayName = conductorName(name);
    if (current) {
      if (current.display_name === displayName && !current.deleted_at)
        return rows;
      throw new Error("El conductor cambió. Actualiza el maestro.");
    }
    return [
      ...rows,
      {
        id,
        code: Math.max(0, ...rows.map((row) => row.code)) + 1,
        person_id: `demo-person-${id}`,
        display_name: displayName,
        active: true,
        deleted_at: null,
        version: 1,
      },
    ];
  }
  if (!current || current.version !== expectedVersion)
    throw new Error(
      "Otro administrador actualizó este conductor. Revisa la lista.",
    );
  if (action === "restore" ? !current.deleted_at : !!current.deleted_at)
    throw new Error("El estado del conductor cambió. Revisa la lista.");
  return rows.map((row) =>
    row.id !== id
      ? row
      : {
          ...row,
          display_name:
            action === "update" ? conductorName(name) : row.display_name,
          active:
            action === "activate"
              ? true
              : ["deactivate", "delete", "restore"].includes(action)
                ? false
                : row.active,
          deleted_at:
            action === "delete"
              ? new Date().toISOString()
              : action === "restore"
                ? null
                : row.deleted_at,
          version: row.version + 1,
        },
  );
}
