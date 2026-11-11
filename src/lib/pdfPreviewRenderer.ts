import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;
export function loadPdfPreview(bytes: Uint8Array) {
  return getDocument({
    // PDF.js transfers its buffer to the worker. Keep the downloadable PDF intact.
    data: bytes.slice(),
    standardFontDataUrl: new URL(
      `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
      window.location.origin,
    ).href,
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    enableXfa: false,
    isImageDecoderSupported: false,
  });
}
