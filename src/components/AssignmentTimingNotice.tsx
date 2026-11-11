import { CalendarClock, ShieldAlert } from "lucide-react";
import { displayDate, isDate } from "../lib/dates";
import {
  assignmentDeadline,
  nextAssignmentDate,
} from "../lib/assignmentTiming";
import type { Assignment } from "../lib/types";
import "./AssignmentTimingNotice.css";

export default function AssignmentTimingNotice({
  history,
  start,
  issues,
  allowed,
  assigning,
}: {
  history: Assignment[];
  start: string;
  issues: string[];
  allowed: boolean;
  assigning: boolean;
}) {
  const next = assigning ? nextAssignmentDate(history) : null;
  return (
    <div
      className={`assignment-timing ${issues.length ? "has-exception" : ""}`}
      aria-live="polite"
    >
      <strong className="assignment-timing-title">
        <CalendarClock size={16} />
        Plazos del territorio
      </strong>
      {assigning && (
        <p>
          {next ? (
            <>
              Primer inicio permitido: <b>{displayDate(next)}</b>.
            </>
          ) : (
            "Espera mínima de 14 días desde la finalización anterior."
          )}
        </p>
      )}
      {isDate(start) && (
        <p>
          Fecha límite de cierre:{" "}
          <b>{displayDate(assignmentDeadline(start))}</b> · 3 meses calendario.
        </p>
      )}
      {issues.length > 0 && (
        <div className="timing-exception-info">
          <strong>
            <ShieldAlert size={16} />
            Excepción de plazos requerida
          </strong>
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <p>
            {allowed
              ? "Debes indicar un motivo. Se guardará en las observaciones del territorio y en la auditoría."
              : "Tu perfil no autoriza estas excepciones. Respeta las fechas indicadas o solicita la intervención de una persona autorizada."}
          </p>
        </div>
      )}
    </div>
  );
}
