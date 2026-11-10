import type { Profile } from "./types";

export const permissionGroups = [
  {
    section: "CONFIGURACIÓN",
    module: "Domicilios que no desean visitas",
    prefix: "visits",
    actions: [
      ["view", "Visualizar"],
      ["create", "Registrar"],
      ["edit", "Editar / renovar solicitud"],
      ["state", "Archivar / activar"],
      ["delete", "Eliminar / restaurar"],
    ],
  },
  {
    section: "TERRITORIOS",
    module: "Registro de asignaciones",
    prefix: "territories",
    actions: [
      ["view", "Visualizar"],
      ["assign", "Asignar"],
      ["complete", "Completar"],
      ["correct", "Corregir historial"],
      ["void", "Anular registros"],
      ["observe", "Registrar observaciones"],
      ["create", "Crear territorios"],
      ["edit", "Editar / cambiar estado de territorios"],
    ],
  },
  {
    section: "CONFIGURACIÓN",
    module: "Conductores",
    prefix: "conductors",
    actions: [
      ["view", "Visualizar"],
      ["create", "Registrar"],
      ["edit", "Editar"],
      ["state", "Activar / desactivar"],
      ["delete", "Eliminar / restaurar"],
      ["export", "Exportar CSV"],
    ],
  },
  {
    section: "TERRITORIOS",
    module: "Formulario S-13-S",
    prefix: "reports",
    actions: [
      ["view", "Visualizar"],
      ["export", "Generar / descargar PDF"],
    ],
  },
  {
    section: "TERRITORIOS",
    module: "Importación de historial",
    prefix: "imports",
    actions: [
      ["view", "Visualizar previsualización"],
      ["execute", "Importar"],
    ],
  },
  {
    section: "SEGURIDAD",
    module: "Auditoría",
    prefix: "audit",
    actions: [["view", "Visualizar"]],
  },
] as const;
export const permissionKeys = permissionGroups.flatMap((g) =>
  g.actions.map((a) => `${g.prefix}.${a[0]}`),
);
export const editorPermissions = [
  "territories.view",
  "territories.assign",
  "territories.complete",
  "territories.observe",
  "reports.view",
];
export const readerPermissions = ["territories.view", "reports.view"];
export function can(profile: Profile | null, permission: string): boolean {
  if (
    !profile?.active ||
    profile.deleted_at ||
    !permissionKeys.includes(permission)
  )
    return false;
  if (profile.role === "administrador") return true;
  if (profile.permissions) return profile.permissions.includes(permission);
  return (
    (profile.role === "editor"
      ? editorPermissions
      : readerPermissions
    ).includes(permission) ||
    (permission === "reports.export" && profile.can_export)
  );
}
export function completePermissions(selected: readonly string[]) {
  const result = new Set(selected.filter((k) => permissionKeys.includes(k)));
  for (const key of result) result.add(key.split(".")[0] + ".view");
  if (
    [...result].some(
      (k) => k.startsWith("reports.") || k.startsWith("imports."),
    )
  )
    result.add("territories.view");
  return [...result].sort();
}
export function permissionLabel(key: string) {
  for (const g of permissionGroups) {
    const action = g.actions.find((a) => `${g.prefix}.${a[0]}` === key);
    if (action) return `${g.module} · ${action[1]}`;
  }
  return key;
}
export function csvDownload(
  filename: string,
  headers: string[],
  rows: unknown[][],
) {
  const cell = (v: unknown) => {
    let value = String(v ?? "");
    if (/^[\s]*[=+@-]/.test(value)) value = "'" + value;
    return '"' + value.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
