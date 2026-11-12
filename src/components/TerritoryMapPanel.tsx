import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map,
  Layers,
  RefreshCw,
  Download,
  Upload,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  ShieldCheck,
  ExternalLink,
  Crosshair,
  X,
  Undo2,
  Save,
  Search,
} from "lucide-react";
import { can } from "../lib/permissions";
import { downloadBlob, rpc, supabase } from "../lib/client";
import { displayDate } from "../lib/dates";
import {
  coveragePriority,
  coverageRangeError,
  emptyCoverageOptions,
  type CoverageOptions,
} from "../lib/territoryCoverage";
import {
  demoMapContext,
  geometryFromParts,
  googleMapsUrl,
  mapColors,
  mapStatusLegend,
  mapTerritoryAppearance,
  compareMapTerritories,
  type MapColorMode,
  mapChangeReasonError,
  mapFeatureCollection,
  mapKml,
  mapTerritoryStatus,
  normalizePartLabels,
  prepareMapImport,
  type MapImportRow,
  type MapPoint,
  type MapShape,
  type MapTerritory,
  type TerritoryMapContext,
} from "../lib/territoryMap";
import type { Profile, Snapshot } from "../lib/types";
import TerritoryMapCanvas from "./TerritoryMapCanvas";
import TerritoryCoverage from "./TerritoryCoverage";
import TerritoryMapPdfExport from "./TerritoryMapPdfExport";
import Modal from "./Modal";
import DataPager from "./DataPager";
import { TerritoryVisitNotice } from "./VisitRestrictionsPanel";
import "./TerritoryMapPanel.css";

interface EditForm {
  id: string;
  version: number;
  territory_id: string;
  parts: MapPoint[][];
  partLabels: (string | null)[];
  currentPart: number;
  source: string;
  reason: string;
}
interface ImportForm {
  rows: MapImportRow[];
  filename: string;
  source: string;
  reason: string;
}
type PendingAction = {
  kind: "approve" | "delete" | "restore";
  shape: MapShape;
  number: number;
};
const colors = ["red", "orange", "yellow", "green"] as const;
const colorLabel = {
  red: "Rojo",
  orange: "Anaranjado",
  yellow: "Amarillo",
  green: "Verde",
};
const reviewLabel = (shape?: MapShape) =>
  !shape
    ? "Sin polígono"
    : shape.deleted_at
      ? "En Papelera"
      : shape.review_status === "verified"
        ? "Límites revisados"
        : "Borrador · por revisar";

