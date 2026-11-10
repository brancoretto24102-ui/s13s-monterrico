import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  UsersRound,
  Plus,
  Search,
  Pencil,
  UserCheck,
  UserX,
  Trash2,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import Modal from "./Modal";
import "./ConductorsPanel.css";
import { rpc } from "../lib/client";
import { normalizeName } from "../lib/dates";
import {
  changeDemoConductor,
  conductorCode,
  conductorName,
  conductorStatus,
} from "../lib/conductors";
import type {
  Assignment,
  Conductor,
  ConductorAction,
  ConductorRecord,
} from "../lib/types";

type FormState = {
  action: ConductorAction;
  id: string;
  current?: ConductorRecord;
};
const labels: Record<ConductorAction, string> = {
  create: "Nuevo conductor",
  update: "Editar conductor",
  activate: "Activar conductor",
  deactivate: "Desactivar conductor",
  delete: "Eliminar conductor",
  restore: "Restaurar conductor",
};
const success: Record<ConductorAction, string> = {
  create: "Conductor creado.",
  update: "Nombre del conductor actualizado.",
  activate: "Conductor activado.",
  deactivate: "Conductor desactivado.",
  delete: "Conductor enviado a la papelera.",
  restore: "Conductor restaurado en estado inactivo.",
};

export default function ConductorsPanel({
  demo,
  demoRows,
  demoAssignments,
  revision,
  onDemoChange,
  onChanged,
}: {
  demo: boolean;
  demoRows: Conductor[];
  demoAssignments: Assignment[];
  revision: string;
  onDemoChange: (rows: Conductor[]) => void;
  onChanged: () => Promise<void>;
}) {
  const [stored, setStored] = useState<ConductorRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const request = useRef(0);
  const rows: ConductorRecord[] = demo
    ? demoRows.map((row) => ({
        ...row,
        created_at: "",
        updated_at: "",
        assignments_count: demoAssignments.filter(
          (a) => a.person_id === row.person_id && !a.voided_at,
        ).length,
        open_assignments: demoAssignments.filter(
          (a) =>
            a.person_id === row.person_id && !a.voided_at && !a.completed_at,
        ).length,
      }))
    : stored;
  const load = useCallback(async () => {
    if (demo) return;
    const id = ++request.current;
    setLoading(true);
    try {
      const data = await rpc<ConductorRecord[]>("get_conductors");
      if (request.current === id) setStored(data);
    } catch (e) {
      if (request.current === id) setError((e as Error).message);
    } finally {
      if (request.current === id) setLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load, revision]);
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const stateMatches =
          filter === "deleted"
            ? !!row.deleted_at
            : !row.deleted_at &&
              (filter === "all" ||
                (filter === "active" ? row.active : !row.active));
        return (
          stateMatches &&
          normalizeName(
            `${conductorCode(row.code)} ${row.display_name}`,
          ).includes(normalizeName(query))
        );
      }),
    [rows, filter, query],
  );
  const duplicate =
    name.trim() &&
    rows.some(
      (row) =>
        row.id !== form?.id &&
        normalizeName(row.display_name) === normalizeName(name),
    );
  const close = useCallback(() => {
    if (!busy) setForm(null);
  }, [busy]);
  function open(action: ConductorAction, current?: ConductorRecord) {
    setError("");
    setMessage("");
    setName(current?.display_name ?? "");
    setReason(action === "create" ? "Alta de conductor desde el maestro" : "");
    setForm({ action, id: current?.id ?? crypto.randomUUID(), current });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setError("");
    try {
      const displayName = ["create", "update"].includes(form.action)
        ? conductorName(name)
        : name;
      if (reason.trim().length < 8)
        throw new Error("Describe el motivo con al menos 8 caracteres.");
      if (demo)
        onDemoChange(
          changeDemoConductor(
            demoRows,
            form.action,
            form.id,
            form.current?.version ?? 0,
            displayName,
          ),
        );
      else {
        await rpc("manage_conductor", {
          p_id: form.id,
          p_expected_version: form.current?.version ?? 0,
          p_name: displayName,
          p_action: form.action,
          p_reason: reason.trim(),
        });
        await load();
        await onChanged();
      }
      setMessage(
        success[form.action] +
          (demo
            ? " Cambio temporal en la sesión de ejemplo."
            : " Cambio registrado en auditoría."),
      );
      setForm(null);
    } catch (e) {
      setError((e as Error).message);
      if (!demo) await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading conductor-heading">
        <div>
          <span className="eyebrow">MAESTROS</span>
          <h1>Conductores</h1>
          <p>Crea y administra los conductores de Monterrico.</p>
        </div>
        <button className="primary" onClick={() => open("create")}>
          <Plus size={18} /> Nuevo conductor
        </button>
      </div>
      <div className="conductor-stats" aria-label="Resumen del maestro">
        <article>
          <UserCheck size={20} />
          <div>
            <strong>
              {rows.filter((r) => r.active && !r.deleted_at).length}
            </strong>
            <span>Activos</span>
          </div>
        </article>
        <article>
          <UserX size={20} />
          <div>
            <strong>
              {rows.filter((r) => !r.active && !r.deleted_at).length}
            </strong>
            <span>Inactivos</span>
          </div>
        </article>
        <article>
          <Trash2 size={20} />
          <div>
            <strong>{rows.filter((r) => r.deleted_at).length}</strong>
            <span>En papelera</span>
          </div>
        </article>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && !form && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="panel conductor-panel">
        <div className="panel-heading">
          <div>
            <h2>
              <UsersRound size={20} /> Maestro de conductores
            </h2>
            <p>
              Los conductores activos están disponibles al asignar territorios.
            </p>
          </div>
          <button
            className="icon"
            aria-label="Actualizar conductores"
            disabled={loading || demo}
            onClick={() => void load()}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <div className="filters">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Buscar conductor"
              placeholder="Buscar por nombre o código…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar conductores"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todos los conductores</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="deleted">Papelera</option>
          </select>
        </div>
        {loading && (
          <p className="conductor-loading" role="status">
            Actualizando conductores…
          </p>
        )}
        {visible.length ? (
          <div className="table-wrap">
            <table className="conductor-table">
              <thead>
                <tr>
                  <th>Conductor</th>
                  <th>Estado</th>
                  <th>Historial vinculado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.display_name}</strong>
                      <small className="block muted">
                        {conductorCode(row.code)}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`status ${row.active && !row.deleted_at ? "available" : "inactive"}`}
                      >
                        <i />
                        {conductorStatus(row)}
                      </span>
                    </td>
                    <td>
                      {row.assignments_count}{" "}
                      {row.assignments_count === 1
                        ? "asignación"
                        : "asignaciones"}
                      {row.open_assignments > 0 && (
                        <small className="block muted">
                          {row.open_assignments}{" "}
                          {row.open_assignments === 1
                            ? "pendiente"
                            : "pendientes"}{" "}
                          de completar
                        </small>
                      )}
                    </td>
                    <td>
                      <div className="conductor-actions">
                        {row.deleted_at ? (
                          <button
                            className="secondary"
                            onClick={() => open("restore", row)}
                          >
                            <RotateCcw size={15} /> Restaurar
                          </button>
                        ) : (
                          <>
                            <button
                              className="secondary"
                              aria-label={`Editar a ${row.display_name}`}
                              onClick={() => open("update", row)}
                            >
                              <Pencil size={15} /> Editar
                            </button>
                            <button
                              className="secondary"
                              onClick={() =>
                                open(
                                  row.active ? "deactivate" : "activate",
                                  row,
                                )
                              }
                            >
                              {row.active ? (
                                <UserX size={15} />
                              ) : (
                                <UserCheck size={15} />
                              )}
                              {row.active ? "Desactivar" : "Activar"}
                            </button>
                            <button
                              className="secondary conductor-delete"
                              aria-label={`Eliminar a ${row.display_name}`}
                              onClick={() => open("delete", row)}
                            >
                              <Trash2 size={15} /> Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && (
            <div className="conductor-empty">
              <UsersRound size={32} />
              <h3>
                {filter === "deleted"
                  ? "La papelera está vacía"
                  : query || filter !== "all"
                    ? "No hay coincidencias"
                    : rows.length
                      ? "El listado está vacío"
                      : "Tu maestro comienza aquí"}
              </h3>
              <p>
                {filter === "deleted"
                  ? "Aquí podrás restaurar conductores eliminados."
                  : query || filter !== "all"
                    ? "Prueba otro nombre o estado."
                    : rows.length
                      ? "Puedes restaurar un conductor desde Papelera o registrar uno nuevo."
                      : "Registra el primer conductor para seleccionarlo al asignar territorios."}
              </p>
              {!query && filter === "all" && (
                <button className="primary" onClick={() => open("create")}>
                  <Plus size={17} />{" "}
                  {rows.length ? "Nuevo conductor" : "Crear primer conductor"}
                </button>
              )}
            </div>
          )
        )}
        <div className="table-footer">
          <span>
            {visible.length}{" "}
            {visible.length === 1 ? "conductor" : "conductores"}
            {filter === "deleted" ? " en papelera" : " en el listado"}
          </span>
          <span>Acceso de administrador</span>
        </div>
      </section>
      <p className="small muted">
        El historial conserva el nombre registrado en cada asignación, incluso
        después de editar, desactivar o eliminar un conductor.
      </p>
      {form && (
        <Modal title={labels[form.action]} onClose={close}>
          <form onSubmit={(e) => void save(e)}>
            {["create", "update"].includes(form.action) ? (
              <label>
                Nombre del conductor
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre completo"
                />
              </label>
            ) : (
              <p className="conductor-target">
                <strong>{form.current!.display_name}</strong>
                <span>{conductorCode(form.current!.code)}</span>
              </p>
            )}
            {duplicate && ["create", "update"].includes(form.action) && (
              <p className="notice">
                Ya hay otro conductor con un nombre similar. Cada persona
                conserva un código propio; revisa que sea un registro distinto.
              </p>
            )}
            {form.action === "delete" && (
              <p className="notice">
                Se retirará del maestro y de la selección de nuevas
                asignaciones. Su historial se conserva y podrás restaurarlo
                desde Papelera.
              </p>
            )}
            {form.action === "deactivate" && (
              <p className="notice">
                Dejará de aparecer en la selección de conductores para nuevas
                asignaciones. Sus asignaciones registradas se conservan.
              </p>
            )}
            {form.action === "restore" && (
              <p className="notice">
                Volverá al maestro en estado inactivo. Podrás activarlo después
                de revisar sus datos.
              </p>
            )}
            {!!form.current?.open_assignments && (
              <p className="small muted">
                Tiene {form.current.open_assignments} asignaciones pendientes
                que seguirán disponibles en el registro de territorios.
              </p>
            )}
            <label>
              Motivo
              <input
                required
                minLength={8}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe el motivo del cambio"
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={close}
              >
                Cancelar
              </button>
              <button
                className={`primary ${form.action === "delete" ? "conductor-delete-primary" : ""}`}
                disabled={busy}
              >
                {busy
                  ? "Guardando…"
                  : form.action === "create" || form.action === "update"
                    ? "Guardar conductor"
                    : labels[form.action]}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
