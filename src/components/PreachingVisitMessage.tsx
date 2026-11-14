import { useRef, useState } from "react";
import { Check, Copy, House } from "lucide-react";
import { preachingVisitMessage } from "../lib/preachingVisitMessage";
import type { PreachingContext, PreachingRow } from "../lib/preachingSchedule";
import type { VisitRestriction } from "../lib/types";

export default function PreachingVisitMessage({
  weekStart,
  rows,
  context,
  restrictions,
  canView,
  dirty,
}: {
  weekStart: string;
  rows: readonly PreachingRow[];
  context: Pick<PreachingContext, "territories" | "conductors">;
  restrictions?: VisitRestriction[];
  canView: boolean;
  dirty: boolean;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [result, setResult] = useState<{
    text: string;
    copied: boolean;
  } | null>(null);
  const ready = canView && restrictions !== undefined;
  const text = ready
    ? preachingVisitMessage(weekStart, rows, context, restrictions)
    : "";
  const currentResult = result?.text === text ? result : null;
  async function copy() {
    if (!ready) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setResult({ text, copied: true });
    } catch {
      field.current?.focus();
      field.current?.select();
      field.current?.setSelectionRange(0, field.current.value.length);
      setResult({ text, copied: false });
    }
  }
  return (
    <section
      className="panel preaching-visit-message"
      aria-label="Casas No Tocar · Mensaje para WhatsApp"
    >
      <div className="panel-heading">
        <div>
          <h2>
            <House size={17} />
            <strong>
              <em>Casas No Tocar</em>
            </strong>
          </h2>
          <p className="small muted">
            Mensaje para el grupo de conductores. La fecha corresponde a cada
            salida del cronograma.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={!ready}
          onClick={() => void copy()}
        >
          {currentResult?.copied ? <Check size={15} /> : <Copy size={15} />}
          {currentResult?.copied ? "Mensaje copiado" : "Copiar mensaje"}
        </button>
      </div>
      {!canView ? (
        <p className="small muted">
          Necesitas el permiso de visualizar Domicilios sin visitas para
          consultar y copiar este mensaje.
        </p>
      ) : restrictions === undefined ? (
        <p className="small muted" role="status">
          Cargando avisos de domicilios sin visitas…
        </p>
      ) : (
        <>
          <textarea
            ref={field}
            aria-label="Mensaje Casas No Tocar para WhatsApp"
            readOnly
            value={text}
            rows={Math.max(4, Math.min(12, text.split("\n").length + 1))}
            spellCheck={false}
          />
          <p className="small muted">
            El título lleva negrita y cursiva al pegarlo en WhatsApp.
            {dirty ? " Incluye los cambios sin guardar del cronograma." : ""}
          </p>
          {currentResult && (
            <p
              className={currentResult.copied ? "small notice" : "small error"}
              role="status"
            >
              {currentResult.copied
                ? "Mensaje copiado. Ya puedes pegarlo en tu grupo de WhatsApp."
                : "No se pudo copiar automáticamente. El texto quedó seleccionado; usa la opción Copiar de tu dispositivo."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
