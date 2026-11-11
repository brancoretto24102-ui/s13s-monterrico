import { ArrowDownWideNarrow, RotateCcw } from "lucide-react";
import { displayDate } from "../lib/dates";
import {
  coveragePriority,
  coverageRangeError,
  emptyCoverageOptions,
  type CoverageFilter,
  type CoverageOptions,
} from "../lib/territoryCoverage";
import "./TerritoryCoverage.css";

export function CoverageDate({
  date,
  today,
}: {
  date: string | null;
  today: string;
}) {
  const priority = coveragePriority(date, today);
  return (
    <span className={`coverage-date coverage-${priority.color}`}>
      <span className="coverage-date-value">
        <i aria-hidden="true" />
        {date ? displayDate(date) : "Sin registro"}
      </span>
      <small>{date ? priority.label : "Sin finalizaciones registradas"}</small>
    </span>
  );
}

export default function TerritoryCoverage({
  options,
  onChange,
  today,
}: {
  options: CoverageOptions;
  onChange: (options: CoverageOptions) => void;
  today: string;
}) {
  const error = coverageRangeError(options.from, options.to);
  const filtered = options.from || options.to || options.color !== "all";
  return (
    <div className="coverage-controls">
      <div
        className="coverage-toolbar"
        role="group"
        aria-label="Filtrar última vez predicado"
      >
        <div
          className="coverage-dates"
          role="group"
          aria-label="Rango de última predicación"
        >
          <label>
            Desde
            <input
              type="date"
              aria-label="Última vez predicado desde"
              value={options.from}
              max={options.to || today}
              aria-invalid={!!error}
              aria-describedby={error ? "coverage-range-error" : undefined}
              onInput={(e) =>
                onChange({ ...options, from: e.currentTarget.value })
              }
              onChange={(e) => onChange({ ...options, from: e.target.value })}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              aria-label="Última vez predicado hasta"
              value={options.to}
              min={options.from || undefined}
              max={today}
              aria-invalid={!!error}
              aria-describedby={error ? "coverage-range-error" : undefined}
              onInput={(e) =>
                onChange({ ...options, to: e.currentTarget.value })
              }
              onChange={(e) => onChange({ ...options, to: e.target.value })}
            />
          </label>
        </div>
        <label className="coverage-color-filter">
          Antigüedad
          <select
            aria-label="Filtrar por color de prioridad"
            value={options.color}
            onChange={(e) =>
              onChange({ ...options, color: e.target.value as CoverageFilter })
            }
          >
            <option value="all">Todos los colores</option>
            <option value="red">Rojo · 12 meses o sin registro</option>
            <option value="orange">Anaranjado · 8 a menos de 12 meses</option>
            <option value="yellow">Amarillo · 4 a menos de 8 meses</option>
            <option value="green">Verde · Menos de 4 meses</option>
            <option value="unrecorded">Solo sin registro</option>
          </select>
        </label>
        <button
          type="button"
          className={`secondary coverage-order ${options.priority ? "is-priority" : ""}`}
          aria-pressed={options.priority}
          title={
            options.priority
              ? "Volver al orden por número de territorio"
              : "Rojo, anaranjado, amarillo y verde; más antiguos primero"
          }
          onClick={() => onChange({ ...options, priority: !options.priority })}
        >
          <ArrowDownWideNarrow size={15} />
          Ordenar por prioridad
        </button>
        {filtered && (
          <button
            type="button"
            className="text-button coverage-reset"
            onClick={() =>
              onChange({ ...emptyCoverageOptions, priority: options.priority })
            }
          >
            <RotateCcw size={14} />
            Limpiar fechas y color
          </button>
        )}
      </div>
      {error && (
        <p id="coverage-range-error" className="error" role="alert">
          {error}
        </p>
      )}
      <div
        className="coverage-key"
        aria-label="Leyenda de antigüedad de predicación"
      >
        <span className="coverage-green">
          <i aria-hidden="true" />
          Menos de 4 meses
        </span>
        <span className="coverage-yellow">
          <i aria-hidden="true" />4 a menos de 8 meses
        </span>
        <span className="coverage-orange">
          <i aria-hidden="true" />8 a menos de 12 meses
        </span>
        <span className="coverage-red">
          <i aria-hidden="true" />
          12 meses o sin registro
        </span>
      </div>
      <p className="coverage-help">
        Última vez predicado: última finalización registrada.{" "}
        {options.priority
          ? "Orden por prioridad y fecha más antigua."
          : "Orden por número de territorio."}
      </p>
    </div>
  );
}
