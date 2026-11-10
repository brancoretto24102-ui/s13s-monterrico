// Prepare private input for an authorized database import. No input data is
// printed or stored in the public source tree; this script does not mutate DBs.
import readXlsxFile from "read-excel-file/node";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { analyzeVisitSheet } from "../src/lib/visitImport";
import { sha256 } from "../src/lib/importer";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Indique el Excel de entrada y una salida JSON privada fuera del repositorio.",
  );
const root = resolve(new URL("../", import.meta.url).pathname);
if (resolve(output) === root || resolve(output).startsWith(root + sep))
  throw new Error("La salida privada debe estar fuera del repositorio.");
const bytes = await readFile(input);
const workbook = await readXlsxFile(bytes);
const sheet = workbook.find((s) => s.sheet === "NO TOCAR");
if (!sheet) throw new Error("Falta la hoja NO TOCAR.");
const rows = analyzeVisitSheet(sheet.data);
await writeFile(
  output,
  JSON.stringify({ source_hash: await sha256(bytes), rows }, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    data_records: rows.length,
    header_rows: 1,
    columns: ["Fecha informada", "Territorio", "Observación"],
    result: "READY",
  }),
);
