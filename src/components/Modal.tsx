import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export default function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const h = (event: Event) => {
      event.preventDefault();
      close.current();
    };
    d.addEventListener("cancel", h);
    return () => {
      d.removeEventListener("cancel", h);
      d.close();
    };
  }, []);
  return (
    <dialog ref={ref} className="modal">
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="icon"
          aria-label="Cerrar ventana"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
