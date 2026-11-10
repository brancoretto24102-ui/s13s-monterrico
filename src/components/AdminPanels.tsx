import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Upload,
  Download,
  UserPlus,
  Plus,
  Settings,
} from "lucide-react";
import { rpc, supabase, downloadJson, downloadBlob } from "../lib/client";
import { todayLima } from "../lib/dates";
import { sha256 } from "../lib/importer";
import { TEMPLATE_SHA256 } from "../lib/pdf";
import type { Profile, Snapshot, Role } from "../lib/types";
export function AuditPanel({ demo }: { demo: boolean }) {
  const [rows, setRows] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    if (demo) return;
    let active = true;
    void supabase!
      .from("audit_log")
      .select("*")
      .order("id", { ascending: false })
      .range(offset, offset + 49)
      .then(({ data, error }) => {
        if (active) {
          setRows(data ?? []);
          setMessage(error?.message ?? "");
        }
      });
    return () => {
      active = false;
    };
  }, [offset, demo]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TRAZABILIDAD</span>
          <h1>Auditoría</h1>
          <p>Quién cambió cada dato, cuándo y por qué.</p>
        </div>
        <ShieldCheck size={30} />
      </div>
      <section className="panel">
        {message && <p className="error">{message}</p>}
        {demo ? (
          <div className="empty-inline">
            La auditoría real se registra en PostgreSQL. Esta sesión de ejemplo
            no crea registros de auditoría.
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha en Perú</th>
                    <th>Operación</th>
                    <th>Entidad / usuario</th>
                    <th>Motivo y cambios</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {new Date(r.occurred_at).toLocaleString("es-PE", {
                          timeZone: "America/Lima",
                        })}
                      </td>
                      <td>
                        <span className="soft-tag">{r.operation}</span>
                      </td>
                      <td>
                        {r.entity}
                        <small className="block muted">
                          {r.actor_id ?? "Inicialización del sistema"}
                        </small>
                      </td>
                      <td>
                        {r.reason}
                        <details>
                          <summary>Ver valores anteriores y nuevos</summary>
                          <pre>
                            {JSON.stringify(
                              { antes: r.old_data, despues: r.new_data },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && (
              <p className="muted">No hay movimientos en esta página.</p>
            )}
            <div className="button-row">
              <button
                className="secondary"
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Anterior
              </button>
              <span className="muted">
                Página {Math.floor(offset / 50) + 1}
              </span>
              <button
                className="secondary"
                disabled={rows.length < 50}
                onClick={() => setOffset(offset + 50)}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
export function UsersPanel({ demo }: { demo: boolean }) {
  const [rows, setRows] = useState<Profile[]>([]),
    [message, setMessage] = useState(""),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [role, setRole] = useState<Role>("lector"),
    [exportable, setExportable] = useState(false),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState("");
  async function load() {
    if (demo) return;
    const { data, error } = await supabase!
      .from("profiles")
      .select("*")
      .order("created_at");
    if (error) setMessage(error.message);
    else setRows(data ?? []);
  }
  useEffect(() => {
    void load();
  }, [demo]);
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (demo)
        throw new Error(
          "Las invitaciones requieren Supabase conectado y la función de invitación configurada.",
        );
      const { error } = await supabase!.functions.invoke("invite-user", {
        body: {
          email,
          display_name: name,
          role,
          can_export: exportable,
          redirectTo: location.origin + location.pathname,
        },
      });
      if (error) throw error;
      setMessage("Invitación enviada al correo indicado.");
      setEmail("");
      setName("");
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(p: Profile) {
    setBusy(true);
    try {
      await rpc("manage_profile", {
        p_id: p.id,
        p_expected_version: p.version,
        p_role: p.role,
        p_active: p.active,
        p_can_export: p.can_export,
        p_reason: reason,
      });
      await load();
      setMessage("Permisos actualizados y registrados en auditoría.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Usuarios y permisos</h1>
          <p>El acceso lo decide el administrador.</p>
        </div>
      </div>
      <section className="panel">
        <h2>
          <UserPlus size={20} />
          Invitar a una persona
        </h2>
        <form className="invite-form" onSubmit={invite}>
          <label>
            Nombre
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Correo
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Rol
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="lector">Lector</option>
              <option value="editor">Editor</option>
              <option value="administrador">Administrador</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={exportable}
              onChange={(e) => setExportable(e.target.checked)}
            />
            Puede exportar PDF
          </label>
          <button className="primary" disabled={busy || demo}>
            Enviar invitación
          </button>
        </form>
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Accesos autorizados</h2>
        {demo ? (
          <p className="muted">
            Aquí aparecerán los usuarios del proyecto Supabase conectado.
          </p>
        ) : (
          <>
            <label>
              Motivo para guardar cambios
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={8}
                placeholder="Por ejemplo: incorporación al equipo de territorios"
              />
            </label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Activo</th>
                    <th>Exportar</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id}>
                      <td>
                        {r.display_name}
                        <small className="block muted">{r.id}</small>
                      </td>
                      <td>
                        <select
                          aria-label={`Rol de ${r.display_name}`}
                          value={r.role}
                          onChange={(e) =>
                            setRows(
                              rows.map((x, j) =>
                                i === j
                                  ? { ...x, role: e.target.value as Role }
                                  : x,
                              ),
                            )
                          }
                        >
                          <option value="administrador">Administrador</option>
                          <option value="editor">Editor</option>
                          <option value="lector">Lector</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Activar a ${r.display_name}`}
                          checked={r.active}
                          onChange={(e) =>
                            setRows(
                              rows.map((x, j) =>
                                i === j
                                  ? { ...x, active: e.target.checked }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Permitir exportar a ${r.display_name}`}
                          checked={r.can_export}
                          onChange={(e) =>
                            setRows(
                              rows.map((x, j) =>
                                i === j
                                  ? { ...x, can_export: e.target.checked }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="secondary"
                          disabled={busy || reason.trim().length < 8}
                          onClick={() => void save(r)}
                        >
                          Guardar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
export function SettingsPanel({
  demo,
  snapshot,
  onRefresh,
}: {
  demo: boolean;
  snapshot: Snapshot;
  onRefresh: () => Promise<void>;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [number, setNumber] = useState(
      Math.max(...snapshot.territories.map((t) => t.territory_number)) + 1,
    ),
    [description, setDescription] = useState(""),
    [reason, setReason] = useState("");
  async function template(file: File) {
    setBusy(true);
    try {
      if (demo)
        throw new Error(
          "Carga la plantilla desde la pestaña Formulario para una prueba temporal.",
        );
      const bytes = await file.arrayBuffer();
      if ((await sha256(bytes)) !== TEMPLATE_SHA256)
        throw new Error(
          "El PDF no coincide con la plantilla original validada.",
        );
      const { error } = await supabase!.storage
        .from("s13s-private")
        .upload("template/S-13_S.pdf", file, {
          upsert: true,
          contentType: "application/pdf",
        });
      if (error) throw error;
      setMessage("Plantilla oficial guardada en almacenamiento privado.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function backup(format: "json" | "csv") {
    setBusy(true);
    try {
      if (demo)
        throw new Error(
          "Los respaldos operativos requieren una sesión administrativa conectada.",
        );
      const data = await rpc<any>("backup_data");
      if (format === "json")
        downloadJson(data, `S13S-respaldo-${todayLima()}.json`);
      else {
        const rows = data.assignments_including_voided as any[];
        const quote = (v: unknown) =>
          `"${String(v ?? "")
            .replace(/^[=+@\-\t\r]/, "'$&")
            .replace(/"/g, '""')}"`;
        const fields = [
          "id",
          "territory_id",
          "assigned_name_snapshot",
          "assigned_at",
          "completed_at",
          "version",
          "voided_at",
          "source_cell_reference",
        ];
        const csv = [
          fields.map(quote).join(","),
          ...rows.map((r) => fields.map((f) => quote(r[f])).join(",")),
        ].join("\r\n");
        downloadBlob(
          new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
          `S13S-historial-${todayLima()}.csv`,
        );
      }
      setMessage("Respaldo descargado. Consérvalo en un lugar privado.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (demo)
        throw new Error(
          "El crecimiento del catálogo requiere la base conectada.",
        );
      await rpc("manage_territory", {
        p_number: number,
        p_expected_version: 0,
        p_active: true,
        p_description: description,
        p_reason: reason,
      });
      await onRefresh();
      setMessage(`Territorio ${number} agregado.`);
      setNumber(number + 1);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Configuración</h1>
          <p>Plantilla, respaldo y crecimiento del catálogo.</p>
        </div>
        <Settings size={28} />
      </div>
      <div className="settings-grid">
        <section className="panel">
          <h2>
            <Upload size={20} />
            Plantilla oficial privada
          </h2>
          <p>
            Se acepta únicamente el PDF original verificado. Los lectores
            necesitan permiso de exportación para acceder a él.
          </p>
          <label>
            Seleccionar S-13_S(1).pdf
            <input
              type="file"
              accept="application/pdf"
              disabled={busy || demo}
              onChange={(e) => {
                if (e.target.files?.[0]) void template(e.target.files[0]);
              }}
            />
          </label>
          <small className="muted">
            La plantilla no forma parte del sitio público.
          </small>
        </section>
        <section className="panel">
          <h2>
            <Download size={20} />
            Copias de seguridad
          </h2>
          <p>
            El respaldo JSON incluye asignaciones, anulaciones, usuarios,
            auditoría y procedencia. Los accesos y la plantilla se respaldan por
            separado.
          </p>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy || demo}
              onClick={() => void backup("json")}
            >
              Respaldo completo JSON
            </button>
            <button
              className="secondary"
              disabled={busy || demo}
              onClick={() => void backup("csv")}
            >
              Historial CSV
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>
            <Plus size={20} />
            Agregar territorio
          </h2>
          <form onSubmit={add}>
            <label>
              Número nuevo
              <input
                type="number"
                min={
                  Math.max(
                    ...snapshot.territories.map((t) => t.territory_number),
                  ) + 1
                }
                value={number}
                onChange={(e) => setNumber(+e.target.value)}
                required
              />
            </label>
            <label>
              Descripción opcional
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
            </label>
            <label>
              Motivo
              <input
                minLength={8}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </label>
            <button className="primary" disabled={busy || demo}>
              Agregar territorio
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>
            <ShieldCheck size={20} />
            Estado del proyecto
          </h2>
          <dl className="summary-list">
            <div>
              <dt>Base de datos</dt>
              <dd>{demo ? "Sin conectar" : "Supabase"}</dd>
            </div>
            <div>
              <dt>Zona horaria</dt>
              <dd>America/Lima</dd>
            </div>
            <div>
              <dt>Historial</dt>
              <dd>Sin límite de registros por territorio</dd>
            </div>
            <div>
              <dt>Territorios</dt>
              <dd>{snapshot.territories.length}</dd>
            </div>
          </dl>
          <p className="small muted">
            Los límites del plan gratuito se revisan en la cuenta del proveedor.
          </p>
        </section>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </>
  );
}
