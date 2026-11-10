import { ChevronLeft, ChevronRight } from "lucide-react";
export default function DataPager({
  total,
  page,
  size,
  onPage,
  onSize,
}: {
  total: number;
  page: number;
  size: number;
  onPage: (n: number) => void;
  onSize: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size)),
    current = Math.min(page, pages);
  const numbers = Array.from(
    { length: Math.min(5, pages) },
    (_, i) => Math.min(Math.max(1, current - 2), Math.max(1, pages - 4)) + i,
  );
  return (
    <div className="data-pager">
      <span>Total {total} registros</span>
      <div>
        <button
          className="icon"
          aria-label="Página anterior"
          disabled={current <= 1}
          onClick={() => onPage(current - 1)}
        >
          <ChevronLeft size={15} />
        </button>
        {numbers.map((n) => (
          <button
            key={n}
            aria-label={`Página ${n}`}
            aria-current={current === n ? "page" : undefined}
            className={current === n ? "page-current" : ""}
            onClick={() => onPage(n)}
          >
            {n}
          </button>
        ))}
        <button
          className="icon"
          aria-label="Página siguiente"
          disabled={current >= pages}
          onClick={() => onPage(current + 1)}
        >
          <ChevronRight size={15} />
        </button>
        <select
          aria-label="Registros por página"
          value={size}
          onChange={(e) => {
            onSize(+e.target.value);
            onPage(1);
          }}
        >
          {[10, 20, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