export default function TerritoryMapPanel({
  profile,
  snapshot,
  today,
  demo,
  demoShapes,
  onDemoShapes,
  onOpenTerritory,
  onOpenVisits,
}: {
  profile: Profile;
  snapshot: Snapshot;
  today: string;
  demo: boolean;
  demoShapes: MapShape[] | undefined;
  onDemoShapes: (shapes: MapShape[]) => void;
  onOpenTerritory: (id: string) => void;
  onOpenVisits: (id: string) => void;
}) {
  const [context, setContext] = useState<TerritoryMapContext | null>(null),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editError, setEditError] = useState(""),
    [tab, setTab] = useState<"map" | "master">("map"),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [state, setState] = useState("all"),
    [colorMode, setColorMode] = useState<MapColorMode>("assignment"),
    [review, setReview] = useState("all"),
    [coverage, setCoverage] = useState<CoverageOptions>(emptyCoverageOptions),
    [streets, setStreets] = useState(true),
    [blockLabels, setBlockLabels] = useState(true),
    [fitKey, setFitKey] = useState(0),
    [focusKey, setFocusKey] = useState(0),
    [form, setForm] = useState<EditForm | null>(null),
    [importForm, setImportForm] = useState<ImportForm | null>(null),
    [pending, setPending] = useState<PendingAction | null>(null),
    [reason, setReason] = useState(""),
    [confirmedReview, setConfirmedReview] = useState(false),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10);
  const request = useRef(0),
    formRef = useRef(form),
    fileInput = useRef<HTMLInputElement>(null),
    reasonInput = useRef<HTMLTextAreaElement>(null);
  formRef.current = form;
  const canCreate = can(profile, "maps.create"),
    canEdit = can(profile, "maps.edit"),
    canApprove = can(profile, "maps.approve"),
    canDelete = can(profile, "maps.delete"),
    canImport = can(profile, "maps.import"),
    canExport = can(profile, "maps.export");
  const load = useCallback(async () => {
    const run = ++request.current;
    try {
      const data = demo
        ? demoMapContext(snapshot, today, demoShapes)
        : await rpc<TerritoryMapContext>("get_territory_map");
      if (run !== request.current) return;
      setContext(data);
    } catch (error) {
      if (run === request.current) {
        const text = (error as Error).message;
        setMessage(text);
        if (/permiso|JWT|sesión/i.test(text)) {
          setContext(null);
          setForm(null);
        }
      }
    } finally {
      if (run === request.current) setLoading(false);
    }
  }, [demo, snapshot, today, demoShapes]);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  useEffect(() => {
    if (demo || !supabase) return;
    const timer = setInterval(() => void load(), 30000),
      focus = () => void load();
    window.addEventListener("focus", focus);
    const channel = supabase
      .channel(`territory-map-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "territory_geometries" },
        () => void load(),
      )
      .subscribe();
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      void supabase!.removeChannel(channel);
    };
  }, [demo, profile.id, load]);
  useEffect(() => {
    if (form && !(form.version ? canEdit : canCreate)) {
      setForm(null);
      setMessage("Tus permisos cambiaron. Se cerró el editor de límites.");
    }
  }, [canEdit, canCreate]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (formRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  const shapes = context?.shapes ?? [],
    territories = context?.territories ?? [];
  const shapeFor = (id: string) => shapes.find((s) => s.territory_id === id);
  const rangeError = coverageRangeError(coverage.from, coverage.to);
  const filtered = useMemo(
    () =>
      territories
        .filter((t) => {
          const s = shapes.find((g) => g.territory_id === t.id),
            status = mapTerritoryStatus(t, today),
            priority = coveragePriority(t.last_completed, today);
          if (
            query &&
            !`Territorio ${t.territory_number} ${t.description ?? ""}`
              .toLocaleLowerCase("es")
              .includes(query.toLocaleLowerCase("es"))
          )
            return false;
          if (state !== "all" && status.key !== state) return false;
          if (state === "all" && !t.active) return false;
          if (review === "deleted" ? !s?.deleted_at : s?.deleted_at)
            return false;
          if (review === "missing" && s) return false;
          if (review === "draft" && (!s || s.review_status !== "draft"))
            return false;
          if (review === "verified" && (!s || s.review_status !== "verified"))
            return false;
          if (
            rangeError ||
            (coverage.from &&
              (!t.last_completed || t.last_completed < coverage.from)) ||
            (coverage.to &&
              (!t.last_completed || t.last_completed > coverage.to))
          )
            return false;
          return (
            coverage.color === "all" ||
            (coverage.color === "unrecorded"
              ? !t.last_completed
              : priority.color === coverage.color)
          );
        })
        .sort((a, b) =>
          compareMapTerritories(a, b, today, colorMode, coverage.priority),
        ),
    [
      territories,
      shapes,
      query,
      state,
      review,
      coverage,
      today,
      rangeError,
      colorMode,
    ],
  );
  const selectedTerritory = territories.find((t) => t.id === selected),
    selectedShape = shapeFor(selected),
    selectedStatus = selectedTerritory
      ? mapTerritoryStatus(selectedTerritory, today)
      : null;
  const visibleShapes = useMemo(
    () =>
      shapes.filter(
        (s) => !s.deleted_at && filtered.some((t) => t.id === s.territory_id),
      ),
    [shapes, filtered],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        colors.map((color) => [
          color,
          territories.filter(
            (t) =>
              t.active &&
              coveragePriority(t.last_completed, today).color === color,
          ).length,
        ]),
      ),
    [territories, today],
  );
  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        mapStatusLegend.map((item) => [
          item.key,
          territories.filter(
            (t) => t.active && mapTerritoryStatus(t, today).key === item.key,
          ).length,
        ]),
      ),
    [territories, today],
  );
  let formError = "";
  if (form) {
    try {
      geometryFromParts(form.parts);
    } catch (error) {
      formError = (error as Error).message;
    }
  }
  const changeParts = (callback: (part: MapPoint[]) => MapPoint[]) =>
    setForm((f) =>
      f && !busy
        ? {
            ...f,
            parts: f.parts.map((p, i) =>
              i === f.currentPart ? callback(p) : p,
            ),
          }
        : f,
    );
  function choose(id: string) {
    if (form && form.territory_id !== id) {
      setMessage(
        "Guarda o cancela la edición antes de seleccionar otro territorio.",
      );
      return;
    }
    setSelected(id);
    setFocusKey((v) => v + 1);
  }
  function edit(t: MapTerritory) {
    if (form) {
      setMessage("Guarda o cancela la edición que tienes abierta.");
      return;
    }
    const s = shapeFor(t.id);
    setEditError("");
    setSelected(t.id);
    setTab("map");
    setFocusKey((v) => v + 1);
    setMessage("");
    setForm({
      id: s?.id ?? crypto.randomUUID(),
      version: s?.version ?? 0,
      territory_id: t.id,
      parts: s
        ? s.geometry.coordinates.map((p) =>
            p[0].slice(0, -1).map(([x, y]) => [x, y] as MapPoint),
          )
        : [[]],
      currentPart: 0,
      partLabels: normalizePartLabels(
        s?.part_labels,
        s?.geometry.coordinates.length ?? 1,
      ),
      source: s?.source ?? "Dibujo manual sobre mapa de calles",
      reason: "",
    });
  }
  function saveDemo(updated: MapShape[]) {
    onDemoShapes(updated);
    setContext(demoMapContext(snapshot, today, updated));
  }
  async function save() {
    if (!form || !context || busy) return;
    setEditError("");
    const reasonError = mapChangeReasonError(form.reason);
    if (reasonError) {
      setEditError(reasonError);
      reasonInput.current?.focus();
      return;
    }
    if (form.source.trim().length < 3 || form.source.trim().length > 1500) {
      setEditError(
        "Indica la procedencia de los límites (3 a 1500 caracteres).",
      );
      return;
    }
    if (formError) {
      setEditError(formError);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const geometry = geometryFromParts(form.parts),
        part_labels = normalizePartLabels(form.partLabels, form.parts.length),
        source = form.source.trim();
      if (source.length < 3 || source.length > 1500)
        throw new Error("Indica la procedencia de los límites.");
      if (demo) {
        const old = shapes.find((s) => s.id === form.id),
          now = new Date().toISOString();
        if (old && old.version !== form.version)
          throw new Error("El polígono cambió. Cancela y vuelve a abrirlo.");
        const row: MapShape = {
          id: form.id,
          territory_id: form.territory_id,
          geometry,
          part_labels,
          source,
          source_hash: old?.source_hash ?? null,
          review_status: "draft",
          reviewed_at: null,
          reviewed_by: null,
          version: (old?.version ?? 0) + 1,
          deleted_at: null,
          created_at: old?.created_at ?? now,
          updated_at: now,
        };
        saveDemo([...shapes.filter((s) => s.id !== row.id), row]);
      } else
        await rpc("manage_territory_geometry", {
          p_id: form.id,
          p_expected_version: form.version,
          p_territory_id: form.territory_id,
          p_geometry: geometry,
          p_source: source,
          p_action: form.version ? "update" : "create",
          p_reason: form.reason,
          p_source_hash: null,
          p_part_labels: part_labels,
        });
      setForm(null);
      setMessage(
        "Límites guardados como borrador. Una persona autorizada debe revisarlos antes de validarlos.",
      );
      if (!demo) await load();
    } catch (error) {
      setEditError((error as Error).message);
      setMessage((error as Error).message);
      if (!demo) await load();
    } finally {
      setBusy(false);
    }
  }
  async function performAction() {
    if (!pending || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (reason.trim().length < 8 || reason.length > 2000)
        throw new Error("Describe el motivo entre 8 y 2000 caracteres.");
      if (pending.kind === "approve" && !confirmedReview)
        throw new Error("Confirma que revisaste los límites.");
      if (demo) {
        const s = pending.shape,
          now = new Date().toISOString();
        saveDemo(
          shapes.map((g) =>
            g.id === s.id
              ? {
                  ...g,
                  version: g.version + 1,
                  updated_at: now,
                  deleted_at: pending.kind === "delete" ? now : null,
                  review_status:
                    pending.kind === "approve" ? "verified" : "draft",
                  reviewed_at: pending.kind === "approve" ? now : null,
                  reviewed_by: pending.kind === "approve" ? profile.id : null,
                }
              : g,
          ),
        );
      } else
        await rpc("manage_territory_geometry", {
          p_id: pending.shape.id,
          p_expected_version: pending.shape.version,
          p_territory_id: pending.shape.territory_id,
          p_geometry: null,
          p_source: null,
          p_action: pending.kind,
          p_reason: reason,
          p_source_hash: null,
        });
      setPending(null);
      setMessage("Cambio guardado.");
      if (!demo) await load();
    } catch (error) {
      setMessage((error as Error).message);
      if (!demo) await load();
    } finally {
      setBusy(false);
    }
  }
  function action(
    kind: PendingAction["kind"],
    shape: MapShape,
    number: number,
  ) {
    setPending({ kind, shape, number });
    setReason("");
    setConfirmedReview(false);
  }
  async function readImport(file: File) {
    if (!context) return;
    setMessage("");
    try {
      if (file.size > 2_000_000) throw new Error("El archivo supera 2 MB.");
      const rows = prepareMapImport(await file.text(), context);
      setImportForm({
        rows,
        filename: file.name,
        source: `Importación GeoJSON: ${file.name}`.slice(0, 1500),
        reason: "",
      });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function commitImport() {
    if (!importForm || !context || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (importForm.reason.trim().length < 8)
        throw new Error("Describe el motivo de la importación.");
      if (
        importForm.rows.some((r) =>
          r.expected_version > 0 ? !canEdit : !canCreate,
        )
      )
        throw new Error(
          "Faltan permisos para crear o editar alguno de los polígonos.",
        );
      if (demo) {
        const updated = shapes.slice(),
          now = new Date().toISOString();
        for (const row of importForm.rows) {
          const t = territories.find(
            (t) => t.territory_number === row.territory_number,
          )!;
          const old = updated.find((s) => s.id === row.id);
          if ((old?.version ?? 0) !== row.expected_version)
            throw new Error("El mapa cambió. Prepara otra importación.");
          const saved: MapShape = {
            id: row.id,
            territory_id: t.id,
            geometry: row.geometry,
            part_labels: row.part_labels,
            source: importForm.source,
            source_hash: old?.source_hash ?? null,
            version: row.expected_version + 1,
            review_status: "draft",
            reviewed_at: null,
            reviewed_by: null,
            deleted_at: null,
            created_at: old?.created_at ?? now,
            updated_at: now,
          };
          if (old) updated.splice(updated.indexOf(old), 1, saved);
          else updated.push(saved);
        }
        saveDemo(updated);
      } else
        await rpc("import_territory_geometries", {
          p_features: importForm.rows,
          p_source: importForm.source,
          p_source_hash: null,
          p_reason: importForm.reason,
        });
      const n = importForm.rows.length;
      setImportForm(null);
      setMessage(
        `${n} polígonos importados como borrador. No se modificaron asignaciones.`,
      );
      if (!demo) await load();
    } catch (error) {
      setMessage((error as Error).message);
      if (!demo) await load();
    } finally {
      setBusy(false);
    }
  }
  async function exportMap(format: "geojson" | "kml") {
    if (!context || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const data = demo
        ? context
        : await rpc<TerritoryMapContext>("export_territory_geometries", {
            p_versions: Object.fromEntries(
              shapes.filter((s) => !s.deleted_at).map((s) => [s.id, s.version]),
            ),
          });
      const content =
        format === "kml"
          ? mapKml(data.shapes, data.territories)
          : JSON.stringify(
              mapFeatureCollection(data.shapes, data.territories),
              null,
              2,
            );
      downloadBlob(
        new Blob([content], {
          type:
            format === "kml"
              ? "application/vnd.google-earth.kml+xml"
              : "application/geo+json",
        }),
        `territorios-${today}.${format}`,
      );
      setMessage(
        "Archivo descargado. Incluye límites y su revisión, sin nombres de personas ni domicilios restringidos.",
      );
    } catch (error) {
      setMessage((error as Error).message);
      if (!demo) await load();
    } finally {
      setBusy(false);
    }
  }
  const actions = (t: MapTerritory, shape?: MapShape) => (
    <div className="map-record-actions">
      <button
        className="text-button"
        onClick={() => {
          setTab("map");
          choose(t.id);
        }}
        aria-label={`Ver territorio ${t.territory_number} en el mapa`}
      >
        <Map size={14} />
        Ver mapa
      </button>
      {!shape && canCreate && t.active && (
        <button
          className="text-button"
          onClick={() => edit(t)}
          disabled={busy || !!form}
        >
          <Plus size={14} />
          Dibujar
        </button>
      )}
      {shape && !shape.deleted_at && (
        <>
          {canEdit && (
            <button
              className="text-button"
              onClick={() => edit(t)}
              disabled={busy || !!form}
              aria-label={`Editar límites del territorio ${t.territory_number}`}
            >
              <Pencil size={14} />
              Editar
            </button>
          )}
          {canApprove && shape.review_status === "draft" && (
            <button
              className="text-button"
              onClick={() => action("approve", shape, t.territory_number)}
              disabled={busy || !!form}
              aria-label={`Validar límites del territorio ${t.territory_number}`}
            >
              <ShieldCheck size={14} />
              Validar
            </button>
          )}
          {canDelete && (
            <button
              className="text-button danger-text"
              onClick={() => action("delete", shape, t.territory_number)}
              disabled={busy || !!form}
              aria-label={`Eliminar polígono del territorio ${t.territory_number}`}
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          )}
        </>
      )}
      {shape?.deleted_at && canDelete && (
        <button
          className="text-button"
          onClick={() => action("restore", shape, t.territory_number)}
          disabled={busy}
        >
          <RotateCcw size={14} />
          Restaurar
        </button>
      )}
    </div>
  );
  if (loading && !context)
    return (
      <section className="panel">
        <p>Cargando territorios geográficos…</p>
      </section>
    );
  return (
    <>
      <div className="page-heading map-page-heading">
        <div>
          <span className="eyebrow">CONFIGURACIÓN / MAESTROS</span>
          <h1>Territorios geográficos</h1>
          <p>Cobertura, estado y prioridades en el mapa.</p>
        </div>
        <div className="button-row">
          <button
            className="secondary"
            onClick={() => void load()}
            disabled={busy}
          >
            <RefreshCw size={15} />
            Actualizar mapa
          </button>
          {canImport && (
            <button
              className="secondary"
              onClick={() => fileInput.current?.click()}
              disabled={busy || !!form || (!canCreate && !canEdit)}
            >
              <Upload size={15} />
              Importar GeoJSON
            </button>
          )}
          {context && (
            <TerritoryMapPdfExport
              profile={profile}
              context={context}
              filteredIds={filtered.map((t) => t.id)}
              colorMode={colorMode}
              today={today}
              demo={demo}
              disabled={busy || !!form || !shapes.some((s) => !s.deleted_at)}
            />
          )}
          {canExport && (
            <>
              <button
                className="secondary"
                onClick={() => void exportMap("geojson")}
                disabled={busy || !!form || !shapes.some((s) => !s.deleted_at)}
              >
                <Download size={15} />
                GeoJSON
              </button>
              <button
                className="secondary"
                onClick={() => void exportMap("kml")}
                disabled={busy || !!form || !shapes.some((s) => !s.deleted_at)}
              >
                <Download size={15} />
                KML para Google My Maps
              </button>
            </>
          )}
        </div>
      </div>
      <input
        hidden
        ref={fileInput}
        type="file"
        accept=".geojson,.json,application/geo+json,application/json"
        aria-label="Archivo GeoJSON de territorios"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readImport(file);
        }}
      />
      {message && (
        <div className="notice map-notice" role="status">
          {message}
          <button
            className="icon"
            aria-label="Cerrar aviso del mapa"
            onClick={() => setMessage("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {!context ? (
        <section className="panel">
          <p>No se pudo cargar el mapa. Comprueba la sesión y tus permisos.</p>
        </section>
      ) : (
        <>
          <div
            className="map-color-mode"
            role="group"
            aria-label="Colorear mapa por"
          >
            <span>Colorear por</span>
            {(
              [
                ["assignment", "Estado de asignación"],
                ["coverage", "Antigüedad de predicación"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={colorMode === mode}
                disabled={!!form}
                onClick={() => {
                  setColorMode(mode);
                  setState("all");
                  setCoverage((v) => ({ ...v, color: "all" }));
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {colorMode === "assignment" ? (
            <div
              className="map-priority-cards map-status-cards"
              aria-label="Leyenda de estados de asignación"
            >
              {mapStatusLegend
                .filter((item) => item.key !== "inactive")
                .map((item) => (
                  <button
                    key={item.key}
                    className={`map-priority-card ${state === item.key ? "selected" : ""}`}
                    style={
                      { "--priority-color": item.color } as React.CSSProperties
                    }
                    aria-pressed={state === item.key}
                    disabled={!!form}
                    onClick={() => {
                      setState((v) => (v === item.key ? "all" : item.key));
                      setPage(1);
                    }}
                  >
                    <span>{item.label}</span>
                    <strong>{statusCounts[item.key]}</strong>
                    <small>{item.description}</small>
                  </button>
                ))}
            </div>
          ) : (
            <div
              className="map-priority-cards"
              aria-label="Prioridades de predicación"
            >
              {colors.map((color) => (
                <button
                  key={color}
                  className={`map-priority-card ${coverage.color === color ? "selected" : ""}`}
                  style={
                    {
                      "--priority-color": mapColors[color],
                    } as React.CSSProperties
                  }
                  disabled={!!form}
                  aria-pressed={coverage.color === color}
                  onClick={() =>
                    setCoverage((v) => ({
                      ...v,
                      color: v.color === color ? "all" : color,
                    }))
                  }
                >
                  <span>{colorLabel[color]}</span>
                  <strong>{counts[color]}</strong>
                  <small>
                    {color === "red"
                      ? "12 meses o sin registro"
                      : color === "orange"
                        ? "8 a menos de 12 meses"
                        : color === "yellow"
                          ? "4 a menos de 8 meses"
                          : "Menos de 4 meses"}
                  </small>
                </button>
              ))}
            </div>
          )}
          <section className="panel map-filter-panel">
            <div className="map-search-row">
              <label className="search">
                <Search size={15} />
                <input
                  value={query}
                  disabled={!!form}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar territorio…"
                  aria-label="Buscar territorio en el mapa"
                />
              </label>
              <select
                value={state}
                disabled={!!form}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(1);
                }}
                aria-label="Estado del territorio en el mapa"
              >
                <option value="all">Todos los activos</option>
                <option value="available">Disponibles</option>
                <option value="rest">En descanso · 14 días</option>
                <option value="assigned">Abiertos · dentro de plazo</option>
                <option value="closing-soon">Por vencer · hasta 14 días</option>
                <option value="limit">Límite alcanzado o superado</option>
                <option value="inactive">Inactivos</option>
              </select>
              <select
                value={review}
                disabled={!!form}
                onChange={(e) => {
                  setReview(e.target.value);
                  setPage(1);
                }}
                aria-label="Revisión de los polígonos"
              >
                <option value="all">Todos los límites</option>
                <option value="draft">Borradores por revisar</option>
                <option value="verified">Límites revisados</option>
                <option value="missing">Sin polígono</option>
                {canDelete && <option value="deleted">En Papelera</option>}
              </select>
            </div>
            <fieldset disabled={!!form} className="map-coverage-fieldset">
              <TerritoryCoverage
                options={coverage}
                priorityKind={colorMode}
                onChange={(v) => {
                  setCoverage(v);
                  setPage(1);
                }}
                today={today}
              />
            </fieldset>
          </section>
          <div
            className="map-tabs"
            role="tablist"
            aria-label="Vistas de territorios geográficos"
          >
            <button
              role="tab"
              aria-selected={tab === "map"}
              onClick={() => setTab("map")}
            >
              <Map size={16} />
              Mapa visual
            </button>
            <button
              role="tab"
              aria-selected={tab === "master"}
              onClick={() => setTab("master")}
              disabled={!!form}
            >
              <Layers size={16} />
              Maestro de polígonos
            </button>
          </div>
          {tab === "map" ? (
            <>
              {shapes.some(
                (s) => s.review_status === "draft" && !s.deleted_at,
              ) && (
                <p className="map-draft-banner">
                  <ShieldCheck size={17} />
                  <span>
                    Los límites con borde discontinuo están pendientes de
                    revisión. Compruébalos antes de validarlos.
                  </span>
                </p>
              )}
              {form && (
                <section className="panel map-editor-heading">
                  <div>
                    <h2>
                      {form.version ? "Editar límites" : "Dibujar límites"} ·
                      Territorio{" "}
                      {
                        territories.find((t) => t.id === form.territory_id)
                          ?.territory_number
                      }
                    </h2>
                    <p>
                      Haz clic para agregar vértices. Puedes arrastrarlos o
                      ajustar sus coordenadas. Guardar cierra cada contorno.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => setForm(null)}
                    disabled={busy}
                  >
                    Cancelar edición
                  </button>
                </section>
              )}
              <div className="territory-map-layout">
                <section className="panel map-main-panel">
                  <div className="map-toolbar">
                    <span>
                      {visibleShapes.length} polígonos · {filtered.length}{" "}
                      territorios
                    </span>
                    <div className="button-row">
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={streets}
                          onChange={(e) => setStreets(e.target.checked)}
                        />
                        Mostrar calles
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={blockLabels}
                          onChange={(e) => setBlockLabels(e.target.checked)}
                        />
                        Mostrar manzanas
                      </label>
                      <button
                        className="secondary"
                        onClick={() => setFitKey((v) => v + 1)}
                      >
                        <Crosshair size={14} />
                        Ver todos
                      </button>
                    </div>
                  </div>
                  <TerritoryMapCanvas
                    territories={filtered}
                    shapes={visibleShapes}
                    today={today}
                    colorMode={colorMode}
                    selected={selected}
                    onSelect={choose}
                    fitKey={fitKey}
                    focusKey={focusKey}
                    streets={streets}
                    showPartLabels={blockLabels}
                    editLabels={form?.partLabels ?? null}
                    editParts={form?.parts ?? null}
                    currentPart={form?.currentPart ?? 0}
                    onAddPoint={(p) => changeParts((part) => [...part, p])}
                    onMovePoint={(index, p) =>
                      changeParts((part) =>
                        part.map((v, i) => (i === index ? p : v)),
                      )
                    }
                  />
                  <p className="map-map-caption">
                    {colorMode === "assignment"
                      ? "Colores según el estado actual de la asignación. La alerta empieza 14 días antes de cumplir 3 meses calendario. Gris: territorio inactivo."
                      : "Colores según la última finalización registrada: 4, 8 y 12 meses calendario. Gris: territorio inactivo."}{" "}
                    Selecciona un área para consultar sus fechas y avisos.
                  </p>
                </section>
                <aside className="map-detail-column">
                  {form ? (
                    <form
                      className="panel map-edit-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void save();
                      }}
                      noValidate
                    >
                      <fieldset disabled={busy}>
                        <h2>Editor de límites</h2>
                        <label>
                          Parte del territorio
                          <select
                            value={form.currentPart}
                            onChange={(e) =>
                              setForm((f) =>
                                f
                                  ? {
                                      ...f,
                                      currentPart: Number(e.target.value),
                                    }
                                  : f,
                              )
                            }
                          >
                            {form.parts.map((p, i) => (
                              <option key={i} value={i}>
                                Parte {i + 1} · {p.length} vértices
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="button-row">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              setForm((f) =>
                                f
                                  ? {
                                      ...f,
                                      parts: [...f.parts, []],
                                      partLabels: [...f.partLabels, null],
                                      currentPart: f.parts.length,
                                    }
                                  : f,
                              )
                            }
                            disabled={form.parts.length >= 64}
                          >
                            <Plus size={13} />
                            Agregar parte
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              changeParts((part) => part.slice(0, -1))
                            }
                          >
                            <Undo2 size={13} />
                            Deshacer punto
                          </button>
                          <button
                            type="button"
                            className="text-button danger-text"
                            onClick={() =>
                              setForm((f) =>
                                f
                                  ? {
                                      ...f,
                                      parts:
                                        f.parts.length > 1
                                          ? f.parts.filter(
                                              (_, i) => i !== f.currentPart,
                                            )
                                          : [[]],
                                      partLabels:
                                        f.parts.length > 1
                                          ? f.partLabels.filter(
                                              (_, i) => i !== f.currentPart,
                                            )
                                          : [null],
                                      currentPart: 0,
                                    }
                                  : f,
                              )
                            }
                          >
                            Quitar parte
                          </button>
                        </div>
                        <label>
                          Manzana o referencia (opcional)
                          <input
                            value={form.partLabels[form.currentPart] ?? ""}
                            maxLength={80}
                            placeholder="Ej.: H, I, W o A1"
                            aria-describedby="map-part-label-help"
                            onChange={(e) =>
                              setForm((f) =>
                                f
                                  ? {
                                      ...f,
                                      partLabels: f.partLabels.map(
                                        (label, index) =>
                                          index === f.currentPart
                                            ? e.target.value
                                            : label,
                                      ),
                                    }
                                  : f,
                              )
                            }
                          />
                        </label>
                        <p id="map-part-label-help" className="help-text">
                          Se muestra dentro de esta parte al acercar el mapa o
                          seleccionar el territorio. Hasta 40 caracteres; puedes
                          dejarlo vacío.
                        </p>
                        <details className="map-coordinate-editor">
                          <summary>Coordenadas de los vértices</summary>
                          <div>
                            {form.parts[form.currentPart].map(
                              ([lng, lat], i) => (
                                <div key={i}>
                                  <span>{i + 1}</span>
                                  <input
                                    type="number"
                                    step="any"
                                    value={lat}
                                    aria-label={`Latitud del vértice ${i + 1}`}
                                    onChange={(e) =>
                                      changeParts((part) =>
                                        part.map((p, j) =>
                                          j === i
                                            ? [p[0], Number(e.target.value)]
                                            : p,
                                        ),
                                      )
                                    }
                                  />
                                  <input
                                    type="number"
                                    step="any"
                                    value={lng}
                                    aria-label={`Longitud del vértice ${i + 1}`}
                                    onChange={(e) =>
                                      changeParts((part) =>
                                        part.map((p, j) =>
                                          j === i
                                            ? [Number(e.target.value), p[1]]
                                            : p,
                                        ),
                                      )
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="icon"
                                    aria-label={`Quitar vértice ${i + 1}`}
                                    onClick={() =>
                                      changeParts((part) =>
                                        part.filter((_, j) => j !== i),
                                      )
                                    }
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              ),
                            )}
                          </div>
                        </details>
                        <label>
                          Motivo del cambio (obligatorio)
                          <textarea
                            ref={reasonInput}
                            required
                            aria-describedby="map-change-reason-help"
                            aria-invalid={
                              !!editError && !!mapChangeReasonError(form.reason)
                            }
                            value={form.reason}
                            minLength={8}
                            maxLength={2000}
                            onChange={(e) => {
                              setEditError("");
                              setForm((f) =>
                                f ? { ...f, reason: e.target.value } : f,
                              );
                            }}
                            placeholder="Explica cómo revisaste o corregiste los límites"
                          />
                        </label>
                        <p
                          className="map-reason-help"
                          id="map-change-reason-help"
                        >
                          Para guardar, escribe al menos 8 caracteres explicando
                          el cambio. El motivo quedará en la auditoría.
                        </p>
                        {formError && (
                          <p className="map-inline-error" role="status">
                            {formError}
                          </p>
                        )}
                        {editError && (
                          <p className="map-inline-error" role="alert">
                            {editError}
                          </p>
                        )}
                        <button
                          type="submit"
                          className="primary wide"
                          disabled={busy}
                        >
                          <Save size={15} />
                          {busy ? "Guardando…" : "Guardar como borrador"}
                        </button>
                      </fieldset>
                    </form>
                  ) : selectedTerritory ? (
                    <section className="panel map-selected-detail">
                      <div className="map-detail-title">
                        <span
                          style={{
                            background: mapTerritoryAppearance(
                              selectedTerritory,
                              today,
                              colorMode,
                            ).color,
                          }}
                        />
                        <h2>Territorio {selectedTerritory.territory_number}</h2>
                        <button
                          className="icon"
                          aria-label="Cerrar selección del territorio"
                          onClick={() => setSelected("")}
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <dl>
                        <div>
                          <dt>Última vez predicado</dt>
                          <dd>
                            {selectedTerritory.last_completed
                              ? displayDate(selectedTerritory.last_completed)
                              : "Sin registro"}
                          </dd>
                        </div>
                        <div>
                          <dt>Prioridad</dt>
                          <dd>
                            {
                              coveragePriority(
                                selectedTerritory.last_completed,
                                today,
                              ).label
                            }
                          </dd>
                        </div>
                        <div>
                          <dt>Estado</dt>
                          <dd>{selectedStatus?.label}</dd>
                        </div>
                        <div>
                          <dt>Límites</dt>
                          <dd>{reviewLabel(selectedShape)}</dd>
                        </div>
                      </dl>
                      {selectedStatus && (
                        <div
                          className={`map-status-notice map-status-${selectedStatus.key}`}
                          style={
                            {
                              "--status-color": selectedStatus.color,
                            } as React.CSSProperties
                          }
                          role={
                            selectedStatus.key === "closing-soon" ||
                            selectedStatus.key === "limit"
                              ? "status"
                              : undefined
                          }
                        >
                          <strong>{selectedStatus.label}</strong>
                          {selectedTerritory.assigned_at && (
                            <span>
                              Fecha de Inicio:{" "}
                              {displayDate(selectedTerritory.assigned_at)}
                            </span>
                          )}
                          <p>{selectedStatus.detail}</p>
                        </div>
                      )}
                      {selectedShape?.part_labels?.some(Boolean) && (
                        <ul
                          className="map-part-label-list"
                          aria-label="Manzanas y referencias del territorio"
                        >
                          {selectedShape.part_labels.map(
                            (label, index) =>
                              label && (
                                <li key={index}>
                                  <span>Parte {index + 1}</span>
                                  <strong>{label}</strong>
                                </li>
                              ),
                          )}
                        </ul>
                      )}
                      {selectedShape && !selectedShape.deleted_at && (
                        <>
                          <small>
                            {selectedShape.geometry.coordinates.length} partes ·
                            versión {selectedShape.version}
                          </small>
                          <a
                            className="secondary map-google-link"
                            href={googleMapsUrl(selectedShape.geometry)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={14} />
                            Abrir en Google Maps
                          </a>
                        </>
                      )}
                      {can(profile, "territories.view") && (
                        <button
                          className="secondary wide"
                          onClick={() => onOpenTerritory(selectedTerritory.id)}
                        >
                          Ver historial del territorio
                        </button>
                      )}
                      {actions(selectedTerritory, selectedShape)}
                    </section>
                  ) : (
                    <section className="panel map-selection-help">
                      <Map size={25} />
                      <h2>Explora tus territorios</h2>
                      <p>
                        Selecciona un área para consultar sus fechas, límites y
                        estado.
                      </p>
                    </section>
                  )}
                  {selectedTerritory && !form && (
                    <TerritoryVisitNotice
                      territoryId={selectedTerritory.id}
                      rows={snapshot.visit_restrictions ?? []}
                      summary={context.visit_restriction_summary?.find(
                        (row) => row.territory_id === selectedTerritory.id,
                      )}
                      today={today}
                      canView={can(profile, "visits.view")}
                      onManage={
                        can(profile, "visits.view")
                          ? () => onOpenVisits(selectedTerritory.id)
                          : undefined
                      }
                    />
                  )}
                  <section className="panel map-territory-list">
                    <h2>
                      Territorios <span>{filtered.length}</span>
                    </h2>
                    <div>
                      {filtered.map((t) => {
                        const appearance = mapTerritoryAppearance(
                          t,
                          today,
                          colorMode,
                        );
                        return (
                          <button
                            key={t.id}
                            className={selected === t.id ? "selected" : ""}
                            onClick={() => choose(t.id)}
                            disabled={!!form && form.territory_id !== t.id}
                          >
                            <span
                              className="map-list-number"
                              style={{
                                borderColor: appearance.color,
                                color: appearance.color,
                              }}
                            >
                              {t.territory_number}
                            </span>
                            <span>
                              <strong>Territorio {t.territory_number}</strong>
                              <small>{appearance.label}</small>
                              <small>
                                {t.last_completed
                                  ? displayDate(t.last_completed)
                                  : "Sin registro"}{" "}
                                · {reviewLabel(shapeFor(t.id))}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                      {!filtered.length && (
                        <p>No hay territorios con estos filtros.</p>
                      )}
                    </div>
                  </section>
                </aside>
              </div>
            </>
          ) : (
            <section className="panel map-master-panel">
              <h2>Maestro de polígonos</h2>
              <div className="map-master-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Territorio</th>
                      <th>Última vez predicado</th>
                      <th>Estado</th>
                      <th>Revisión de límites</th>
                      <th>Partes</th>
                      <th>Manzanas / referencias</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .slice(
                        (Math.min(
                          page,
                          Math.max(1, Math.ceil(filtered.length / size)),
                        ) -
                          1) *
                          size,
                        Math.min(
                          page,
                          Math.max(1, Math.ceil(filtered.length / size)),
                        ) * size,
                      )
                      .map((t) => {
                        const shape = shapeFor(t.id),
                          appearance = mapTerritoryAppearance(
                            t,
                            today,
                            colorMode,
                          ),
                          status = mapTerritoryStatus(t, today);
                        return (
                          <tr key={t.id}>
                            <td>
                              <span
                                className="map-table-dot"
                                style={{
                                  background: appearance.color,
                                }}
                              />
                              Territorio {t.territory_number}
                            </td>
                            <td>
                              {t.last_completed
                                ? displayDate(t.last_completed)
                                : "Sin registro"}
                            </td>
                            <td title={status.detail}>
                              {status.label}
                              {status.deadline && (
                                <small className="map-table-deadline">
                                  Límite: {displayDate(status.deadline)}
                                </small>
                              )}
                              {status.availableOn && (
                                <small className="map-table-deadline">
                                  Disponible: {displayDate(status.availableOn)}
                                </small>
                              )}
                            </td>
                            <td>{reviewLabel(shape)}</td>
                            <td>{shape?.geometry.coordinates.length ?? "—"}</td>
                            <td className="map-master-labels">
                              {shape?.part_labels
                                ?.filter(Boolean)
                                .join(" · ") || "—"}
                            </td>
                            <td>{actions(t, shape)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <DataPager
                total={filtered.length}
                page={page}
                size={size}
                onPage={setPage}
                onSize={setSize}
              />
            </section>
          )}
        </>
      )}
      {pending && (
        <Modal
          title={`${pending.kind === "approve" ? "Validar límites" : pending.kind === "delete" ? "Eliminar polígono" : "Restaurar polígono"} · Territorio ${pending.number}`}
          onClose={() => {
            if (!busy) setPending(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void performAction();
            }}
          >
            <p>
              {pending.kind === "approve"
                ? "Confirma la alineación con las calles y los límites reales del territorio. La validación quedará registrada con tu usuario."
                : pending.kind === "delete"
                  ? "El polígono irá a Papelera. El historial y las asignaciones del territorio se conservan."
                  : "El polígono regresará como borrador para revisar sus límites."}
            </p>
            {pending.kind === "approve" && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  required
                  checked={confirmedReview}
                  onChange={(e) => setConfirmedReview(e.target.checked)}
                />
                Revisé los límites y confirmo que corresponden al territorio.
              </label>
            )}
            <label>
              Motivo
              <textarea
                required
                minLength={8}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => setPending(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  reason.trim().length < 8 ||
                  (pending.kind === "approve" && !confirmedReview)
                }
              >
                Confirmar
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {importForm && (
        <Modal
          title="Previsualizar importación geográfica"
          onClose={() => {
            if (!busy) setImportForm(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void commitImport();
            }}
          >
            <p>
              {importForm.filename} · {importForm.rows.length} territorios.
              Todos los límites quedarán como borrador. La carga completa se
              guarda en una sola operación.
            </p>
            <div className="map-import-preview">
              {importForm.rows.map((row) => (
                <div key={row.territory_number}>
                  <strong>Territorio {row.territory_number}</strong>
                  <span>
                    {row.expected_version ? "Actualizar" : "Crear"} ·{" "}
                    {row.geometry.coordinates.length} partes
                  </span>
                </div>
              ))}
            </div>
            <label>
              Procedencia
              <textarea
                value={importForm.source}
                required
                maxLength={1500}
                onChange={(e) =>
                  setImportForm((f) =>
                    f ? { ...f, source: e.target.value } : f,
                  )
                }
              />
            </label>
            <label>
              Motivo
              <textarea
                value={importForm.reason}
                required
                minLength={8}
                maxLength={2000}
                onChange={(e) =>
                  setImportForm((f) =>
                    f ? { ...f, reason: e.target.value } : f,
                  )
                }
              />
            </label>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => setImportForm(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={busy || importForm.reason.trim().length < 8}
              >
                Importar {importForm.rows.length} polígonos
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
