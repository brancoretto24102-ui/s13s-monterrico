// Keep one visible page in memory, with a bounded bitmap on high-DPI phones.
export function pdfPreviewSize(
  width: number,
  height: number,
  available: number,
  zoom = 1,
  dpr = 1,
) {
  if (
    ![width, height, available, zoom, dpr].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    throw new Error("Dimensiones de página no válidas.");
  const cssWidth = Math.max(1, Math.min(available, 1200)) * Math.min(zoom, 2);
  const cssHeight = (cssWidth * height) / width;
  const scale = Math.min(
    Math.max(dpr, 1),
    2,
    2400 / cssWidth,
    2400 / cssHeight,
    Math.sqrt(3_000_000 / (cssWidth * cssHeight)),
  );
  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.floor(cssWidth * scale)),
    pixelHeight: Math.max(1, Math.floor(cssHeight * scale)),
  };
}
