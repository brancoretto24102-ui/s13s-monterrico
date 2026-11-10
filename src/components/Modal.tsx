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
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const h = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    d.addEventListener("cancel", h);
    return () => {
      d.removeEventListener("cancel", h);
      d.close();
    };
  }, [onClose]);
  return (
    <dialog ref={ref} className="modal">
      <header>
        <h2>{title}</h2>
        <button className="icon" aria-label="Cerrar ventana" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
