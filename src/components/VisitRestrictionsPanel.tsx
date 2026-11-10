import { useCallback, useMemo, useState } from "react";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  House,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import Modal from "./Modal";
import DataPager from "./DataPager";
import { rpc } from "../lib/client";
import { can } from "../lib/permissions";
import { displayDate, normalizeName } from "../lib/dates";
import {
  eligibleVisitDate,
  sameVisitAddress,
  validateVisitRestriction,
  visitRestrictionState,
  visitStateLabels,
} from "../lib/visitRestrictions";
import type {
  Profile,
  Territory,
  VisitRestriction,
  VisitRestrictionAction,
  VisitRestrictionSummary,
} from "../lib/types";
import "./VisitRestrictionsPanel.css";

type TerritoryOption = Pick<Territory, "id" | "territory_number" | "active">;
const actionLabels: Record<VisitRestrictionAction, string> = {
  create: "Registrar domicilio",
  update: "Editar domicilio",
  renew: "Renovar solicitud",
  archive: "Archivar domicilio",
  activate: "Activar domicilio",
  delete: "Eliminar domicilio",
  restore: "Restaurar domicilio",
};
const permission = (action: VisitRestrictionAction) =>
  `visits.${action === "update" || action === "renew" ? "edit" : action === "archive" || action === "activate" ? "state" : action === "restore" ? "delete" : action}`;
const code = (n: number) => `D-${String(n).padStart(4, "0")}`;

