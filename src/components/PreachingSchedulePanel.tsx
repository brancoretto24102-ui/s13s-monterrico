import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Plus,
  Save,
  Download,
  RefreshCw,
  X,
  Search,
  ChevronDown,
  AlertTriangle,
  MapPinned,
} from "lucide-react";
import { can } from "../lib/permissions";
import { downloadBlob, rpc } from "../lib/client";
import { displayDate, normalizeName } from "../lib/dates";
import {
  latestCompletedDates,
  filterCoverageTerritories,
  emptyCoverageOptions,
} from "../lib/territoryCoverage";
import { validTimingReason } from "../lib/assignmentTiming";
import {
  mondayOf,
  newPreachingRow,
  preachingDays,
  preachingWeekDates,
  scheduleDefaults,
  scheduleErrors,
  scheduleTime,
  sortedPreachingRows,
  territoryPlanStatus,
  type PreachingContext,
  type PreachingRow,
  type PreachingWeek,
} from "../lib/preachingSchedule";
import type { Profile, Snapshot } from "../lib/types";
import ConductorSelect from "./ConductorSelect";
import { CoverageDate } from "./TerritoryCoverage";
import "./PreachingSchedulePanel.css";

function demoTemplate(
  context: Pick<PreachingContext, "conductors">,
): PreachingRow[] {
  const times = [
    ["08:00", "19:20"],
    ["08:00", "19:20"],
    ["08:00", "16:00", "19:20"],
    ["08:00", "18:00"],
    ["08:00"],
    ["09:00", "09:00"],
  ];
  return times.flatMap((outings, day) =>
    outings.map((time, i) => ({
      id: `00000000-0000-4000-8000-${String(day * 3 + i + 1).padStart(12, "0")}`,
      day,
      time,
      meeting_point: `Punto de reunión de ejemplo ${day + 1}${i ? " B" : ""}`,
      conductor_ids: context.conductors[day * 3 + i]
        ? [context.conductors[day * 3 + i].id]
        : [],
      territories:
        day === 0 && i === 0
          ? [{ territory_id: "demo-t4", reason: "" }]
          : day === 4
            ? [{ territory_id: "demo-t7", reason: "" }]
            : [],
    })),
  );
}

