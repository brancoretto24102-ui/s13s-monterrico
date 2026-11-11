import { Check, Circle } from "lucide-react";
import { passwordRequirements } from "../lib/passwordPolicy";

export default function PasswordRequirements({
  password,
}: {
  password: string;
}) {
  return (
    <ul
      id="password-requirements"
      className="password-requirements"
      aria-label="Requisitos de contraseña"
    >
      {passwordRequirements(password).map((requirement) => (
        <li key={requirement.id} data-met={requirement.met}>
          {requirement.met ? (
            <Check size={14} aria-label="Cumplido" />
          ) : (
            <Circle size={12} aria-label="Pendiente" />
          )}
          {requirement.label}
        </li>
      ))}
    </ul>
  );
}
