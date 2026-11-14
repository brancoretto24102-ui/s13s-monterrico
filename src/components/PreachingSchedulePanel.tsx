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
  Eye,
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
  unplannedTerritories,
  unplannedOpenAssignments,
  outingsWithoutConductor,
  type PreachingContext,
  type PreachingRow,
  type PreachingWeek,
} from "../lib/preachingSchedule";
import type { Profile, Snapshot } from "../lib/types";
import ConductorSelect from "./ConductorSelect";
import { CoverageDate } from "./TerritoryCoverage";
import Modal from "./Modal";
import {
  preachingDocument,
  createPreachingMeasurer,
} from "../lib/preachingDocument";
import type { PreachingImage } from "../lib/preachingImage";
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
  const [measure] = useState(() => createPreachingMeasurer());
  const dates = preachingWeekDates(week.week_start);
  const doc = preachingDocument(
    {
      ...week,
      rows: week.rows.map((r) => ({
        ...r,
        conductor_names:
          r.conductor_names ??
          r.conductor_ids.map(
            (id) =>
              context.conductors.find((c) => c.id === id)?.display_name ??
              "Conductor pendiente",
          ),
        territory_numbers: r.territories.map(
          (t) =>
            context.territories.find((x) => x.id === t.territory_id)
              ?.territory_number ?? 0,
        ),
      })),
    },
    publishers ? "publishers" : "conductors",
    measure,
  );
  const rows = doc.rows;
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
        <table
          style={{
            width: doc.widths.reduce((a, b) => a + b, 0),
            minWidth: doc.widths.reduce((a, b) => a + b, 0),
          }}
        >
          <colgroup>
            {doc.widths.map((width, i) => (
              <col
                key={i}
                style={{
                  width: `${(width / doc.widths.reduce((a, b) => a + b, 0)) * 100}%`,
                }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {doc.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
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
                        {r.values[0]}
                      </td>
                      <td rowSpan={count} className="preaching-merged">
                        {r.values[1]}
                      </td>
                    </>
                  )}
                  {r.values.slice(2).map((value, col) => (
                    <td key={col}>{value}</td>
                  ))}
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

function PreachingImagePreview({
  images,
  publishers,
  onDownload,
  onClose,
  busy,
}: {
  images: PreachingImage[];
  publishers: boolean;
  onDownload: (image: PreachingImage, part?: number) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const urls = images.map((image) => URL.createObjectURL(image.blob));
    setUrls(urls);
    panel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);
  const audience = publishers ? "publicadores" : "conductores";
  return (
    <section
      ref={panel}
      className="panel preaching-image-previews"
      aria-label={`Previsualización de ${audience}`}
    >
      <div className="panel-heading">
        <div>
          <h2>
            Previsualización · {publishers ? "Publicadores" : "Conductores"}
          </h2>
          <p className="small muted">
            Revisa la imagen antes de decidir si deseas descargarla.
          </p>
        </div>
        <button className="text-button" disabled={busy} onClick={onClose}>
          <X size={15} />
          Cerrar previsualización
        </button>
      </div>
      {images.map((image, i) => (
        <figure key={i}>
          <figcaption>
            Imagen {i + 1} de {images.length} · {image.extension.toUpperCase()}{" "}
            · {Math.ceil(image.blob.size / 1024)} KB
          </figcaption>
          {urls[i] && (
            <a
              href={urls[i]}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ampliar imagen ${i + 1} de ${audience}`}
            >
              <img
                src={urls[i]}
                alt={`Cronograma de ${audience}, imagen ${i + 1} de ${images.length}`}
              />
            </a>
          )}
          <div className="button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                onDownload(image, images.length > 1 ? i + 1 : undefined)
              }
            >
              <Download size={15} />
              {images.length > 1
                ? `Descargar parte ${i + 1}`
                : `Descargar imagen de ${audience}`}
            </button>
            {urls[i] && (
              <a
                className="secondary preaching-image-zoom"
                href={urls[i]}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ampliar imagen
              </a>
            )}
          </div>
        </figure>
      ))}
    </section>
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
  const [weekInput, setWeekInput] = useState(() => mondayOf(today)),
    [pendingWeek, setPendingWeek] = useState<string | null>(null);
  const [exported, setExported] = useState<{
    publishers: boolean;
    images: PreachingImage[];
    weekId: string;
    version: number;
  } | null>(null);
  const [context, setContext] = useState<PreachingContext | null>(null),
    [rows, setRows] = useState<PreachingRow[]>([]),
    [saved, setSaved] = useState<PreachingWeek | null>(null);
  const [pendingGeneration, setPendingGeneration] = useState<{
    publishers: boolean;
    week: PreachingWeek;
    context: PreachingContext;
  } | null>(null);
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
  let weekInputError = "";
  try {
    preachingWeekDates(weekInput);
  } catch (e) {
    weekInputError = (e as Error).message;
  }
  try {
    dates = preachingWeekDates(weekStart);
  } catch (e) {
    dateError = (e as Error).message;
  }
  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
    setMessage("");
    setExported(null);
    setPendingGeneration(null);
  }
  function changeWeek(value: string) {
    if (value === weekStart || busy) return;
    if (dirty) {
      setPendingWeek(value);
      return;
    }
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
    setExported(null);
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
        unplannedTerritories(context.territories, activeRows).filter(
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
    ? unplannedOpenAssignments(context, activeRows, weekStart)
    : [];
  const missingConductors = outingsWithoutConductor(activeRows);
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
  async function prepareImages(
    publishers: boolean,
    approvedWeek?: PreachingWeek,
  ) {
    if (!saved || dirty || busy || conflict || !canExport) return;
    setBusy(true);
    setExported(null);
    setMessage("");
    try {
      let week = saved;
      if (!demo) {
        const fresh = await rpc<PreachingContext>("get_preaching_context", {
          p_week_start: weekStart,
        });
        if (
          !fresh.schedule ||
          fresh.schedule.id !== saved.id ||
          fresh.schedule.version !== saved.version
        )
          throw new Error(
            "El cronograma cambió. Actualiza la semana antes de previsualizar.",
          );
        week = fresh.schedule;
        setContext(fresh);
      }
      if (
        outingsWithoutConductor(week.rows).length &&
        (!approvedWeek ||
          approvedWeek.id !== week.id ||
          approvedWeek.version !== week.version)
      ) {
        setPendingGeneration({ publishers, week, context: context! });
        return;
      }
      setPendingGeneration(null);
      const { generatePreachingImages } = await import("../lib/preachingImage");
      const images = await generatePreachingImages(
        week,
        publishers ? "publishers" : "conductors",
      );
      setExported({
        publishers,
        images,
        weekId: week.id,
        version: week.version,
      });
      setMessage(
        `Previsualización de ${publishers ? "publicadores" : "conductores"} lista. Revisa ${images.length === 1 ? "la imagen" : "las imágenes"} y pulsa Descargar solo si deseas conservarla${images.length === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      setMessage((e as Error).message);
      if (!demo) await load();
    } finally {
      setBusy(false);
    }
  }
  async function downloadImage(
    image: PreachingImage,
    publishers: boolean,
    part?: number,
  ) {
    if (
      !saved ||
      !exported ||
      busy ||
      dirty ||
      conflict ||
      exported.weekId !== saved.id ||
      exported.version !== saved.version ||
      !canExport
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      if (!demo)
        await rpc("export_preaching_schedule", {
          p_id: exported.weekId,
          p_expected_version: exported.version,
        });
      downloadBlob(
        image.blob,
        `Cronograma_${publishers ? "Publicadores" : "Conductores"}_${weekStart}${part ? `_Parte_${part}` : ""}.${image.extension}`,
      );
      setMessage(
        `Imagen de ${publishers ? "publicadores" : "conductores"} descargada (${image.extension.toUpperCase()}, ${Math.ceil(image.blob.size / 1024)} KB).`,
      );
    } catch (e) {
      setMessage((e as Error).message);
      setExported(null);
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
            aria-invalid={!!weekInputError}
            aria-describedby="preaching-week-help"
            min="1900-01-01"
            max="9998-12-24"
            step={7}
            disabled={busy}
            value={weekInput}
            onInput={(e) => setWeekInput(e.currentTarget.value)}
            onChange={(e) => setWeekInput(e.target.value)}
          />
          <span
            id="preaching-week-help"
            className={weekInputError ? "error small" : "small muted"}
          >
            {weekInputError || "Elige un lunes y pulsa Abrir semana."}
          </span>
        </label>
        <button
          className="secondary"
          disabled={
            loading || busy || !!weekInputError || weekInput === weekStart
          }
          onClick={() => changeWeek(weekInput)}
        >
          <CalendarDays size={15} />
          Abrir semana
        </button>
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
      {pendingWeek && (
        <Modal title="Cambiar de semana" onClose={() => setPendingWeek(null)}>
          <p>
            Hay cambios sin guardar en la semana actual. ¿Descartarlos y abrir
            la semana del {displayDate(pendingWeek)}?
          </p>
          <div className="button-row">
            <button className="secondary" onClick={() => setPendingWeek(null)}>
              Seguir editando
            </button>
            <button
              className="primary"
              onClick={() => {
                dirtyRef.current = false;
                setDirty(false);
                setWeekStart(pendingWeek);
                setPendingWeek(null);
                setMessage("");
              }}
            >
              Descartar y abrir semana
            </button>
          </div>
        </Modal>
      )}
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
              {!suggestions.length && (
                <p className="small muted">
                  No hay territorios pendientes de sugerir para esta semana.
                </p>
              )}
              <section
                className="preaching-unplaced"
                aria-label="Territorios abiertos pendientes de programar"
              >
                <h3>
                  Territorios abiertos pendientes de programar{" "}
                  <span className="soft-tag">{unplaced.length}</span>
                </h3>
                <p className="small muted">
                  Selecciona una salida arriba y pulsa un territorio para
                  agregarlo. Desaparece de esta lista al programarlo y vuelve si
                  lo retiras.
                </p>
                <div className="preaching-suggestions">
                  {unplaced.map((a) => {
                    const t = context.territories.find(
                      (t) => t.id === a.territory_id,
                    );
                    const blocked =
                      territoryPlanStatus(
                        context.assignments,
                        a.territory_id,
                        target ? dates[target.day] : today,
                      ).kind === "blocked";
                    return (
                      <article className="preaching-open-territory" key={a.id}>
                        <button
                          disabled={!writable || busy || !target || blocked}
                          onClick={() =>
                            target && addTerritory(target.id, a.territory_id)
                          }
                        >
                          <b>Territorio {t?.territory_number}</b>
                          <small>
                            Abierto desde {displayDate(a.assigned_at)}
                          </small>
                          {blocked && (
                            <small>Cerrar primero: supera los 3 meses</small>
                          )}
                        </button>
                        {blocked && can(profile, "territories.view") && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              if (
                                !dirty ||
                                confirm(
                                  "Hay cambios sin guardar. ¿Abrir el historial del territorio?",
                                )
                              )
                                onTerritory(a.territory_id);
                            }}
                          >
                            Revisar historial
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
                {!unplaced.length && (
                  <p className="small muted">
                    No hay territorios abiertos pendientes de programar.
                  </p>
                )}
              </section>
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
                                    required={false}
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
            {!!missingConductors.length && (
              <div className="notice preaching-conductor-warning" role="status">
                <strong>
                  {missingConductors.length}{" "}
                  {missingConductors.length === 1
                    ? "salida sin conductor"
                    : "salidas sin conductor"}
                  .
                </strong>{" "}
                Puedes guardar el cronograma. Antes de generar se te pedirá
                revisar estas salidas; el aviso no aparecerá en el archivo
                exportado.
              </div>
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
                      onClick={() => void prepareImages(false)}
                    >
                      <Eye size={15} />
                      Previsualizar conductores
                    </button>
                    <button
                      className="secondary"
                      disabled={!saved || dirty || busy}
                      onClick={() => void prepareImages(true)}
                    >
                      <Eye size={15} />
                      Previsualizar publicadores
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
            {canExport && (
              <p className="small muted">
                Primero revisa la previsualización. Puedes descargar después el
                JPG o PNG más ligero.
              </p>
            )}
            {pendingGeneration && (
              <Modal
                title="Hay salidas sin conductor"
                onClose={() => setPendingGeneration(null)}
              >
                <p>
                  Revisa si es un error de planificación o si el cronograma debe
                  quedar así. Puedes generarlo de todos modos; el campo del
                  conductor quedará vacío y este aviso no se incluirá en el
                  archivo.
                </p>
                <ul className="preaching-missing-conductors">
                  {outingsWithoutConductor(pendingGeneration.week.rows).map(
                    (r) => (
                      <li key={r.id}>
                        <strong>
                          {preachingDays[r.day]} {scheduleTime(r.time)}
                        </strong>{" "}
                        · {r.meeting_point}
                        {r.territories.length > 0 && (
                          <>
                            {" "}
                            · Territorios:{" "}
                            {r.territories
                              .map(
                                (t) =>
                                  pendingGeneration.context.territories.find(
                                    (x) => x.id === t.territory_id,
                                  )?.territory_number,
                              )
                              .join(", ")}
                          </>
                        )}
                      </li>
                    ),
                  )}
                </ul>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setTab("edit");
                      setPendingGeneration(null);
                    }}
                  >
                    Volver a revisar
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void prepareImages(
                        pendingGeneration.publishers,
                        pendingGeneration.week,
                      )
                    }
                  >
                    Generar de todos modos
                  </button>
                </div>
              </Modal>
            )}
            {exported &&
              !dirty &&
              !conflict &&
              exported.weekId === saved?.id &&
              exported.version === saved.version && (
                <PreachingImagePreview
                  images={exported.images}
                  publishers={exported.publishers}
                  busy={busy}
                  onClose={() => setExported(null)}
                  onDownload={(image, part) =>
                    void downloadImage(image, exported.publishers, part)
                  }
                />
              )}
          </>
        )
      )}
    </>
  );
}