export function PreachingPreview({
  week,
  context,
  publishers = false,
}: {
  week: PreachingWeek;
  context: PreachingContext;
  publishers?: boolean;
}) {
  const dates = preachingWeekDates(week.week_start),
    rows = sortedPreachingRows(week.rows);
  const names = (r: PreachingRow) =>
    r.conductor_names ??
    r.conductor_ids.map(
      (id) =>
        context.conductors.find((c) => c.id === id)?.display_name ??
        "Conductor pendiente",
    );
  return (
    <div className="preaching-preview">
      <div className="preaching-document-title">
        <h2>Cronograma de predicación</h2>
        <p>
          {publishers ? "Publicadores" : "Conductores"} ·{" "}
          {displayDate(dates[0])} al {displayDate(dates[6])}
        </p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Día</th>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Punto de Reunión</th>
              {!publishers && <th>Territorio</th>}
              <th>Conductor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const first = i === 0 || rows[i - 1].day !== r.day;
              const count = rows.filter((x) => x.day === r.day).length;
              return (
                <tr key={r.id} className={`preaching-shade-${r.day}`}>
                  {first && (
                    <>
                      <td rowSpan={count} className="preaching-merged">
                        {preachingDays[r.day]}
                      </td>
                      <td rowSpan={count} className="preaching-merged">
                        {displayDate(dates[r.day])}
                      </td>
                    </>
                  )}
                  <td>{scheduleTime(r.time)}</td>
                  <td>{r.meeting_point}</td>
                  {!publishers && (
                    <td>
                      {r.territories
                        .map(
                          (t) =>
                            `T: ${context.territories.find((x) => x.id === t.territory_id)?.territory_number ?? "?"}`,
                        )
                        .join(" / ") || "—"}
                    </td>
                  )}
                  <td>{names(r).join(" / ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="empty-inline">Sin salidas programadas esta semana.</p>
      )}
    </div>
  );
}

function TerritoryPicker({
  row,
  context,
  date,
  today,
  onAdd,
}: {
  row: PreachingRow;
  context: PreachingContext;
  date: string;
  today: string;
  onAdd: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  const dates = latestCompletedDates(context.assignments, today);
  const choices = filterCoverageTerritories(
    context.territories.filter(
      (t) =>
        t.active &&
        !row.territories.some((x) => x.territory_id === t.id) &&
        normalizeName(`${t.territory_number} ${t.description ?? ""}`).includes(
          normalizeName(query),
        ),
    ),
    dates,
    { ...emptyCoverageOptions, priority: true },
    today,
  );
  return (
    <details
      ref={details}
      className="preaching-territory-picker"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <MapPinned size={14} />
        Agregar territorio
        <ChevronDown size={14} />
      </summary>
      {open && (
        <div className="preaching-picker-popover">
          <label className="search">
            <Search size={14} />
            <input
              aria-label={`Buscar territorio para ${preachingDays[row.day]} ${row.time}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar número de territorio…"
            />
          </label>
          <div className="preaching-picker-list">
            {choices.map((t) => {
              const status = territoryPlanStatus(
                context.assignments,
                t.id,
                date,
              );
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={status.kind === "blocked"}
                  onClick={() => {
                    onAdd(t.id);
                    setQuery("");
                    if (details.current) details.current.open = false;
                  }}
                >
                  <span>
                    <b>Territorio {t.territory_number}</b>
                    <small>
                      {status.kind === "blocked"
                        ? "Cerrar primero: supera los 3 meses"
                        : status.kind === "rest"
                          ? "Antes de 14 días · requiere motivo"
                          : status.kind === "continuation"
                            ? "Asignación abierta · continuación"
                            : "Disponible"}
                    </small>
                  </span>
                  <CoverageDate date={dates.get(t.id) ?? null} today={today} />
                </button>
              );
            })}
            {!choices.length && <p>No hay coincidencias.</p>}
          </div>
        </div>
      )}
    </details>
  );
}

export default function PreachingSchedulePanel({
  profile,
  snapshot,
  demo,
  today,
  demoWeeks,
  onDemoSave,
  onTerritory,
  onSaved,
}: {
  profile: Profile;
  snapshot: Snapshot;
  demo: boolean;
  today: string;
  demoWeeks: Record<string, PreachingWeek>;
  onDemoSave: (week: PreachingWeek, context: PreachingContext) => void;
  onTerritory: (id: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [context, setContext] = useState<PreachingContext | null>(null),
    [rows, setRows] = useState<PreachingRow[]>([]),
    [saved, setSaved] = useState<PreachingWeek | null>(null);
  const [days, setDays] = useState<number[]>([]),
    [focused, setFocused] = useState(""),
    [tab, setTab] = useState("edit"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false),
    [allSuggestions, setAllSuggestions] = useState(false);
  const dirtyRef = useRef(false),
    request = useRef(0);
  const canCreate = can(profile, "schedules.create"),
    canEdit = can(profile, "schedules.edit"),
    canExport = can(profile, "schedules.export");
  const writable = saved ? canEdit : canCreate;
  let dates: string[] = [];
  let dateError = "";
  try {
    dates = preachingWeekDates(weekStart);
  } catch (e) {
    dateError = (e as Error).message;
  }
  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
    setMessage("");
  }
  function changeWeek(value: string) {
    if (value === weekStart || busy) return;
    if (
      dirty &&
      !confirm("Hay cambios sin guardar. ¿Cambiar de semana y descartarlos?")
    )
      return;
    setWeekStart(value);
    setMessage("");
  }
  async function load(force = false) {
    if (dateError) {
      setLoading(false);
      return;
    }
    const run = ++request.current;
    try {
      const context: PreachingContext = demo
        ? {
            schedule: demoWeeks[weekStart] ?? null,
            previous:
              Object.values(demoWeeks)
                .filter((w) => w.week_start < weekStart)
                .sort((a, b) => b.week_start.localeCompare(a.week_start))[0] ??
              null,
            territories: snapshot.territories,
            conductors: snapshot.conductors ?? [],
            assignments: snapshot.assignments,
            template: [],
            revision: new Date().toISOString(),
          }
        : await rpc("get_preaching_context", { p_week_start: weekStart });
      if (demo) context.template = demoTemplate(context);
      if (run !== request.current) return;
      setContext(context);
      if (force || !dirtyRef.current) {
        let initial =
          context.schedule?.rows ?? scheduleDefaults(context, weekStart).rows;
        if (!context.schedule && !initial.length)
          initial = [newPreachingRow(0)];
        setRows(initial);
        setDays([...new Set(initial.map((r) => r.day))]);
        setFocused(initial[0]?.id ?? "");
        setSaved(context.schedule);
        dirtyRef.current = false;
        setDirty(false);
      }
      if (!canCreate && !canEdit) setTab("conductors");
    } catch (e) {
      if (run === request.current) setMessage((e as Error).message);
    } finally {
      if (run === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    setLoading(true);
    setContext(null);
    dirtyRef.current = false;
    setDirty(false);
    void load(true);
    return () => {
      request.current++;
    };
  }, [weekStart, demo]);
  useEffect(() => {
    if (demo) return;
    const timer = setInterval(() => void load(), 30000),
      focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [weekStart, demo]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  const activeRows = sortedPreachingRows(
    rows.filter((r) => days.includes(r.day)),
  );
  const errors =
    context && !dateError
      ? scheduleErrors(activeRows, context, weekStart)
      : dateError
        ? [dateError]
        : [];
  const conflict =
    !!context?.schedule && context.schedule.version !== (saved?.version ?? 0);
  const coverageDates = latestCompletedDates(context?.assignments ?? [], today);
  const suggestions = context
    ? filterCoverageTerritories(
        context.territories.filter(
          (t) =>
            t.active &&
            territoryPlanStatus(context.assignments, t.id, today).kind !==
              "continuation" &&
            territoryPlanStatus(context.assignments, t.id, today).kind !==
              "blocked",
        ),
        coverageDates,
        { ...emptyCoverageOptions, priority: true },
        today,
      )
    : [];
  const unplaced = context
    ? context.assignments.filter(
        (a) =>
          !a.completed_at &&
          !a.voided_at &&
          a.assigned_at <= dates[6] &&
          !activeRows.some((r) =>
            r.territories.some((t) => t.territory_id === a.territory_id),
          ),
      )
    : [];
  const target = activeRows.find((r) => r.id === focused) ?? activeRows[0];
  function updateRow(id: string, update: Partial<PreachingRow>) {
    if (busy) return;
    markDirty();
    setRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...update } : r)));
  }
  function addTerritory(rowId: string, territoryId: string) {
    const r = rows.find((r) => r.id === rowId);
    if (r && !r.territories.some((t) => t.territory_id === territoryId))
      updateRow(rowId, {
        territories: [
          ...r.territories,
          { territory_id: territoryId, reason: "" },
        ],
      });
  }
  function addRow(day: number) {
    if (busy) return;
    markDirty();
    const r = newPreachingRow(day);
    setRows((rows) => [...rows, r]);
    setFocused(r.id);
    setDays((days) => (days.includes(day) ? days : [...days, day]));
  }
  function toggleDay(day: number, checked: boolean) {
    if (busy) return;
    markDirty();
    setDays((days) =>
      checked ? [...days, day] : days.filter((d) => d !== day),
    );
    if (checked && !rows.some((r) => r.day === day)) {
      const r = newPreachingRow(day);
      setRows((rows) => [...rows, r]);
      setFocused(r.id);
    }
  }
  async function save() {
    if (!context || !writable || errors.length || conflict) return;
    setBusy(true);
    setMessage("");
    try {
      const result: PreachingWeek = demo
        ? {
            id: saved?.id ?? crypto.randomUUID(),
            week_start: weekStart,
            version: (saved?.version ?? 0) + 1,
            updated_at: new Date().toISOString(),
            rows: activeRows.map((r) => ({
              ...r,
              conductor_names: r.conductor_ids.map(
                (id) =>
                  context.conductors.find((c) => c.id === id)!.display_name,
              ),
              territory_numbers: r.territories.map(
                (t) =>
                  context.territories.find((x) => x.id === t.territory_id)!
                    .territory_number,
              ),
              territories: r.territories.map((t) => ({
                ...t,
                reason: t.reason.trim(),
                policy: territoryPlanStatus(
                  context.assignments,
                  t.territory_id,
                  dates[r.day],
                ),
              })),
            })),
          }
        : await rpc("save_preaching_schedule", {
            p_id: saved?.id ?? crypto.randomUUID(),
            p_expected_version: saved?.version ?? 0,
            p_week_start: weekStart,
            p_rows: activeRows,
          });
      if (demo) onDemoSave(result, context);
      setSaved(result);
      setContext({ ...context, schedule: result });
      setRows(result.rows);
      dirtyRef.current = false;
      setDirty(false);
      setMessage(
        demo
          ? "Cronograma guardado solo en esta sesión de ejemplo."
          : "Cronograma compartido guardado. La versión de publicadores está lista.",
      );
      if (!demo) await onSaved();
    } catch (e) {
      setMessage((e as Error).message);
      if (!demo) await load();
    } finally {
      setBusy(false);
    }
  }
  async function download(publishers: boolean) {
    if (!saved || dirty || !canExport) return;
    setBusy(true);
    setMessage("");
    try {
      const week = demo
        ? saved
        : await rpc<PreachingWeek>("export_preaching_schedule", {
            p_id: saved.id,
            p_expected_version: saved.version,
          });
      const { generatePreachingPdf } = await import("../lib/preachingPdf");
      const bytes = await generatePreachingPdf(
        week,
        publishers ? "publishers" : "conductors",
      );
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        `Cronograma_${publishers ? "Publicadores" : "Conductores"}_${weekStart}.pdf`,
      );
    } catch (e) {
      setMessage((e as Error).message);
      if (!demo) await load();
    } finally {
      setBusy(false);
    }
  }
  const preview: PreachingWeek = {
    id: saved?.id ?? "draft",
    week_start: weekStart,
    rows: activeRows.map((r) => ({
      ...r,
      conductor_names:
        !dirty && saved
          ? r.conductor_names
          : r.conductor_ids.map(
              (id, i) =>
                context?.conductors.find((c) => c.id === id)?.display_name ??
                r.conductor_names?.[i] ??
                "Conductor pendiente",
            ),
    })),
    version: saved?.version ?? 0,
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PREDICACIÓN / PROCESOS</span>
          <h1>Cronograma semanal</h1>
          <p>
            Prepara las salidas de conductores y genera el cronograma de la
            congregación.
          </p>
        </div>
        <span className="soft-tag">
          {dirty
            ? "Cambios sin guardar"
            : saved
              ? `Versión ${saved.version}`
              : "Nueva semana"}
        </span>
      </div>
      <section className="panel preaching-week-controls">
        <label>
          Lunes de la semana
          <input
            type="date"
            aria-label="Lunes de la semana"
            disabled={busy}
            value={weekStart}
            onInput={(e) => changeWeek(e.currentTarget.value)}
            onChange={(e) => changeWeek(e.target.value)}
          />
        </label>
        {dates.length > 0 && (
          <p>
            <CalendarDays size={16} />
            {displayDate(dates[0])} al {displayDate(dates[6])}
          </p>
        )}
        <div className="button-row">
          <button
            className="secondary"
            disabled={loading || busy}
            onClick={() => {
              if (
                !dirty ||
                confirm(
                  "¿Descartar los cambios locales y cargar la versión guardada?",
                )
              ) {
                dirtyRef.current = false;
                void load(true);
              }
            }}
          >
            <RefreshCw size={15} />
            Actualizar semana
          </button>
          {writable && (
            <button
              className="primary"
              disabled={loading || busy || !!errors.length || conflict}
              onClick={() => void save()}
            >
              <Save size={15} />
              {busy ? "Procesando…" : "Guardar cronograma"}
            </button>
          )}
        </div>
      </section>
      {message && (
        <p className="notice preaching-message" role="status">
          {message}
        </p>
      )}
      {dateError && (
        <p className="error" role="alert">
          {dateError}
        </p>
      )}
      {conflict && (
        <p className="error" role="alert">
          Otra persona guardó una versión distinta. Conserva tus cambios como
          referencia y usa Actualizar semana para cargar la versión compartida.
        </p>
      )}
      {loading ? (
        <div className="panel empty-inline">Cargando cronograma…</div>
      ) : (
        context &&
        !dateError && (
          <>
            <section className="panel preaching-priorities">
              <div className="panel-heading">
                <div>
                  <h2>Territorios para tener en cuenta</h2>
                  <p className="small muted">
                    Prioridad según la última predicación al{" "}
                    {displayDate(today)}. Son sugerencias; eliges cuáles
                    programar.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setAllSuggestions(!allSuggestions)}
                >
                  {allSuggestions ? "Ver menos" : "Ver todos"}
                </button>
              </div>
              {writable && target && (
                <label className="preaching-target">
                  Agregar sugerencias a
                  <select
                    aria-label="Salida para agregar sugerencias"
                    value={target.id}
                    onChange={(e) => setFocused(e.target.value)}
                  >
                    {activeRows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {preachingDays[r.day]} {scheduleTime(r.time)} ·{" "}
                        {r.meeting_point || "Punto pendiente"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="preaching-suggestions">
                {(allSuggestions ? suggestions : suggestions.slice(0, 8)).map(
                  (t) => (
                    <button
                      type="button"
                      key={t.id}
                      disabled={
                        !writable ||
                        busy ||
                        !target ||
                        territoryPlanStatus(
                          context.assignments,
                          t.id,
                          target ? dates[target.day] : today,
                        ).kind === "blocked"
                      }
                      onClick={() => target && addTerritory(target.id, t.id)}
                    >
                      <b>Territorio {t.territory_number}</b>
                      <CoverageDate
                        date={coverageDates.get(t.id) ?? null}
                        today={today}
                      />
                    </button>
                  ),
                )}
              </div>
              {!!unplaced.length && (
                <details className="preaching-unplaced">
                  <summary>
                    {unplaced.length} territorios abiertos sin ubicación en este
                    cronograma
                  </summary>
                  <p className="small muted">
                    Selecciona una salida arriba para ubicarlos. Los registros
                    antiguos pueden no tener horario asociado.
                  </p>
                  <div className="preaching-suggestions">
                    {unplaced.map((a) => {
                      const t = context.territories.find(
                        (t) => t.id === a.territory_id,
                      );
                      return (
                        <button
                          key={a.id}
                          disabled={
                            !writable ||
                            busy ||
                            !target ||
                            territoryPlanStatus(
                              context.assignments,
                              a.territory_id,
                              target ? dates[target.day] : today,
                            ).kind === "blocked"
                          }
                          onClick={() =>
                            target && addTerritory(target.id, a.territory_id)
                          }
                        >
                          <b>Territorio {t?.territory_number}</b>
                          <small>
                            Abierto desde {displayDate(a.assigned_at)}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </details>
              )}
            </section>
            <div
              className="preaching-tabs"
              role="tablist"
              aria-label="Vistas del cronograma"
            >
              {(writable
                ? ["edit", "conductors", "publishers"]
                : ["conductors", "publishers"]
              ).map((v) => (
                <button
                  role="tab"
                  key={v}
                  aria-selected={
                    tab === v ||
                    (!writable && tab === "edit" && v === "conductors")
                  }
                  onClick={() => setTab(v)}
                >
                  {v === "edit"
                    ? "Preparar cronograma"
                    : v === "conductors"
                      ? "Conductores"
                      : "Publicadores"}
                </button>
              ))}
            </div>
            {tab === "edit" && writable ? (
              <>
                <section className="panel preaching-days">
                  <h2>Días con predicación</h2>
                  <div>
                    {preachingDays.map((day, i) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={days.includes(i)}
                          onChange={(e) => toggleDay(i, e.target.checked)}
                        />
                        <span>
                          {day}
                          <small>{displayDate(dates[i])}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="small muted">
                    Desmarca los días sin predicación. Puedes agregar varias
                    salidas y puntos de reunión para un mismo día.
                  </p>
                </section>
                {context.previous && !saved && (
                  <p className="small muted">
                    Base editable: semana del{" "}
                    {displayDate(context.previous.week_start)}. Solo se
                    conservan por defecto los territorios que continúan
                    abiertos.
                  </p>
                )}
                {preachingDays.map(
                  (day, d) =>
                    days.includes(d) && (
                      <section className="panel preaching-day" key={day}>
                        <div className="panel-heading">
                          <h2>
                            {day}
                            <span>{displayDate(dates[d])}</span>
                          </h2>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => addRow(d)}
                          >
                            <Plus size={14} />
                            Agregar salida
                          </button>
                        </div>
                        {activeRows
                          .filter((r) => r.day === d)
                          .map((r) => (
                            <fieldset
                              disabled={busy}
                              key={r.id}
                              data-schedule-row={r.id}
                              className={`preaching-outing ${target?.id === r.id ? "is-selected" : ""}`}
                              onFocus={() => setFocused(r.id)}
                            >
                              <legend>
                                Salida de {day} · {scheduleTime(r.time)}
                              </legend>
                              <div className="preaching-outing-fields">
                                <label>
                                  Hora
                                  <input
                                    type="time"
                                    aria-label={`Hora de salida ${r.id}`}
                                    value={r.time}
                                    onInput={(e) =>
                                      updateRow(r.id, {
                                        time: e.currentTarget.value,
                                      })
                                    }
                                    onChange={(e) =>
                                      updateRow(r.id, { time: e.target.value })
                                    }
                                  />
                                </label>
                                <label>
                                  Punto de Reunión
                                  <input
                                    maxLength={300}
                                    value={r.meeting_point}
                                    onChange={(e) =>
                                      updateRow(r.id, {
                                        meeting_point: e.target.value,
                                      })
                                    }
                                    placeholder="Lugar de encuentro"
                                  />
                                </label>
                                <button
                                  className="text-button preaching-remove"
                                  aria-label={`Quitar salida de ${day} ${r.time}`}
                                  onClick={() => {
                                    markDirty();
                                    setRows((rows) =>
                                      rows.filter((x) => x.id !== r.id),
                                    );
                                  }}
                                >
                                  <X size={14} />
                                  Quitar salida
                                </button>
                              </div>
                              <div className="preaching-outing-details">
                                <div>
                                  <div className="preaching-selected-conductors">
                                    {r.conductor_ids.map((id, i) => (
                                      <span key={id}>
                                        {context.conductors.find(
                                          (c) => c.id === id,
                                        )?.display_name ??
                                          r.conductor_names?.[i] ??
                                          "Conductor inactivo"}
                                        <button
                                          aria-label={`Retirar conductor ${i + 1} de ${day} ${r.time}`}
                                          onClick={() =>
                                            updateRow(r.id, {
                                              conductor_ids:
                                                r.conductor_ids.filter(
                                                  (x) => x !== id,
                                                ),
                                            })
                                          }
                                        >
                                          <X size={12} />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                  <ConductorSelect
                                    key={r.conductor_ids.join(",")}
                                    conductors={context.conductors.filter(
                                      (c) => !r.conductor_ids.includes(c.id),
                                    )}
                                    value=""
                                    disabled={
                                      busy || r.conductor_ids.length >= 8
                                    }
                                    onChange={(personId) => {
                                      const c = context.conductors.find(
                                        (c) => c.person_id === personId,
                                      );
                                      if (c)
                                        updateRow(r.id, {
                                          conductor_ids: [
                                            ...r.conductor_ids,
                                            c.id,
                                          ],
                                        });
                                    }}
                                  />
                                </div>
                                <div>
                                  <b className="preaching-territories-label">
                                    Territorios
                                  </b>
                                  <div className="preaching-selected-territories">
                                    {r.territories.map((t) => {
                                      const n = context.territories.find(
                                          (x) => x.id === t.territory_id,
                                        )?.territory_number,
                                        status = territoryPlanStatus(
                                          context.assignments,
                                          t.territory_id,
                                          dates[d],
                                        );
                                      return (
                                        <article
                                          key={t.territory_id}
                                          className={`plan-${status.kind}`}
                                        >
                                          <header>
                                            <strong>Territorio {n}</strong>
                                            <button
                                              aria-label={`Retirar territorio ${n} de ${day} ${r.time}`}
                                              onClick={() =>
                                                updateRow(r.id, {
                                                  territories:
                                                    r.territories.filter(
                                                      (x) =>
                                                        x.territory_id !==
                                                        t.territory_id,
                                                    ),
                                                })
                                              }
                                            >
                                              <X size={13} />
                                            </button>
                                          </header>
                                          <p>{status.message}</p>
                                          {can(profile, "territories.view") &&
                                            status.kind === "blocked" && (
                                              <button
                                                className="text-button"
                                                onClick={() => {
                                                  if (
                                                    !dirty ||
                                                    confirm(
                                                      "Hay cambios sin guardar en el cronograma. ¿Abrir el historial del territorio?",
                                                    )
                                                  )
                                                    onTerritory(t.territory_id);
                                                }}
                                              >
                                                Revisar y cerrar territorio
                                              </button>
                                            )}
                                          {status.kind === "rest" && (
                                            <label>
                                              Motivo para programar territorio{" "}
                                              {n}
                                              <textarea
                                                rows={2}
                                                required
                                                minLength={8}
                                                maxLength={2000}
                                                value={t.reason}
                                                aria-invalid={
                                                  !validTimingReason(t.reason)
                                                }
                                                onChange={(e) =>
                                                  updateRow(r.id, {
                                                    territories:
                                                      r.territories.map((x) =>
                                                        x.territory_id ===
                                                        t.territory_id
                                                          ? {
                                                              ...x,
                                                              reason:
                                                                e.target.value,
                                                            }
                                                          : x,
                                                      ),
                                                  })
                                                }
                                                placeholder="Explica por qué se programa antes de completar los 14 días"
                                              />
                                            </label>
                                          )}
                                        </article>
                                      );
                                    })}
                                  </div>
                                  <TerritoryPicker
                                    row={r}
                                    context={context}
                                    date={dates[d]}
                                    today={today}
                                    onAdd={(id) => addTerritory(r.id, id)}
                                  />
                                  <small className="muted">
                                    Puede quedar sin territorio, por ejemplo
                                    para una reunión por videollamada.
                                  </small>
                                </div>
                              </div>
                            </fieldset>
                          ))}
                      </section>
                    ),
                )}
                {!!errors.length && (
                  <div className="preaching-validation" role="alert">
                    <h3>
                      <AlertTriangle size={16} />
                      Revisa antes de guardar
                    </h3>
                    <ul>
                      {errors.slice(0, 8).map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                    {errors.length > 8 && (
                      <p>
                        Hay {errors.length - 8} avisos adicionales en las
                        salidas.
                      </p>
                    )}
                  </div>
                )}
                <p className="small muted">
                  El registro S-13-S se actualiza al confirmar los inicios y
                  cierres reales de los territorios.
                </p>
              </>
            ) : (
              <section className="panel">
                <PreachingPreview
                  week={preview}
                  context={context}
                  publishers={tab === "publishers"}
                />
              </section>
            )}
            <div className="preaching-bottom-actions">
              <span className="small muted">
                {activeRows.length} salidas · {days.length} días
                {dirty ? " · Guarda para descargar ambas versiones" : ""}
              </span>
              <div className="button-row">
                {canExport && (
                  <>
                    <button
                      className="secondary"
                      disabled={!saved || dirty || busy}
                      onClick={() => void download(false)}
                    >
                      <Download size={15} />
                      PDF conductores
                    </button>
                    <button
                      className="secondary"
                      disabled={!saved || dirty || busy}
                      onClick={() => void download(true)}
                    >
                      <Download size={15} />
                      PDF publicadores
                    </button>
                  </>
                )}
                {writable && (
                  <button
                    className="primary"
                    disabled={busy || !!errors.length || conflict}
                    onClick={() => void save()}
                  >
                    <Save size={15} />
                    Guardar cronograma
                  </button>
                )}
              </div>
            </div>
          </>
        )
      )}
    </>
  );
}
