import { useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { previewExcel } from "../lib/importer";
import { displayDate } from "../lib/dates";
import { rpc } from "../lib/client";
import type { ImportPreview } from "../lib/types";
export default function ImportPanel({
  demo,
  onImported,
}: {
  demo: boolean;
  onImported: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null),
    [approved, setApproved] = useState(true),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const errors = preview?.issues.filter((i) => i.severity === "error") ?? [];
  async function analyze(file: File) {
    setBusy(true);
    setMessage("");
    setPreview(null);
    setAck(false);
    try {
      setPreview(await previewExcel(file, approved));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!preview || errors.length || !ack) return;
    setBusy(true);
    try {
      if (demo)
        throw new Error(
          "La importación real requiere una sesión administrativa conectada. Esta vista permite revisar el archivo sin guardarlo.",
        );
      const result = await rpc<{
        already_imported: boolean;
        inserted: number;
        skipped: number;
      }>("import_history", {
        p_file_name: preview.fileName,
        p_file_hash: preview.fileHash,
        p_rows: preview.rows,
        p_report: { issues: preview.issues, sheets: preview.sheets },
      });
      setMessage(
        result.already_imported
          ? "Este archivo ya fue importado. No se ha duplicado ningún registro."
          : `Importación completada: ${result.inserted} registros nuevos; ${result.skipped} ya existentes.`,
      );
      await onImported();
      setAck(false);
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
          <span className="eyebrow">MIGRACIÓN SEGURA</span>
          <h1>Importar historial</h1>
          <p>Revisa primero. Guarda cuando todo esté conciliado.</p>
        </div>
      </div>
      <section className="panel">
        <div className="upload-intro">
          <FileSpreadsheet size={32} />
          <div>
            <h2>Libro histórico de territorios</h2>
            <p>
              Se analiza la hoja S-13-S. El archivo original se conserva en tu
              equipo.
            </p>
          </div>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => {
              setApproved(e.target.checked);
              setPreview(null);
            }}
          />
          Aplicar el ajuste histórico aprobado: territorio 64, asignado y
          completado el 29/08/2026. El ajuste quedará en auditoría.
        </label>
        <label className="dropzone">
          <Upload size={25} />
          <strong>Selecciona el Excel histórico</strong>
          <span>Archivo .xlsx de hasta 10 MB</span>
          <input
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.[0]) void analyze(e.target.files[0]);
            }}
          />
        </label>
        {busy && <p role="status">Procesando el historial…</p>}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>
      {preview && (
        <>
          <div className="stats compact">
            <article>
              <span>Registros reconocidos</span>
              <strong>{preview.rows.length}</strong>
            </article>
            <article>
              <span>Errores por revisar</span>
              <strong>{errors.length}</strong>
            </article>
            <article>
              <span>Hojas reconocidas</span>
              <strong>{preview.sheets.length}</strong>
            </article>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                {errors.length ? (
                  <>
                    <AlertCircle size={20} /> Revisión pendiente
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={20} /> Listo para conciliar
                  </>
                )}
              </h2>
              <span className="muted small">{preview.fileName}</span>
            </div>
            {preview.issues.map((issue, i) => (
              <p
                key={i}
                className={issue.severity === "error" ? "error" : "notice"}
              >
                {issue.territory ? `Territorio ${issue.territory}: ` : ""}
                {issue.message}
                {issue.cell && <small className="block">{issue.cell}</small>}
              </p>
            ))}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Territorio</th>
                    <th>Responsable</th>
                    <th>Asignado</th>
                    <th>Completado</th>
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 30).map((r, i) => (
                    <tr key={i}>
                      <td>{r.territory_number}</td>
                      <td>{r.assigned_name_snapshot}</td>
                      <td>{displayDate(r.assigned_at)}</td>
                      <td>{displayDate(r.completed_at)}</td>
                      <td className="small muted">{r.source_cell_reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">
              Vista de los primeros 30 registros. Se validan todos los
              registros. Las hojas complementarias se reconocen y permanecen en
              el Excel para la siguiente etapa.
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              He revisado la previsualización y los ajustes. Autorizo importar
              este lote completo.
            </label>
            <button
              className="primary"
              disabled={
                busy || !ack || !!errors.length || !preview.rows.length || demo
              }
              onClick={() => void commit()}
            >
              Confirmar importación de {preview.rows.length} registros
            </button>
            <p className="small muted">
              Una transacción valida la secuencia completa. Si hay un conflicto,
              el lote entero se rechaza sin dejar registros parciales.
            </p>
          </section>
        </>
      )}
    </>
  );
}
