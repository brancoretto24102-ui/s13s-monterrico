import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Download,
  Search,
  Pencil,
  Trash2,
  RotateCcw,
  KeyRound,
  Copy,
  ShieldCheck,
  Save,
  X,
  ArrowUpDown,
  CheckCircle2,
  UserCheck,
  UserX,
} from "lucide-react";
import { rpc, supabase } from "../lib/client";
import { normalizeName } from "../lib/dates";
import {
  completePermissions,
  csvDownload,
  editorPermissions,
  permissionKeys,
  permissionLabel,
  readerPermissions,
} from "../lib/permissions";
import type { AccessProfile, ManagedUser, Role } from "../lib/types";
import DataPager from "./DataPager";
import Modal from "./Modal";
import ProfilePermissions from "./ProfilePermissions";
import { MIN_PASSWORD_LENGTH } from "../lib/passwordPolicy";
export interface DemoSecurity {
  profiles: AccessProfile[];
  users: ManagedUser[];
}
export function initialDemoSecurity(): DemoSecurity {
  const now = new Date().toISOString();
  return {
    profiles: (["administrador", "editor", "lector"] as Role[]).map(
      (role, i) => ({
        id: `demo-profile-${i}`,
        code: i + 1,
        name: role[0].toUpperCase() + role.slice(1),
        system_key: role,
        active: true,
        deleted_at: null,
        version: 1,
        created_at: now,
        updated_at: now,
        permissions:
          role === "administrador"
            ? [...permissionKeys]
            : role === "editor"
              ? editorPermissions
              : readerPermissions,
        users_count: i === 0 ? 1 : 0,
      }),
    ),
    users: [
      {
        id: "demo",
        code: 1,
        display_name: "Administrador de ejemplo",
        username: "admin.ejemplo",
        email: "admin@example.invalid",
        role: "administrador",
        active: true,
        can_export: true,
        version: 1,
        created_at: now,
        last_sign_in_at: null,
        access_mode: "base",
        access_profile_ids: [],
        deleted_at: null,
      },
    ],
  };
}
type Mode =
  | "create"
  | "update"
  | "activate"
  | "deactivate"
  | "delete"
  | "restore"
  | "reset";
interface Form {
  mode: Mode;
  id: string;
  version: number;
  name: string;
  permissions: string[];
  email: string;
  username: string;
  role: Role;
  active: boolean;
  can_export: boolean;
  access_mode: "base" | "custom";
  profile_ids: string[];
  reason: string;
  users_count: number;
}
const labels: Record<Mode, string> = {
  create: "Nuevo",
  update: "Editar",
  activate: "Activar",
  deactivate: "Desactivar",
  delete: "Eliminar",
  restore: "Restaurar",
  reset: "Restablecer contraseña",
};
const date = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const code = (prefix: string, n: number) =>
  `${prefix}-${String(n).padStart(4, "0")}`;
