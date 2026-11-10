import { useEffect, useMemo, useRef, useState } from "react";
import { FileCheck2, Download, Eye, Printer, CalendarDays } from "lucide-react";
import {
  currentPeriod,
  customPeriod,
  displayDate,
  servicePeriod,
  todayLima,
} from "../lib/dates";
import { generateS13, TEMPLATE_SHA256 } from "../lib/pdf";
import { sha256 } from "../lib/importer";
import { reportRows, reportSummary } from "../lib/report";
import { downloadBlob, downloadJson, rpc, supabase } from "../lib/client";
import type { Period, Snapshot } from "../lib/types";
export default function ExportPanel({
  snapshot,
  demo,
  canExport,
}: {
  snapshot: Snapshot;
  demo: boolean;
  canExport: boolean;
}) {
  const today = todayLima();
  const [mode, setMode] = useState("service"),
    [year, setYear] = useState(
      +today.slice(0, 4) - (+today.slice(5, 7) < 9 ? 1 : 0),
    ),
    [start, setStart] = useState(`${today.slice(0, 4)}-06-01`),
    [end, setEnd] = useState(today),
    [month, setMonth] = useState(`${today.slice(0, 4)}-06`),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [meta, setMeta] = useState<unknown>(null);
  const localTemplate = useRef<Uint8Array | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const computed = useMemo(() => {
    try {
      return {
        period:
          mode === "service"
            ? servicePeriod(year)
            : mode === "custom"
              ? customPeriod(start, end)
              : currentPeriod(month),
        error: "",
      };
    } catch (e) {
      return { period: null, error: (e as Error).message };
    }
  }, [mode, year, start, end, month]);
  const period = computed.period;
  const summary = period
    ? reportSummary(
        reportRows(snapshot.territories, snapshot.assignments, period),
      )
    : null;
  useEffect(() => {
    setUrl("");
    setMeta(null);
  }, [mode, year, start, end, month]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function chooseTemplate(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if ((await sha256(bytes)) !== TEMPLATE_SHA256)
        throw new Error("Este archivo no es la plantilla oficial verificada.");
      localTemplate.current = bytes;
      setMessage("Plantilla oficial validada para esta sesión de ejemplo.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function generate() {
    if (!period || !canExport) return;
    setBusy(true);
    setMessage("");
    try {
      let bytes = localTemplate.current;
      let snap = snapshot;
      if (!demo) {
        snap = await rpc<Snapshot>("get_export_snapshot");
        const result = await supabase!.storage
          .from("s13s-private")
          .download("template/S-13_S.pdf");
        if (result.error)
          throw new Error(
            "No se pudo cargar la plantilla privada. El administrador debe subir el PDF oficial en Configuración.",
          );
        bytes = new Uint8Array(await result.data.arrayBuffer());
      }
      if (!bytes)
        throw new Error(
          "Selecciona la plantilla oficial para probar el generador en esta sesión de ejemplo.",
        );
      const result = await generateS13(bytes, snap, period as Period);
      setMeta(result.metadata);
      setUrl(
        URL.createObjectURL(
          new Blob([new Uint8Array(result.bytes)], { type: "application/pdf" }),
        ),
      );
      setMessage(
        `Formulario preparado: ${result.summary.assignments} asignaciones y ${result.summary.pages} páginas. Corte: ${displayDate(period.end)}.`,
      );
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
          <span className="eyebrow">DOCUMENTOS</span>
          <h1>Formulario S-13-S</h1>
          <p>El historial correcto, en el formulario de siempre.</p>
        </div>
        <span className="soft-tag">
          <FileCheck2 size={15} />
          Plantilla original
        </span>
      </div>
      <div className="export-layout">
        <section className="panel export-settings">
          <h2>
            <CalendarDays size={20} />
            Selecciona el periodo
          </h2>
          <label>
            Tipo de informe
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="service">Año de servicio</option>
              <option value="custom">Rango personalizado</option>
              <option value="current">Desde mes hasta actualidad</option>
            </select>
          </label>
          {mode === "service" ? (
            <label>
              Año de servicio
              <select value={year} onChange={(e) => setYear(+e.target.value)}>
                {Array.from(
                  { length: 20 },
                  (_, i) => +today.slice(0, 4) - 10 + i,
                ).map((y) => (
                  <option key={y} value={y}>
                    {y}-{y + 1}
                  </option>
                ))}
              </select>
            </label>
          ) : mode === "current" ? (
            <label>
              Mes inicial
              <input
                type="month"
                value={month}
                max={today.slice(0, 7)}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
          ) : (
            <div className="form-row">
              <label>
                Desde
                <input
                  type="date"
                  value={start}
                  max={end}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={end}
                  min={start}
                  max={today}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
          )}
          {computed.error && (
            <p className="error" role="alert">
              {computed.error}
            </p>
          )}
          {period && (
            <div className="period-preview">
              <small>ENCABEZADO DEL FORMULARIO</small>
              <strong>{period.label}</strong>
              <span>
                {displayDate(period.start)} al {displayDate(period.end)}
              </span>
            </div>
          )}
          {summary && (
            <dl className="summary-list">
              <div>
                <dt>Asignaciones</dt>
                <dd>{summary.assignments}</dd>
              </div>
              <div>
                <dt>Filas físicas / páginas</dt>
                <dd>
                  {summary.rows} / {summary.pages}
                </dd>
              </div>
              <div>
                <dt>Territorios sin asignaciones nuevas</dt>
                <dd>{summary.withoutNew.length}</dd>
              </div>
              <div>
                <dt>Últimos cierres históricos</dt>
                <dd>{summary.historical}</dd>
              </div>
              <div>
                <dt>Abiertas a la fecha de corte</dt>
                <dd>{summary.open}</dd>
              </div>
            </dl>
          )}
          {demo && (
            <label>
              PDF oficial para prueba local
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  if (e.target.files?.[0])
                    void chooseTemplate(e.target.files[0]);
                }}
              />
            </label>
          )}
          <button
            className="primary wide"
            disabled={busy || !period || !canExport}
            onClick={() => void generate()}
          >
            <Eye size={17} />
            {busy ? "Generando formulario…" : "Generar vista previa"}
          </button>
          {!canExport && (
            <p className="muted">Tu perfil no tiene permiso de exportación.</p>
          )}
          <p className="small muted">
            La fecha de actualidad se calcula en Perú y queda fijada al generar
            el documento.
          </p>
        </section>
        <section className="panel pdf-preview">
          <div className="panel-heading">
            <h2>Vista previa</h2>
            {url && (
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => {
                    frame.current?.contentWindow?.focus();
                    frame.current?.contentWindow?.print();
                  }}
                >
                  <Printer size={16} />
                  Imprimir
                </button>
                <a
                  className="primary"
                  href={url}
                  download={`S13S_${period?.start}_${period?.end}.pdf`}
                >
                  <Download size={16} />
                  Descargar PDF
                </a>
              </div>
            )}
          </div>
          {url ? (
            <iframe
              ref={frame}
              title="Vista previa del formulario oficial S-13-S"
              src={url}
            />
          ) : (
            <div className="empty-preview">
              <FileCheck2 size={52} />
              <h3>Tu formulario aparecerá aquí</h3>
              <p>
                Selecciona el periodo y genera la vista previa.
                <br />
                Se incluyen todos los territorios y sus continuaciones.
              </p>
              <div className="paper-outline">
                <span />
                <span />
                <div />
                {Array.from({ length: 5 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
          )}
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          {meta !== null && (
            <button
              className="text-button"
              onClick={() =>
                downloadJson(meta, "S13S-resumen-del-informe.json")
              }
            >
              Descargar resumen de verificación
            </button>
          )}
        </section>
      </div>
    </>
  );
}
