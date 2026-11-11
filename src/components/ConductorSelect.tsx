import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { assignableConductors, conductorCode } from "../lib/conductors";
import type { Conductor } from "../lib/types";
import "./ConductorSelect.css";

export default function ConductorSelect({
  conductors,
  value,
  disabled,
  onChange,
}: {
  conductors: Conductor[];
  value: string;
  disabled: boolean;
  onChange: (personId: string, name: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(-1);
  const [placement, setPlacement] = useState({ above: false, height: 240 });
  const available = useMemo(
    () => assignableConductors(conductors),
    [conductors],
  );
  const options = useMemo(
    () => assignableConductors(conductors, query ?? ""),
    [conductors, query],
  );
  const selected = available.find((c) => c.person_id === value);
  const expanded = open && !disabled;
  const active = highlight >= 0 && highlight < options.length ? highlight : -1;
  const choose = (conductor: Conductor) => {
    onChange(conductor.person_id, conductor.display_name);
    setQuery(null);
    setOpen(false);
  };
  const show = () => {
    setHighlight(
      Math.max(
        0,
        options.findIndex((c) => c.person_id === value),
      ),
    );
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!expanded) return;
    const measure = () => {
      const element = root.current;
      if (!element) return;
      const box = element.getBoundingClientRect();
      const dialog = element.closest("dialog")?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = Math.max(dialog?.top ?? 0, viewport?.offsetTop ?? 0) + 10;
      const bottom =
        Math.min(
          dialog?.bottom ?? window.innerHeight,
          (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
        ) - 10;
      const below = Math.max(0, bottom - box.bottom - 4);
      const above = Math.max(0, box.top - top - 4);
      const useAbove = below < 160 && above > below;
      setPlacement({
        above: useAbove,
        height: Math.min(240, useAbove ? above : below),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [expanded, options.length]);

  useEffect(() => {
    if (expanded && active >= 0) {
      const option = list.current?.children[active] as HTMLElement | undefined;
      if (option && list.current) {
        const menu = list.current;
        if (option.offsetTop < menu.scrollTop)
          menu.scrollTop = option.offsetTop;
        else if (
          option.offsetTop + option.offsetHeight >
          menu.scrollTop + menu.clientHeight
        )
          menu.scrollTop =
            option.offsetTop + option.offsetHeight - menu.clientHeight;
      }
    }
  }, [expanded, active, placement.height]);

  return (
    <div className="conductor-field">
      <label htmlFor={`${id}-input`}>Nombre del conductor</label>
      <div
        ref={root}
        className="conductor-select"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <div className="conductor-select-input">
          <Search size={15} aria-hidden="true" />
          <input
            ref={input}
            id={`${id}-input`}
            role="combobox"
            aria-required="true"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? `${id}-list` : undefined}
            aria-activedescendant={
              expanded && active >= 0 ? `${id}-option-${active}` : undefined
            }
            aria-describedby={`${id}-help`}
            autoComplete="off"
            disabled={disabled || available.length === 0}
            value={query ?? selected?.display_name ?? ""}
            placeholder={
              available.length
                ? "Seleccione o busque un conductor…"
                : "No hay conductores activos"
            }
            onFocus={(e) => e.currentTarget.select()}
            onClick={() => {
              if (!expanded) show();
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              onChange("", "");
              setHighlight(0);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                if (!expanded) show();
                else
                  setHighlight(
                    Math.max(
                      0,
                      Math.min(
                        options.length - 1,
                        active + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
                  );
              } else if (
                expanded &&
                ["Home", "End", "PageDown", "PageUp"].includes(e.key)
              ) {
                e.preventDefault();
                setHighlight(
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? options.length - 1
                      : Math.max(
                          0,
                          Math.min(
                            options.length - 1,
                            active + (e.key === "PageDown" ? 5 : -5),
                          ),
                        ),
                );
              } else if (expanded && e.key === "Enter") {
                e.preventDefault();
                if (active >= 0) choose(options[active]);
              } else if (expanded && e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              } else if (e.key === "Tab") setOpen(false);
            }}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled || !available.length}
            aria-label="Mostrar conductores"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              input.current?.focus();
              if (expanded) setOpen(false);
              else show();
            }}
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>
        {expanded && (
          <div
            className={`conductor-options ${placement.above ? "above" : ""}`}
            style={{ maxHeight: placement.height }}
          >
            <div
              ref={list}
              id={`${id}-list`}
              role="listbox"
              aria-label="Conductores activos"
              className="conductor-options-list"
              style={{ maxHeight: placement.height }}
            >
              {options.map((conductor, index) => (
                <div
                  key={conductor.id}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={conductor.person_id === value}
                  className={`conductor-option ${index === active ? "highlighted" : ""}`}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => choose(conductor)}
                >
                  <span>{conductor.display_name}</span>
                  <small>{conductorCode(conductor.code)}</small>
                  {conductor.person_id === value && (
                    <Check size={15} aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
            {!options.length && (
              <p className="conductor-no-results" role="status">
                Sin resultados. Registre al conductor en el maestro antes de
                asignarlo.
              </p>
            )}
          </div>
        )}
      </div>
      <span id={`${id}-help`} className="conductor-select-help">
        {!available.length
          ? "Cree o active un conductor en Configuración → Maestros → Conductores."
          : value && !selected
            ? "Este conductor ya no está disponible. Seleccione otro del maestro."
            : "Seleccione un conductor activo del maestro. Puede buscar por nombre o código."}
      </span>
    </div>
  );
}
