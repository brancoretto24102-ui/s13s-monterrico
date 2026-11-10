import type { Period } from "./types";
const months = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
export function todayLima(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (k: string) => p.find((x) => x.type === k)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return (
    !isNaN(+d) && d.toISOString().slice(0, 10) === s && +s.slice(0, 4) >= 1900
  );
}
export function displayDate(s: string | null | undefined): string {
  return s ? s.split("-").reverse().join("/") : "—";
}
export function monthLabel(s: string): string {
  return `${months[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
}
export function servicePeriod(year: number, now = new Date()): Period {
  if (!Number.isInteger(year) || year < 1900 || year > 9998)
    throw new Error("Año de servicio inválido.");
  return {
    start: `${year}-09-01`,
    end: `${year + 1}-08-31`,
    label: `${year}-${year + 1}`,
    mode: "service",
    generatedOn: todayLima(now),
  };
}
export function customPeriod(
  start: string,
  end: string,
  now = new Date(),
  allowFuture = false,
): Period {
  if (!isDate(start) || !isDate(end) || start > end)
    throw new Error(
      "El inicio debe ser una fecha válida anterior o igual al fin.",
    );
  if (!allowFuture && end > todayLima(now))
    throw new Error("El rango personalizado no puede terminar en el futuro.");
  return {
    start,
    end,
    label: `${monthLabel(start)}-${monthLabel(end)}`,
    mode: "custom",
    generatedOn: todayLima(now),
  };
}
export function currentPeriod(month: string, now = new Date()): Period {
  const p = customPeriod(`${month}-01`, todayLima(now), now);
  return {
    ...p,
    mode: "current",
    label: `${p.label} (Actualidad: ${displayDate(p.end)})`,
  };
}
export function parseExcelDate(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  let s: string;
  if (value instanceof Date) {
    if (isNaN(+value)) throw new Error("Fecha Excel inválida.");
    s = value.toISOString().slice(0, 10);
  } else if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < 1 ||
      value === 60
    )
      throw new Error("Serial Excel inválido o con hora.");
    s = new Date(
      Date.UTC(1899, 11, 30) + (value < 60 ? value + 1 : value) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  } else {
    const v = String(value).trim();
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
    s = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : v;
  }
  if (!isDate(s)) throw new Error(`Fecha inválida: ${String(value)}`);
  return s;
}
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}