export default function VisitRestrictionsPanel({
  rows,
  territories,
  profile,
  today,
  demo,
  onChanged,
  onDemoChange,
  onTerritory,
  initialTerritory = "",
  onlyEligible = false,
}: {
  rows: VisitRestriction[];
  territories: TerritoryOption[];
  profile: Profile;
  today: string;
  demo: boolean;
  onChanged: () => Promise<void>;
  onDemoChange: (rows: VisitRestriction[]) => void;
  onTerritory: (id: string) => void;
  initialTerritory?: string;
  onlyEligible?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [territoryFilter, setTerritoryFilter] = useState(initialTerritory);
  const [filter, setFilter] = useState(onlyEligible ? "eligible" : "all");
  const [page, setPage] = useState(1),
    [size, setSize] = useState(10);
  const [form, setForm] = useState<{
    id: string;
    action: VisitRestrictionAction;
    row?: VisitRestriction;
  } | null>(null);
  const [territoryId, setTerritoryId] = useState("");
  const [address, setAddress] = useState("");
  const [reportedOn, setReportedOn] = useState(today);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const close = useCallback(() => {
    if (!busy) setForm(null);
  }, [busy]);
  const getTerritoryNumber = (id: string) =>
    territories.find((t) => t.id === id)?.territory_number ?? "—";
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const state = visitRestrictionState(row, today);
        return (
          (filter === "all" ? state !== "deleted" : filter === state) &&
          (!territoryFilter || row.territory_id === territoryFilter) &&
          normalizeName(
            `${row.address_reference} ${code(row.code)} ${territories.find((t) => t.id === row.territory_id)?.territory_number ?? ""}`,
          ).includes(normalizeName(query))
        );
      }),
    [rows, filter, territoryFilter, query, today, territories],
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(visible.length / size)),
  );
  const counts = { blocking: 0, eligible: 0, archived: 0 };
  for (const row of rows) {
    const state = visitRestrictionState(row, today);
    if (state !== "deleted") counts[state]++;
  }
  const calculated = (() => {
    try {
      return eligibleVisitDate(reportedOn);
    } catch {
      return "";
    }
  })();
  const editing = form?.action === "create" || form?.action === "update";
  const renewing = form?.action === "renew";
  const duplicate = rows.some(
    (r) =>
      r.id !== form?.id &&
      !r.deleted_at &&
      r.territory_id === territoryId &&
      sameVisitAddress(r.address_reference, address),
  );
  function open(action: VisitRestrictionAction, row?: VisitRestriction) {
    if (!can(profile, permission(action))) return;
    setError("");
    setMessage("");
    setForm({ action, id: row?.id ?? crypto.randomUUID(), row });
    setTerritoryId(row?.territory_id ?? territoryFilter);
    setAddress(row?.address_reference ?? "");
    setReportedOn(action === "renew" ? today : (row?.reported_on ?? today));
    setReason(
      action === "create" ? "Registro de solicitud de no recibir visitas" : "",
    );
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || busy || !can(profile, permission(form.action))) return;
    setBusy(true);
    setError("");
    try {
      const submittedDate =
        editing || renewing
          ? String(
              new FormData(e.currentTarget as HTMLFormElement).get(
                "reported_on",
              ) ?? reportedOn,
            )
          : reportedOn;
      const values = validateVisitRestriction(address, submittedDate, today);
      if (
        !territories.some(
          (t) =>
            t.id === territoryId &&
            (t.active || t.id === form.row?.territory_id),
        )
      )
        throw new Error("Seleccione un territorio disponible.");
      if (reason.trim().length < 8 || reason.trim().length > 2000)
        throw new Error("Indique un motivo entre 8 y 2000 caracteres.");
      if (demo) {
        const existing = rows.find((r) => r.id === form.id);
        if (form.row && existing?.version !== form.row.version)
          throw new Error(
            "Otro usuario actualizó este domicilio. Revise el registro.",
          );
        if (
          editing &&
          rows.some(
            (r) =>
              r.id !== form.id &&
              !r.deleted_at &&
              r.territory_id === territoryId &&
              r.address_reference.toLocaleLowerCase("es").normalize("NFC") ===
                values.address_reference
                  .toLocaleLowerCase("es")
                  .normalize("NFC"),
          )
        )
          throw new Error(
            "Ya existe un domicilio con esa referencia en el territorio.",
          );
        if (renewing && values.reported_on <= form.row!.reported_on)
          throw new Error(
            "El nuevo aviso debe ser posterior a la fecha informada anterior.",
          );
        if (form.action === "archive" && today < form.row!.eligible_on)
          throw new Error(
            "No se puede archivar antes de cumplir un año desde la fecha informada.",
          );
        const stamp = new Date().toISOString();
        onDemoChange(
          form.action === "create"
            ? [
                ...rows,
                {
                  ...values,
                  id: form.id,
                  code: Math.max(0, ...rows.map((r) => r.code)) + 1,
                  territory_id: territoryId,
                  active: true,
                  deleted_at: null,
                  version: 1,
                  created_at: stamp,
                  updated_at: stamp,
                },
              ]
            : rows.map((row) =>
                row.id !== form.id
                  ? row
                  : {
                      ...row,
                      ...(editing
                        ? { ...values, territory_id: territoryId }
                        : renewing
                          ? {
                              reported_on: values.reported_on,
                              eligible_on: values.eligible_on,
                            }
                          : {}),
                      active: ["renew", "activate", "restore"].includes(
                        form.action,
                      )
                        ? true
                        : ["archive", "delete"].includes(form.action)
                          ? false
                          : row.active,
                      deleted_at:
                        form.action === "delete"
                          ? stamp
                          : form.action === "restore"
                            ? null
                            : row.deleted_at,
                      version: row.version + 1,
                      updated_at: stamp,
                    },
              ),
        );
      } else {
        await rpc("manage_visit_restriction", {
          p_id: form.id,
          p_expected_version: form.row?.version ?? 0,
          p_territory_id: territoryId,
          p_address: values.address_reference,
          p_reported_on: values.reported_on,
          p_action: form.action,
          p_reason: reason.trim(),
        });
        await onChanged();
      }
      setForm(null);
      setMessage(
        demo
          ? "Cambio guardado solo en esta sesión de ejemplo."
          : "Cambio guardado y registrado en auditoría.",
      );
    } catch (e) {
      setError((e as Error).message);
      if (!demo) await onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAESTROS</span>
          <h1>Domicilios que no desean visitas</h1>
          <p>
            Respeta cada solicitud y consulta cuándo se cumple el año sin
            visitas.
          </p>
        </div>
        {can(profile, "visits.create") && (
          <button className="primary" onClick={() => open("create")}>
            <Plus size={16} />
            Nuevo domicilio
          </button>
        )}
      </div>
      <div className="visit-stats">
        {(
          [
            ["blocking", House],
            ["eligible", CalendarClock],
            ["archived", Archive],
          ] as const
        ).map(([state, Icon]) => (
          <button
            key={state}
            className={`visit-stat ${filter === state ? "selected" : ""}`}
            onClick={() => {
              setFilter(state);
              setPage(1);
            }}
          >
            <Icon size={22} />
            <span>
              <strong>{counts[state]}</strong>
              {visitStateLabels[state]}
            </span>
          </button>
        ))}
      </div>
      {counts.eligible > 0 && (
        <div className="visit-alert eligible" role="status">
          <CalendarClock size={19} />
          <div>
            <strong>
              {counts.eligible}{" "}
              {counts.eligible === 1
                ? "domicilio cumplió"
                : "domicilios cumplieron"}{" "}
              el plazo de un año.
            </strong>
            <p>
              Puede visitarse desde la fecha indicada. Si se recibe otra
              solicitud, renueva el aviso; archiva los casos revisados para
              retirar el recordatorio.
            </p>
          </div>
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <section className="panel visit-master">
        <div className="panel-heading">
          <h2>
            <House size={18} />
            Registro de domicilios
          </h2>
          <span className="small muted">Fechas según Perú</span>
        </div>
        <div className="visit-filters">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Buscar domicilio"
              placeholder="Buscar domicilio, referencia o código…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Filtrar domicilios por territorio"
            value={territoryFilter}
            onChange={(e) => {
              setTerritoryFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los territorios</option>
            {territories.map((t) => (
              <option key={t.id} value={t.id}>
                Territorio {t.territory_number}
                {!t.active ? " · Inactivo" : ""}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar domicilios por estado"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos los domicilios</option>
            <option value="blocking">No visitar</option>
            <option value="eligible">Plazo cumplido</option>
            <option value="archived">Archivados</option>
            <option value="deleted">Papelera</option>
          </select>
        </div>
        {visible.length ? (
          <div className="table-wrap">
            <table className="visit-table">
              <thead>
                <tr>
                  <th>Domicilio / referencia</th>
                  <th>Territorio</th>
                  <th>Fecha informada</th>
                  <th>Puede visitarse desde</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible
                  .slice((currentPage - 1) * size, currentPage * size)
                  .map((row) => {
                    const state = visitRestrictionState(row, today);
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.address_reference}</strong>
                          <small className="block muted">
                            {code(row.code)}
                            {row.source_reference
                              ? ` · Origen: ${row.source_reference}`
                              : ""}
                          </small>
                        </td>
                        <td>
                          {can(profile, "territories.view") ? (
                            <button
                              className="text-button"
                              onClick={() => onTerritory(row.territory_id)}
                            >
                              Territorio {getTerritoryNumber(row.territory_id)}
                            </button>
                          ) : (
                            <>
                              Territorio {getTerritoryNumber(row.territory_id)}
                            </>
                          )}
                        </td>
                        <td>{displayDate(row.reported_on)}</td>
                        <td>
                          <strong>{displayDate(row.eligible_on)}</strong>
                        </td>
                        <td>
                          <span className={`visit-badge ${state}`}>
                            {visitStateLabels[state]}
                          </span>
                        </td>
                        <td>
                          <div className="visit-actions">
                            {(state === "deleted"
                              ? ["restore"]
                              : [
                                  "update",
                                  "renew",
                                  ...(state === "archived"
                                    ? ["activate"]
                                    : state === "eligible"
                                      ? ["archive"]
                                      : []),
                                  "delete",
                                ]
                            ).map((a) => {
                              const action = a as VisitRestrictionAction;
                              const Icon =
                                action === "delete"
                                  ? Trash2
                                  : action === "update"
                                    ? Pencil
                                    : action === "archive"
                                      ? Archive
                                      : RotateCcw;
                              return (
                                can(profile, permission(action)) && (
                                  <button
                                    key={a}
                                    className={`icon ${action === "delete" ? "danger-text" : ""}`}
                                    title={actionLabels[action]}
                                    aria-label={`${actionLabels[action]} ${code(row.code)}`}
                                    onClick={() => open(action, row)}
                                  >
                                    <Icon size={15} />
                                  </button>
                                )
                              );
                            })}
                            {!can(profile, "visits.edit") &&
                              !can(profile, "visits.state") &&
                              !can(profile, "visits.delete") && (
                                <span className="small muted">Consulta</span>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-inline">
            <House size={30} />
            <h3>
              {rows.length
                ? "No hay domicilios con estos filtros"
                : "Sin domicilios registrados"}
            </h3>
            <p>
              {rows.length
                ? "Prueba otro territorio o estado."
                : "Registra una solicitud para mostrar su aviso en el territorio correspondiente."}
            </p>
          </div>
        )}
        <DataPager
          total={visible.length}
          page={currentPage}
          size={size}
          onPage={setPage}
          onSize={setSize}
        />
      </section>
      <p className="small muted visit-footnote">
        Se conserva el historial de cambios. Cumplir el año muestra un aviso; no
        elimina el domicilio ni renueva la fecha automáticamente.
      </p>
      {form && (
        <Modal title={actionLabels[form.action]} onClose={close}>
          <form onSubmit={save}>
            {editing || renewing ? (
              <>
                <label>
                  Territorio
                  <select
                    required
                    disabled={busy || renewing}
                    value={territoryId}
                    onChange={(e) => setTerritoryId(e.target.value)}
                  >
                    <option value="">Seleccione un territorio</option>
                    {territories
                      .filter(
                        (t) => t.active || t.id === form.row?.territory_id,
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          Territorio {t.territory_number}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Domicilio / referencia
                  <textarea
                    required
                    rows={3}
                    minLength={3}
                    maxLength={500}
                    readOnly={renewing}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Dirección o descripción que permita identificar la casa"
                  />
                </label>
                <label>
                  {renewing ? "Fecha del nuevo aviso" : "Fecha informada"}
                  <input
                    type="date"
                    name="reported_on"
                    required
                    min="1900-01-01"
                    max={today}
                    value={reportedOn}
                    onInput={(e) => setReportedOn(e.currentTarget.value)}
                    onChange={(e) => setReportedOn(e.target.value)}
                  />
                </label>
                {calculated && (
                  <div className="visit-date-preview">
                    <CalendarClock size={19} />
                    <div>
                      Puede visitarse desde
                      <strong>{displayDate(calculated)}</strong>
                      <small>Un año desde la fecha informada.</small>
                    </div>
                  </div>
                )}
                {duplicate && (
                  <p className="warning">
                    Hay una referencia similar en este territorio. Revisa el
                    registro antes de crear otro.
                  </p>
                )}
              </>
            ) : (
              <div className="notice">
                <strong>{address}</strong>
                <p>
                  Territorio {getTerritoryNumber(territoryId)} · Puede visitarse
                  desde {displayDate(form.row?.eligible_on)}.
                </p>
                <p>
                  {form.action === "delete"
                    ? "Se enviará a Papelera. Utiliza esta acción para registros incorrectos o duplicados; conserva la auditoría y permite restaurar."
                    : form.action === "archive"
                      ? "El domicilio dejará de aparecer en los avisos. El plazo de un año ya debe haberse cumplido."
                      : form.action === "restore"
                        ? "El domicilio volverá al maestro y mostrará el aviso que corresponda a su fecha."
                        : "El domicilio volverá a mostrar el aviso que corresponda a su fecha."}
                </p>
              </div>
            )}
            <label>
              Motivo del registro o cambio
              <textarea
                required
                rows={2}
                minLength={8}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
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
                onClick={close}
                disabled={busy}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function TerritoryVisitNotice({
  rows,
  summary,
  territoryId,
  today,
  canView,
  compact = false,
  onManage,
}: {
  rows: VisitRestriction[];
  summary?: VisitRestrictionSummary;
  territoryId: string;
  today: string;
  canView: boolean;
  compact?: boolean;
  onManage?: () => void;
}) {
  const active = rows
    .filter((r) => r.territory_id === territoryId && r.active && !r.deleted_at)
    .sort((a, b) => a.eligible_on.localeCompare(b.eligible_on));
  const blocking = summary?.blocking_count ?? 0,
    eligible = summary?.eligible_count ?? 0;
  if (compact && !blocking && !eligible) return null;
  return (
    <section
      className={compact ? "visit-assignment-notice" : "panel visit-territory"}
      aria-label="Domicilios que no desean visitas"
    >
      <div className="panel-heading">
        <h2>
          <House size={18} />
          {compact
            ? "Aviso del territorio"
            : "Domicilios que no desean visitas"}
        </h2>
      </div>
      {blocking > 0 && (
        <p className="visit-count blocking">
          <strong>{blocking}</strong>{" "}
          {blocking === 1 ? "domicilio: no visitar" : "domicilios: no visitar"}{" "}
          hasta cumplir el año indicado.
        </p>
      )}
      {eligible > 0 && (
        <p className="visit-count eligible">
          <strong>{eligible}</strong>{" "}
          {eligible === 1
            ? "domicilio con plazo cumplido"
            : "domicilios con plazo cumplido"}
          . Puede visitarse desde la fecha indicada.
        </p>
      )}
      {!blocking && !eligible && (
        <p className="muted visit-empty">
          <CheckCircle2 size={17} />
          Sin restricciones activas registradas en este territorio.
        </p>
      )}
      {canView && active.length > 0 && (
        <ul className={`visit-house-list ${compact ? "compact" : ""}`}>
          {active.map((row) => (
            <li key={row.id}>
              <strong>{row.address_reference}</strong>
              <span
                className={`visit-badge ${visitRestrictionState(row, today)}`}
              >
                {visitStateLabels[visitRestrictionState(row, today)]}
              </span>
              <small>
                Fecha informada: {displayDate(row.reported_on)}
                <br />
                Puede visitarse desde: <b>{displayDate(row.eligible_on)}</b>
              </small>
            </li>
          ))}
        </ul>
      )}
      {!canView && (blocking > 0 || eligible > 0) && (
        <p className="small muted">
          Solicita acceso al maestro para consultar las referencias de los
          domicilios.
        </p>
      )}
      {onManage && (
        <button className="text-button" onClick={onManage}>
          Ver maestro de domicilios
        </button>
      )}
    </section>
  );
}
