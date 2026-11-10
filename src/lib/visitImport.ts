import { normalizeName, parseExcelDate, todayLima } from "./dates";
import { validateVisitRestriction } from "./visitRestrictions";

export function analyzeVisitSheet(data: unknown[][], today = todayLima()) {
  const headers = data[0]?.map((value) =>
    normalizeName(String(value ?? "")).trim(),
  );
  if (
    headers?.[0] !== "fecha informada" ||
    headers[1] !== "territorio" ||
    headers[2] !== "observacion"
  )
    throw new Error(
      "La hoja NO TOCAR debe contener Fecha informada, Territorio y Observación.",
    );
  const seen = new Set<string>();
  const rows = data.slice(1).flatMap((row, index) => {
    if (
      row.every(
        (value) =>
          value === null || value === undefined || String(value).trim() === "",
      )
    )
      return [];
    const territory = Number(row[1]);
    if (!Number.isInteger(territory) || territory < 1)
      throw new Error(`NO TOCAR, fila ${index + 2}: territorio no válido.`);
    const reported = parseExcelDate(row[0]);
    if (!reported)
      throw new Error(`NO TOCAR, fila ${index + 2}: falta la fecha informada.`);
    const values = validateVisitRestriction(
      String(row[2] ?? ""),
      reported,
      today,
    );
    const identity = `${territory}|${values.address_reference.toLocaleLowerCase("es")}`;
    if (seen.has(identity))
      throw new Error(
        `NO TOCAR, fila ${index + 2}: domicilio repetido. Revise las fechas antes de importar.`,
      );
    seen.add(identity);
    return [
      {
        territory_number: territory,
        ...values,
        source_reference: `NO TOCAR!A${index + 2}:C${index + 2}`,
      },
    ];
  });
  return rows;
}
