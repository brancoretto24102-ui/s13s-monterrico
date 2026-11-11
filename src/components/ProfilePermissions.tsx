import { CheckCircle2, ShieldCheck, X } from "lucide-react";
import { TIMING_OVERRIDE_PERMISSION } from "../lib/assignmentTiming";
import { permissionGroups, permissionLabel } from "../lib/permissions";

export default function ProfilePermissions({
  selected,
  onToggle,
}: {
  selected: readonly string[];
  onToggle: (key: string, checked: boolean) => void;
}) {
  // Derive sections from the catalog so new modules cannot disappear from the UI.
  const sections = [...new Set(permissionGroups.map((group) => group.section))];
  return (
    <>
      <section
        className="permission-exception"
        aria-labelledby="timing-access-title"
      >
        <h3 id="timing-access-title">
          <ShieldCheck size={17} /> Excepciones de plazos
        </h3>
        <label className="checkbox">
          <input
            type="checkbox"
            value={TIMING_OVERRIDE_PERMISSION}
            checked={selected.includes(TIMING_OVERRIDE_PERMISSION)}
            onChange={(e) =>
              onToggle(TIMING_OVERRIDE_PERMISSION, e.target.checked)
            }
            aria-describedby="timing-access-help"
          />
          Autorizar excepciones de 14 días y 3 meses
        </label>
        <p id="timing-access-help">
          Permite iniciar antes del descanso de 14 días o cerrar después de los
          3 meses. Cada excepción exige un motivo y queda en las observaciones y
          la auditoría. Selecciona también los permisos para asignar, completar
          o corregir, según corresponda.
        </p>
        <small>
          El administrador ya tiene esta facultad y también debe justificarla.
          En el cronograma, un territorio abierto que superó los 3 meses debe
          cerrarse antes de programarlo.
        </small>
      </section>
      <div className="permission-columns">
        <section className="permission-box">
          <h3>ACCESOS DISPONIBLES</h3>
          <div>
            {sections.map((section) => (
              <details key={section} open>
                <summary>{section}</summary>
                {permissionGroups
                  .filter((group) => group.section === section)
                  .map((group) => (
                    <details key={group.prefix} open>
                      <summary>{group.module}</summary>
                      <div className="permission-actions">
                        {group.actions
                          .filter(
                            ([action]) =>
                              `${group.prefix}.${action}` !==
                              TIMING_OVERRIDE_PERMISSION,
                          )
                          .map(([action, label]) => (
                            <label className="checkbox" key={action}>
                              <input
                                type="checkbox"
                                value={`${group.prefix}.${action}`}
                                checked={selected.includes(
                                  `${group.prefix}.${action}`,
                                )}
                                onChange={(e) =>
                                  onToggle(
                                    `${group.prefix}.${action}`,
                                    e.target.checked,
                                  )
                                }
                              />
                              {label}
                              <small>({action.toUpperCase()})</small>
                            </label>
                          ))}
                      </div>
                    </details>
                  ))}
              </details>
            ))}
          </div>
        </section>
        <section className="permission-box">
          <h3>
            ACCESOS SELECCIONADOS <span>{selected.length}</span>
          </h3>
          <div>
            {!selected.length ? (
              <p className="muted">No hay opciones seleccionadas.</p>
            ) : (
              selected.map((key) => (
                <div className="selected-permission" key={key}>
                  <CheckCircle2 size={13} />
                  <span>{permissionLabel(key)}</span>
                  <button
                    type="button"
                    className="icon"
                    aria-label={`Quitar ${permissionLabel(key)}`}
                    onClick={() => onToggle(key, false)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}
