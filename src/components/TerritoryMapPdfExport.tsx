import { useEffect, useRef, useState } from "react";
import { Download, Eye, FileDown } from "lucide-react";
import { can, MAP_PDF_PERMISSION } from "../lib/permissions";
import { downloadBlob, rpc } from "../lib/client";
import { displayDate } from "../lib/dates";
import type { MapPdfContext, MapPdfResult } from "../lib/territoryMapPdf";
import type { MapColorMode, TerritoryMapContext } from "../lib/territoryMap";
import type { Profile } from "../lib/types";
import Modal from "./Modal";
import PdfCanvasPreview from "./PdfCanvasPreview";
import "./TerritoryMapPdfExport.css";

interface PdfSnapshot {
  fingerprint: string;
  as_of: string;
  context: MapPdfContext;
}
interface Prepared {
  result: MapPdfResult;
  fingerprint: string;
  today: string;
}

export default function TerritoryMapPdfExport({
  profile,
  context,
  filteredIds,
  colorMode,
  today,
  demo,
  disabled,
}: {
  profile: Profile;
  context: TerritoryMapContext;
  filteredIds: string[];
  colorMode: MapColorMode;
  today: string;
  demo: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [scope, setScope] = useState("all"),
    [mode, setMode] = useState(colorMode),
    [details, setDetails] = useState(true),
    [blocks, setBlocks] = useState(true),
    [prepared, setPrepared] = useState<Prepared | null>(null),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const epoch = useRef(0),
    controller = useRef<AbortController | null>(null);
  const allowed = can(profile, MAP_PDF_PERMISSION);
  const allIds = context.territories.filter((t) => t.active).map((t) => t.id);
  const ids = scope === "filtered" ? filteredIds : allIds;
  useEffect(
    () => () => {
      epoch.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!allowed) {
      epoch.current++;
      controller.current?.abort();
      setPrepared(null);
      setOpen(false);
      setBusy(false);
    }
  }, [allowed]);
  function close() {
    epoch.current++;
    controller.current?.abort();
    setOpen(false);
    setPrepared(null);
    setError("");
    setBusy(false);
  }
  async function prepare() {
    if (!allowed || busy) return;
    const run = ++epoch.current,
      abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setBusy(true);
    setPrepared(null);
    setError("");
    setProgress("Comprobando acceso y cargando las calles…");
    try {
      const snapshot = demo
        ? { context, as_of: today, fingerprint: "demo" }
        : await rpc<PdfSnapshot>("get_territory_map_pdf");
      const { loadPublicBasemap, loadMapPdfFonts, generateTerritoryMapPdf } =
        await import("../lib/territoryMapPdf");
      const [basemap, fonts] = await Promise.all([
        loadPublicBasemap(abort.signal),
        loadMapPdfFonts(abort.signal),
      ]);
      if (run !== epoch.current) return;
      const result = await generateTerritoryMapPdf(
        snapshot.context,
        basemap,
        {
          colorMode: mode,
          territoryIds:
            scope === "all"
              ? snapshot.context.territories
                  .filter((t) => t.active)
                  .map((t) => t.id)
              : [...ids],
          includeDetails: details,
          includeBlocks: blocks,
        },
        snapshot.as_of,
        fonts,
        demo,
        async (message) => {
          if (run !== epoch.current)
            throw new DOMException("Generación cancelada.", "AbortError");
          setProgress(message);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
        },
        abort.signal,
      );
      if (run === epoch.current)
        setPrepared({
          result,
          fingerprint: snapshot.fingerprint,
          today: snapshot.as_of,
        });
    } catch (e) {
      if (run === epoch.current && (e as Error).name !== "AbortError")
        setError((e as Error).message);
    } finally {
      if (run === epoch.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  async function download() {
    if (!allowed || !prepared || busy) return;
    const run = ++epoch.current;
    setBusy(true);
    setError("");
    try {
      if (!demo)
        await rpc("get_territory_map_pdf", {
          p_download: true,
          p_fingerprint: prepared.fingerprint,
        });
      if (run !== epoch.current) return;
      downloadBlob(
        new Blob([prepared.result.bytes.slice().buffer as ArrayBuffer], {
          type: "application/pdf",
        }),
        `Monterrico-mapa-territorios-${prepared.today}.pdf`,
      );
    } catch (e) {
      if (run === epoch.current) {
        setError((e as Error).message);
        setPrepared(null);
      }
    } finally {
      if (run === epoch.current) setBusy(false);
    }
  }
  if (!allowed) return null;
  return (
    <>
      <button
        className="secondary"
        disabled={disabled || busy}
        onClick={() => {
          setMode(colorMode);
          setOpen(true);
        }}
      >
        <FileDown size={15} />
        Exportar mapa PDF
      </button>
      {open && (
        <Modal
          title="Exportar mapa PDF"
          onClose={close}
          className="map-pdf-modal"
        >
          <div className="map-pdf-body">
            <p className="map-pdf-intro">
              Mapa vectorial con calles, números de territorio y referencias de
              manzana. Revisa las páginas antes de descargar.
            </p>
            <fieldset disabled={busy} className="map-pdf-options">
              <label>
                Territorios
                <select
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value);
                    setPrepared(null);
                  }}
                >
                  <option value="all">
                    Todos los activos ({allIds.length})
                  </option>
                  <option value="filtered">
                    Según los filtros actuales ({filteredIds.length})
                  </option>
                </select>
              </label>
              <label>
                Colores
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as MapColorMode);
                    setPrepared(null);
                  }}
                >
                  <option value="assignment">Estado de asignación</option>
                  <option value="coverage">Antigüedad de predicación</option>
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={details}
                  onChange={(e) => {
                    setDetails(e.target.checked);
                    setPrepared(null);
                  }}
                />
                Incluir sectores ampliados
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={blocks}
                  onChange={(e) => {
                    setBlocks(e.target.checked);
                    setPrepared(null);
                  }}
                />
                Incluir manzanas / referencias
              </label>
            </fieldset>
            <p className="map-pdf-note">
              Se genera en este dispositivo. Incluye un índice con las
              referencias completas; no incorpora conductores ni domicilios sin
              visitas. Las calles proceden de una instantánea pública de
              OpenStreetMap.
            </p>
            {demo && (
              <p className="notice">
                Vista de ejemplo: el PDF contiene polígonos y registros
                ficticios.
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {busy && (
              <p role="status" className="notice">
                {progress ||
                  "Comprobando permiso y vigencia antes de descargar…"}
              </p>
            )}
            <div className="map-pdf-actions">
              <button
                className="secondary"
                disabled={busy || !ids.length}
                onClick={() => void prepare()}
              >
                <Eye size={15} />
                {prepared ? "Actualizar vista previa" : "Preparar vista previa"}
              </button>
              {prepared && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void download()}
                >
                  <Download size={15} />
                  Descargar PDF
                </button>
              )}
            </div>
            {prepared && (
              <section
                aria-label="Vista previa del mapa PDF"
                className="map-pdf-preview"
              >
                <p className="map-pdf-summary">
                  {prepared.result.pages} páginas ·{" "}
                  {prepared.result.territories}{" "}
                  {prepared.result.territories === 1
                    ? "territorio"
                    : "territorios"}{" "}
                  · {prepared.result.blocks}{" "}
                  {prepared.result.blocks === 1 ? "referencia" : "referencias"}{" "}
                  · {(prepared.result.bytes.length / 1024 / 1024).toFixed(2)} MB
                  · Corte: {displayDate(prepared.today)}
                </p>
                <PdfCanvasPreview
                  bytes={prepared.result.bytes}
                  documentName="mapa de territorios"
                />
                <p className="map-pdf-note">
                  Calles actualizadas al{" "}
                  {displayDate(prepared.result.basemapDate)}. El mapa general
                  usa tamaño A1 y los sectores A2. El PDF conserva líneas y
                  textos vectoriales al ampliar.
                </p>
              </section>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