export default function SecurityPanel({
  kind,
  demo,
  demoData,
  onDemoChange,
  onChanged,
  revision,
}: {
  kind: "profiles" | "users";
  demo: boolean;
  demoData: DemoSecurity;
  onDemoChange: (d: DemoSecurity) => void;
  onChanged: () => Promise<void>;
  revision: string;
}) {
  const [stored, setStored] = useState<DemoSecurity>({
      profiles: [],
      users: [],
    }),
    [loading, setLoading] = useState(!demo),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10),
    [sort, setSort] = useState("code"),
    [desc, setDesc] = useState(false);
  const [form, setForm] = useState<Form | null>(null),
    [tab, setTab] = useState("general");
  const data = useMemo(
      () =>
        demo
          ? {
              ...demoData,
              profiles: demoData.profiles.map((p) => ({
                ...p,
                users_count: demoData.users.filter(
                  (u) =>
                    !u.deleted_at &&
                    (p.system_key
                      ? u.access_mode === "base" && u.role === p.system_key
                      : u.access_mode === "custom" &&
                        u.access_profile_ids.includes(p.id)),
                ).length,
              })),
            }
          : stored,
      [demo, demoData, stored],
    ),
    profiles = kind === "profiles";
  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    try {
      const [p, u] = await Promise.all([
        rpc<AccessProfile[]>("get_access_profiles"),
        rpc<ManagedUser[]>("get_users"),
      ]);
      setStored({ profiles: p, users: u });
      setError("");
    } catch (e) {
      setStored({ profiles: [], users: [] });
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    void load();
  }, [load, revision]);
  useEffect(() => {
    setQuery("");
    setStatus("all");
    setPage(1);
    setForm(null);
    setError("");
    setMessage("");
  }, [kind]);
  const rows = useMemo(() => {
    const list: (AccessProfile | ManagedUser)[] = profiles
      ? data.profiles
      : data.users;
    return list
      .filter((r) => {
        const deleted = !!r.deleted_at;
        return (
          (status === "deleted"
            ? deleted
            : !deleted &&
              (status === "all" ||
                (status === "active" ? r.active : !r.active))) &&
          normalizeName(
            "name" in r
              ? `${r.name} ${code("P", r.code)}`
              : `${r.display_name} ${r.username ?? ""} ${r.email ?? ""} ${code("U", r.code)}`,
          ).includes(normalizeName(query))
        );
      })
      .sort((a, b) => {
        let av: unknown, bv: unknown;
        if (sort === "name") {
          av = "name" in a ? a.name : a.display_name;
          bv = "name" in b ? b.name : b.display_name;
        } else if (sort === "created_at") {
          av = a.created_at;
          bv = b.created_at;
        } else if (sort === "active") {
          av = +a.active;
          bv = +b.active;
        } else {
          av = a.code;
          bv = b.code;
        }
        const n =
          typeof av === "number"
            ? av - Number(bv)
            : String(av).localeCompare(String(bv), "es");
        return desc ? -n : n;
      });
  }, [data, profiles, status, query, sort, desc]);
  const currentPage = Math.min(
      page,
      Math.max(1, Math.ceil(rows.length / size)),
    ),
    visible = rows.slice((currentPage - 1) * size, currentPage * size);
  const activeProfiles = data.profiles.filter(
    (p) => p.active && !p.deleted_at && !p.system_key,
  );
  function order(key: string) {
    if (sort === key) setDesc(!desc);
    else {
      setSort(key);
      setDesc(false);
    }
    setPage(1);
  }
  function open(mode: Mode, row?: AccessProfile | ManagedUser, clone = false) {
    setError("");
    setMessage("");
    setTab("general");
    const p = row && "name" in row ? row : null,
      u = row && "display_name" in row ? row : null;
    setForm({
      mode,
      id: clone || !row ? crypto.randomUUID() : row.id,
      version: clone ? 0 : (row?.version ?? 0),
      name: clone
        ? `${p?.name ?? ""} (copia)`
        : (p?.name ?? u?.display_name ?? ""),
      permissions: p?.permissions ?? [],
      email: u?.email ?? "",
      username: u?.username ?? "",
      role: u?.role ?? "lector",
      active: u?.active ?? true,
      can_export: u?.can_export ?? false,
      access_mode: u?.access_mode ?? "base",
      profile_ids: u?.access_profile_ids ?? [],
      reason:
        mode === "create"
          ? "Alta de " + (profiles ? "perfil de acceso" : "usuario autorizado")
          : "",
      users_count: p?.users_count ?? 0,
    });
  }
  const patch = (p: Partial<Form>) =>
    setForm((f) => (f ? { ...f, ...p } : null));
  function togglePermission(key: string, checked: boolean) {
    if (!form) return;
    let selected = form.permissions.filter((p) => p !== key);
    if (checked) selected.push(key);
    else if (key.endsWith(".view"))
      selected = selected.filter((p) => !p.startsWith(key.split(".")[0] + "."));
    patch({ permissions: completePermissions(selected) });
  }
  function exportRows() {
    if (profiles)
      csvDownload(
        "perfiles.csv",
        ["Código", "Descripción", "Tipo", "Creación", "Estado", "Permisos"],
        (rows as AccessProfile[]).map((p) => [
          code("P", p.code),
          p.name,
          "Web",
          date(p.created_at),
          p.deleted_at ? "Papelera" : p.active ? "Activo" : "Inactivo",
          p.permissions.map(permissionLabel).join(" | "),
        ]),
      );
    else
      csvDownload(
        "usuarios.csv",
        [
          "Código",
          "Usuario",
          "Nombre",
          "Correo",
          "Creación",
          "Última sesión",
          "Estado",
          "Perfiles",
        ],
        (rows as ManagedUser[]).map((u) => [
          code("U", u.code),
          u.username,
          u.display_name,
          u.email,
          date(u.created_at),
          date(u.last_sign_in_at),
          u.deleted_at ? "Papelera" : u.active ? "Activo" : "Inactivo",
          u.access_mode === "base"
            ? u.role
            : u.access_profile_ids
                .map(
                  (id) =>
                    data.profiles.find((p) => p.id === id)?.name ??
                    "Perfil no disponible",
                )
                .join(" | "),
        ]),
      );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setError("");
    try {
      if (form.reason.trim().length < 8)
        throw new Error("Describe el motivo con al menos 8 caracteres.");
      const now = new Date().toISOString();
      if (profiles) {
        if (demo) {
          const previous = data.profiles.find((p) => p.id === form.id);
          if (previous && previous.version !== form.version)
            throw new Error("El perfil cambió; vuelve a abrirlo.");
          if (previous?.system_key)
            throw new Error("El perfil del sistema está protegido.");
          let updated = data.profiles.slice();
          if (form.mode === "create") {
            if (
              updated.some(
                (p) =>
                  !p.deleted_at &&
                  normalizeName(p.name) === normalizeName(form.name),
              )
            )
              throw new Error("Ya existe un perfil con esa descripción.");
            updated.push({
              id: form.id,
              code: Math.max(0, ...updated.map((p) => p.code)) + 1,
              name: form.name.trim(),
              system_key: null,
              active: true,
              deleted_at: null,
              permissions: completePermissions(form.permissions),
              version: 1,
              created_at: now,
              updated_at: now,
              users_count: 0,
            });
          } else
            updated = updated.map((p) =>
              p.id !== form.id
                ? p
                : {
                    ...p,
                    version: p.version + 1,
                    updated_at: now,
                    ...(form.mode === "update"
                      ? {
                          name: form.name.trim(),
                          permissions: completePermissions(form.permissions),
                        }
                      : form.mode === "delete"
                        ? { active: false, deleted_at: now }
                        : form.mode === "restore"
                          ? { active: false, deleted_at: null }
                          : { active: form.mode === "activate" }),
                  },
            );
          onDemoChange({ ...data, profiles: updated });
        } else
          await rpc("manage_access_profile", {
            p_id: form.id,
            p_expected_version: form.version,
            p_name: form.name,
            p_permissions: form.permissions,
            p_action: form.mode,
            p_reason: form.reason,
          });
      } else if (form.mode === "create" || form.mode === "reset") {
        if (demo) {
          if (form.mode === "create") {
            onDemoChange({
              ...data,
              users: [
                ...data.users,
                {
                  id: form.id,
                  code: Math.max(0, ...data.users.map((u) => u.code)) + 1,
                  display_name: form.name.trim(),
                  username: form.username || null,
                  email: form.email,
                  role: form.access_mode === "custom" ? "lector" : form.role,
                  active: form.active,
                  can_export: form.can_export,
                  access_mode: form.access_mode,
                  access_profile_ids: form.profile_ids,
                  created_at: now,
                  last_sign_in_at: null,
                  version: 1,
                  deleted_at: null,
                },
              ],
            });
          }
        } else {
          const { data: result, error: invokeError } =
            await supabase!.functions.invoke("invite-user", {
              body: {
                action: form.mode === "reset" ? "reset" : "invite",
                user_id: form.id,
                expected_version: form.version,
                email: form.email,
                display_name: form.name,
                username: form.username,
                role: form.role,
                active: form.active,
                can_export: form.can_export,
                access_mode: form.access_mode,
                profile_ids: form.profile_ids,
                reason: form.reason,
                redirectTo: location.origin + location.pathname,
              },
            });
          if (invokeError || result?.error)
            throw new Error(
              result?.error ??
                "No se pudo completar el envío. Revisa Usuarios antes de volver a intentarlo.",
            );
        }
      } else {
        if (demo) {
          const old = data.users.find((u) => u.id === form.id);
          if (!old || old.version !== form.version)
            throw new Error("El usuario cambió; vuelve a abrirlo.");
          if (
            old.active &&
            old.role === "administrador" &&
            (form.mode === "delete" ||
              !form.active ||
              form.role !== "administrador" ||
              form.access_mode === "custom") &&
            data.users.filter(
              (u) => u.active && u.role === "administrador" && !u.deleted_at,
            ).length <= 1
          )
            throw new Error(
              "Debe permanecer al menos un administrador activo.",
            );
          onDemoChange({
            ...data,
            users: data.users.map((u) =>
              u.id !== form.id
                ? u
                : {
                    ...u,
                    version: u.version + 1,
                    ...(form.mode === "delete"
                      ? { active: false, deleted_at: now }
                      : form.mode === "restore"
                        ? { active: false, deleted_at: null }
                        : {
                            display_name: form.name.trim(),
                            username: form.username || null,
                            role:
                              form.access_mode === "custom"
                                ? "lector"
                                : form.role,
                            active: form.active,
                            can_export: form.can_export,
                            access_mode: form.access_mode,
                            access_profile_ids: form.profile_ids,
                          }),
                  },
            ),
          });
        } else
          await rpc("manage_user", {
            p_id: form.id,
            p_expected_version: form.version,
            p_name: form.name,
            p_username: form.username,
            p_role: form.role,
            p_active: form.active,
            p_can_export: form.can_export,
            p_access_mode: form.access_mode,
            p_profile_ids: form.profile_ids,
            p_action: form.mode,
            p_reason: form.reason,
          });
      }
      setMessage(
        demo
          ? "Cambio temporal aplicado. No se enviaron correos ni se guardaron datos reales."
          : form.mode === "create" && !profiles
            ? "Invitación enviada. La persona establecerá su contraseña de forma privada."
            : form.mode === "reset"
              ? "Correo de recuperación solicitado y registrado en auditoría."
              : "Cambio guardado y registrado en auditoría.",
      );
      setForm(null);
      if (!demo) {
        await load();
        await onChanged();
      }
    } catch (e) {
      if (!demo) await load();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const full = form && (form.mode === "create" || form.mode === "update");
  const statusBadge = (row: {
    active: boolean;
    deleted_at?: string | null;
  }) => (
    <span
      className={`erp-state ${row.deleted_at ? "deleted" : row.active ? "enabled" : "disabled"}`}
    >
      <i />
      {row.deleted_at ? "Papelera" : row.active ? "Activo" : "Inactivo"}
    </span>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEGURIDAD / MAESTROS</span>
          <h1>{profiles ? "Perfiles" : "Usuarios"}</h1>
          <p>
            {profiles
              ? "Define los accesos por módulo y acción."
              : "Administra las cuentas y sus perfiles de acceso."}
          </p>
        </div>
      </div>
      {message && (
        <p className="notice" role="status">
          <CheckCircle2 size={16} />
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!full && (
        <section className="panel erp-master">
          <div className="master-toolbar">
            <h2>{profiles ? "Perfiles de acceso" : "Usuarios del sistema"}</h2>
            <div>
              <label className="search">
                <Search size={15} />
                <input
                  aria-label={profiles ? "Buscar perfil" : "Buscar usuario"}
                  placeholder={profiles ? "Buscar perfil…" : "Buscar usuario…"}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <select
                aria-label="Estado del listado"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
                <option value="deleted">Papelera</option>
              </select>
              <button
                className="export-button"
                onClick={exportRows}
                disabled={loading || !rows.length}
              >
                <Download size={14} />
                Exportar
              </button>
              <button className="primary" onClick={() => open("create")}>
                <Plus size={15} />
                {profiles ? "Nuevo perfil" : "Nuevo usuario"}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="security-table">
              <thead>
                <tr>
                  <th>
                    <button className="sort-head" onClick={() => order("code")}>
                      Código <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th>
                    <button className="sort-head" onClick={() => order("name")}>
                      {profiles ? "Descripción" : "Nombre / usuario"}{" "}
                      <ArrowUpDown size={10} />
                    </button>
                  </th>
                  {!profiles && <th>Correo</th>}
                  <th>
                    <button
                      className="sort-head"
                      onClick={() => order("created_at")}
                    >
                      F. creación <ArrowUpDown size={10} />
                    </button>
                  </th>
                  {!profiles && <th>Última sesión</th>}
                  <th>{profiles ? "Tipo / accesos" : "Perfiles"}</th>
                  <th>
                    <button
                      className="sort-head"
                      onClick={() => order("active")}
                    >
                      Estado <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>{code(profiles ? "P" : "U", row.code)}</td>
                    <td>
                      <strong>
                        {"name" in row ? row.name : row.display_name}
                      </strong>
                      <small className="block muted">
                        {"system_key" in row
                          ? row.system_key
                            ? "Perfil protegido del sistema"
                            : `${row.users_count} usuarios vinculados`
                          : (row.username ?? "Sin alias")}
                      </small>
                    </td>
                    {"email" in row && <td>{row.email ?? "—"}</td>}
                    <td>{date(row.created_at)}</td>
                    {"last_sign_in_at" in row && (
                      <td>{date(row.last_sign_in_at)}</td>
                    )}
                    <td>
                      {"permissions" in row && "name" in row ? (
                        <>
                          <span className="web-tag">Web</span>
                          <small className="block muted">
                            {row.permissions.length} permisos
                          </small>
                        </>
                      ) : (
                        <span>
                          {(row as ManagedUser).access_mode === "base"
                            ? (row as ManagedUser).role
                            : (row as ManagedUser).access_profile_ids
                                .map(
                                  (id) =>
                                    data.profiles.find((p) => p.id === id)
                                      ?.name ?? "Perfil no disponible",
                                )
                                .join(", ") || "Sin perfiles"}
                        </span>
                      )}
                    </td>
                    <td>{statusBadge(row)}</td>
                    <td>
                      <div className="row-tools">
                        {row.deleted_at ? (
                          <button
                            className="icon"
                            aria-label={`Restaurar ${"name" in row ? row.name : row.display_name}`}
                            title="Restaurar"
                            onClick={() => open("restore", row)}
                          >
                            <RotateCcw size={16} />
                          </button>
                        ) : (
                          <>
                            {!("system_key" in row && row.system_key) && (
                              <>
                                <button
                                  className="icon edit"
                                  aria-label={`Editar ${"name" in row ? row.name : row.display_name}`}
                                  title="Editar"
                                  onClick={() => open("update", row)}
                                >
                                  <Pencil size={15} />
                                </button>
                                {profiles && (
                                  <button
                                    className="icon"
                                    aria-label={`${row.active ? "Desactivar" : "Activar"} ${(row as AccessProfile).name}`}
                                    title={
                                      row.active ? "Desactivar" : "Activar"
                                    }
                                    onClick={() =>
                                      open(
                                        row.active ? "deactivate" : "activate",
                                        row,
                                      )
                                    }
                                  >
                                    {row.active ? (
                                      <UserX size={16} />
                                    ) : (
                                      <UserCheck size={16} />
                                    )}
                                  </button>
                                )}
                                <button
                                  className="icon danger"
                                  aria-label={`Eliminar ${"name" in row ? row.name : row.display_name}`}
                                  title="Eliminar a Papelera"
                                  onClick={() => open("delete", row)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                            {profiles ? (
                              <button
                                className="icon"
                                aria-label={`Duplicar ${(row as AccessProfile).name}`}
                                title="Duplicar perfil"
                                onClick={() => open("create", row, true)}
                              >
                                <Copy size={15} />
                              </button>
                            ) : (
                              <button
                                className="icon reset"
                                aria-label={`Restablecer contraseña de ${(row as ManagedUser).display_name}`}
                                title="Restablecer contraseña"
                                onClick={() => open("reset", row)}
                              >
                                <KeyRound size={15} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading ? (
            <p className="empty-inline">Actualizando listado…</p>
          ) : (
            !rows.length && (
              <p className="empty-inline">
                No hay registros para los filtros seleccionados.
              </p>
            )
          )}
          <DataPager
            total={rows.length}
            page={currentPage}
            size={size}
            onPage={setPage}
            onSize={setSize}
          />
        </section>
      )}
      {full && form && (
        <form
          onSubmit={submit}
          onInvalidCapture={() => {
            if (!profiles) setTab("general");
          }}
        >
          <section className="panel security-form">
            <div className="master-toolbar">
              <h2>
                {labels[form.mode]} {profiles ? "perfil" : "usuario"}
              </h2>
              <button
                type="button"
                className="icon"
                aria-label="Cerrar formulario"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                <X size={18} />
              </button>
            </div>
            {profiles ? (
              <>
                <div className="profile-fields">
                  <label>
                    Descripción
                    <input
                      required
                      minLength={3}
                      maxLength={120}
                      value={form.name}
                      onChange={(e) => patch({ name: e.target.value })}
                      placeholder="Ej.: Encargado de conductores"
                    />
                  </label>
                  <label>
                    Tipo
                    <select value="web" disabled>
                      <option value="web">
                        Web · computadoras y celulares
                      </option>
                    </select>
                  </label>
                  <label>
                    Estado
                    <input
                      disabled
                      value={
                        form.mode === "create"
                          ? "Activo"
                          : data.profiles.find((p) => p.id === form.id)?.active
                            ? "Activo"
                            : "Inactivo"
                      }
                    />
                  </label>
                </div>
                <ProfilePermissions
                  selected={form.permissions}
                  onToggle={togglePermission}
                />
                <p className="small muted">
                  Los accesos necesarios para visualizar se agregan
                  automáticamente. Usuarios, Perfiles, respaldos y ajustes del
                  sistema permanecen reservados al administrador.
                </p>
              </>
            ) : (
              <>
                <div
                  className="form-tabs"
                  role="tablist"
                  aria-label="Configuración de usuario"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "general"}
                    onClick={() => setTab("general")}
                  >
                    Datos generales
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "web"}
                    onClick={() => setTab("web")}
                  >
                    Perfiles web
                  </button>
                </div>
                <div hidden={tab !== "general"} className="user-fields">
                  <div>
                    <label>
                      Código
                      <input
                        disabled
                        value={
                          form.mode === "create"
                            ? "Se genera al crear el usuario"
                            : code(
                                "U",
                                data.users.find((u) => u.id === form.id)
                                  ?.code ?? 0,
                              )
                        }
                      />
                    </label>
                    <label>
                      Usuario (alias opcional)
                      <input
                        pattern="[A-Za-z0-9_.\-]{3,60}"
                        maxLength={60}
                        value={form.username}
                        onChange={(e) => patch({ username: e.target.value })}
                        placeholder="Ej.: encargado.territorios"
                      />
                    </label>
                    <label>
                      Nombre completo
                      <input
                        required
                        maxLength={200}
                        value={form.name}
                        onChange={(e) => patch({ name: e.target.value })}
                      />
                    </label>
                    <label>
                      Correo
                      <input
                        type="email"
                        required
                        disabled={form.mode !== "create"}
                        maxLength={254}
                        value={form.email}
                        onChange={(e) => patch({ email: e.target.value })}
                      />
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(e) => patch({ active: e.target.checked })}
                      />
                      Usuario activo
                    </label>
                  </div>
                  <aside className="form-help">
                    <ShieldCheck size={24} />
                    <h3>Acceso personal y seguro</h3>
                    <p>
                      El inicio de sesión utiliza el correo. La persona define
                      su contraseña mediante un enlace privado; el administrador
                      no la ve.
                    </p>
                    <p>
                      La contraseña debe tener al menos {MIN_PASSWORD_LENGTH}{" "}
                      caracteres, una mayúscula, una minúscula, un número y un
                      carácter especial.
                    </p>
                    <p>
                      La web funciona en computadora y celular con los mismos
                      permisos.
                    </p>
                    <p>
                      {form.mode === "create"
                        ? "Guardar enviará una invitación al correo indicado."
                        : "El correo de la cuenta se mantiene protegido. Puedes solicitar un enlace de recuperación desde el listado."}
                    </p>
                  </aside>
                </div>
                <div hidden={tab !== "web"}>
                  <div className="profile-assignment">
                    <label>
                      Modelo de acceso
                      <select
                        value={
                          form.access_mode === "custom" ? "custom" : form.role
                        }
                        onChange={(e) =>
                          patch(
                            e.target.value === "custom"
                              ? {
                                  access_mode: "custom",
                                  role: "lector",
                                  can_export: false,
                                }
                              : {
                                  access_mode: "base",
                                  role: e.target.value as Role,
                                  profile_ids: [],
                                },
                          )
                        }
                      >
                        <option value="lector">
                          Lector · perfil del sistema
                        </option>
                        <option value="editor">
                          Editor · perfil del sistema
                        </option>
                        <option value="administrador">
                          Administrador · acceso protegido
                        </option>
                        <option value="custom">Perfiles personalizados</option>
                      </select>
                    </label>
                    {form.access_mode === "base" ? (
                      <>
                        <p className="muted">
                          {form.role === "administrador"
                            ? "Acceso completo a la administración. El sistema protege al último administrador activo."
                            : "Se aplican los permisos básicos del perfil elegido."}
                        </p>
                        {form.role !== "administrador" && (
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={form.can_export}
                              onChange={(e) =>
                                patch({ can_export: e.target.checked })
                              }
                            />
                            Permitir generar y descargar PDF S-13-S
                          </label>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="small muted">
                          Los permisos activos se suman. Un perfil inactivo o
                          eliminado deja de conceder acceso inmediatamente.
                        </p>
                        <div className="profile-choices">
                          {activeProfiles.map((p) => (
                            <label className="checkbox" key={p.id}>
                              <input
                                type="checkbox"
                                checked={form.profile_ids.includes(p.id)}
                                onChange={(e) =>
                                  patch({
                                    profile_ids: e.target.checked
                                      ? [...form.profile_ids, p.id]
                                      : form.profile_ids.filter(
                                          (id) => id !== p.id,
                                        ),
                                  })
                                }
                              />
                              {p.name}
                              <small>{p.permissions.length} permisos</small>
                            </label>
                          ))}
                          {!activeProfiles.length && (
                            <p className="notice">
                              Primero crea un perfil personalizado en Seguridad
                              → Maestros → Perfiles.
                            </p>
                          )}
                        </div>
                        {form.profile_ids
                          .filter(
                            (id) => !activeProfiles.some((p) => p.id === id),
                          )
                          .map((id) => (
                            <p className="error" key={id}>
                              El perfil{" "}
                              {data.profiles.find((p) => p.id === id)?.name ??
                                "seleccionado"}{" "}
                              está inactivo o en Papelera.{" "}
                              <button
                                type="button"
                                className="text-button"
                                onClick={() =>
                                  patch({
                                    profile_ids: form.profile_ids.filter(
                                      (v) => v !== id,
                                    ),
                                  })
                                }
                              >
                                Retirar vínculo
                              </button>
                            </p>
                          ))}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
            <label className="audit-reason">
              Motivo del cambio
              <textarea
                required
                minLength={8}
                maxLength={2000}
                value={form.reason}
                onChange={(e) => patch({ reason: e.target.value })}
                placeholder="Describe por qué se modifica el acceso"
              />
            </label>
          </section>
          <div className="erp-form-actions">
            <button
              type="button"
              className="cancel-button"
              disabled={busy}
              onClick={() => setForm(null)}
            >
              <X size={15} />
              Cancelar
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                (!profiles &&
                  form.access_mode === "custom" &&
                  !form.profile_ids.length)
              }
            >
              <Save size={15} />
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}
      {form && !full && (
        <Modal
          title={`${labels[form.mode]}${form.mode === "reset" ? "" : profiles ? " perfil" : " usuario"}`}
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <form onSubmit={submit}>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="conductor-target">
              <strong>{form.name}</strong>
              <span>{profiles ? "Perfil de acceso" : form.email}</span>
            </div>
            <p className="small muted">
              {form.mode === "delete"
                ? "Se enviará a Papelera y dejará de conceder acceso. El historial y la auditoría se conservan."
                : form.mode === "restore"
                  ? "Se restaurará en estado inactivo. Actívalo después de revisar sus permisos."
                  : form.mode === "reset"
                    ? "Se enviará un enlace de recuperación al correo de la cuenta. Su contraseña actual no se mostrará ni se cambiará desde esta pantalla."
                    : form.mode === "deactivate"
                      ? "Los usuarios vinculados dejarán de recibir los permisos de este perfil."
                      : "El perfil volverá a conceder sus permisos a los usuarios vinculados."}
            </p>
            {profiles && form.users_count > 0 && (
              <p className="notice">
                Este perfil está vinculado a {form.users_count} usuarios. Revisa
                el impacto antes de guardar.
              </p>
            )}
            <label>
              Motivo
              <textarea
                required
                minLength={8}
                maxLength={2000}
                value={form.reason}
                onChange={(e) => patch({ reason: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Guardando…"
                  : form.mode === "reset"
                    ? "Enviar enlace"
                    : labels[form.mode]}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
