import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import { pdfPreviewSize } from "../lib/pdfPreview";
import "./PdfCanvasPreview.css";

export default function PdfCanvasPreview({ bytes }: { bytes: Uint8Array }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [width, setWidth] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const viewport = useRef<HTMLDivElement>(null),
    canvasHost = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false,
      task: PDFDocumentLoadingTask | undefined;
    setDoc(null);
    setPage(1);
    setError("");
    setBusy(true);
    canvasHost.current?.replaceChildren();
    void (async () => {
      try {
        const { loadPdfPreview } = await import("../lib/pdfPreviewRenderer");
        if (cancelled) return;
        task = loadPdfPreview(bytes);
        const loaded = await task.promise;
        if (!cancelled) setDoc(loaded);
      } catch {
        if (!cancelled) {
          setError(
            "No se pudo mostrar la página. Puedes volver a intentarlo o descargar el PDF.",
          );
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy().catch(() => {});
    };
  }, [bytes, retry]);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(1, Math.floor(entries[0].contentRect.width))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!doc || !width) return;
    let cancelled = false,
      render: RenderTask | undefined;
    setBusy(true);
    setError("");
    void (async () => {
      let pdfPage;
      try {
        pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const original = pdfPage.getViewport({ scale: 1 }),
          size = pdfPreviewSize(
            original.width,
            original.height,
            width,
            zoom,
            window.devicePixelRatio || 1,
          );
        const canvas = document.createElement("canvas");
        canvas.width = size.pixelWidth;
        canvas.height = size.pixelHeight;
        canvas.style.width = `${size.cssWidth}px`;
        canvas.style.height = `${size.cssHeight}px`;
        canvas.setAttribute("role", "img");
        canvas.setAttribute(
          "aria-label",
          `Página ${page} de ${doc.numPages} del formulario S-13-S`,
        );
        render = pdfPage.render({
          canvas,
          viewport: pdfPage.getViewport({
            scale: size.pixelWidth / original.width,
          }),
        });
        await render.promise;
        if (!cancelled) {
          canvasHost.current?.replaceChildren(canvas);
          setBusy(false);
        }
      } catch {
        if (!cancelled) {
          setError(
            "No se pudo dibujar esta página. El PDF sigue disponible para descargar.",
          );
          setBusy(false);
        }
      } finally {
        pdfPage?.cleanup();
      }
    })();
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [doc, page, width, zoom]);
  return (
    <div className="pdf-canvas-preview">
      <div
        className="pdf-canvas-controls"
        aria-label="Controles de la vista previa PDF"
      >
        <div>
          <button
            className="secondary"
            aria-label="Página anterior del PDF"
            disabled={!doc || page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <output aria-live="polite">
            Página {page} de {doc?.numPages ?? "…"}
          </output>
          <button
            className="secondary"
            aria-label="Página siguiente del PDF"
            disabled={!doc || page >= doc.numPages}
            onClick={() => setPage((v) => v + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <label>
          Ampliación
          <select
            aria-label="Ampliación de la vista previa PDF"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            <option value={1}>Ancho de página</option>
            <option value={1.5}>150 %</option>
            <option value={2}>200 %</option>
          </select>
        </label>
      </div>
      <div ref={viewport} className="pdf-page-scroll" aria-busy={busy}>
        <div ref={canvasHost} className="pdf-canvas-page" />
        {busy && (
          <p className="pdf-render-status" role="status">
            Preparando página…
          </p>
        )}
      </div>
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button className="secondary" onClick={() => setRetry((v) => v + 1)}>
            <RotateCcw size={14} />
            Volver a mostrar
          </button>
        </div>
      )}
      <p className="small muted">
        Usa las flechas para revisar las páginas y amplía para leer los
        detalles. La descarga conserva el PDF original.
      </p>
    </div>
  );
}
