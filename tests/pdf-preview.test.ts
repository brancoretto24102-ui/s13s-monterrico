import { describe, expect, it } from "vitest";
import { pdfPreviewSize } from "../src/lib/pdfPreview";
import { mapChangeReasonError } from "../src/lib/territoryMap";

describe("Vista previa PDF sin visor incrustado", () => {
  it("conserva la proporción del documento y se ajusta al ancho del teléfono", () => {
    const size = pdfPreviewSize(842, 595, 300, 1, 2);
    expect(size.cssWidth).toBe(300);
    expect(size.cssHeight / size.cssWidth).toBeCloseTo(595 / 842);
    expect(size.pixelWidth).toBe(600);
    expect(size.pixelHeight).toBe(Math.floor((600 * 595) / 842));
  });
  it("limita memoria y dimensiones en pantallas de alta densidad y zoom", () => {
    for (const dimensions of [
      [842, 595],
      [595, 842],
      [100, 4000],
    ]) {
      const size = pdfPreviewSize(dimensions[0], dimensions[1], 5000, 2, 5);
      expect(size.pixelWidth * size.pixelHeight).toBeLessThanOrEqual(3_000_000);
      expect(size.pixelWidth).toBeLessThanOrEqual(2400);
      expect(size.pixelHeight).toBeLessThanOrEqual(2400);
    }
  });
  it("permite ampliar dentro del panel sin alterar el PDF descargable", () => {
    const fit = pdfPreviewSize(842, 595, 300),
      zoom = pdfPreviewSize(842, 595, 300, 2);
    expect(zoom.cssWidth).toBe(fit.cssWidth * 2);
    expect(zoom.cssHeight).toBe(fit.cssHeight * 2);
  });
  it.each([0, -1, NaN, Infinity])(
    "rechaza tamaños no dibujables (%s)",
    (value) => expect(() => pdfPreviewSize(842, 595, value)).toThrow(),
  );
});
describe("Motivo al guardar vértices", () => {
  it.each([
    "",
    "   \n\t ",
    "Cambiar",
    "abcd            ef",
    "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0",
    "a".repeat(2001),
  ])("explica el motivo que falta o no cumple el mínimo", (reason) =>
    expect(mapChangeReasonError(reason)).toContain("motivo"),
  );
  it("acepta motivos completos y cuenta caracteres como el servidor", () => {
    expect(
      mapChangeReasonError("Ajuste de vértices para alinearlos con la calle"),
    ).toBe("");
    expect(mapChangeReasonError("12345678")).toBe("");
    expect(mapChangeReasonError("😀".repeat(7))).not.toBe("");
    expect(mapChangeReasonError("😀".repeat(8))).toBe("");
  });
});
