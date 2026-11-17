// Keep the existing length requirement; the same character sets are configured in Auth.
export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

export function passwordRequirements(password: string) {
  return [
    {
      id: "length",
      label: `Al menos ${MIN_PASSWORD_LENGTH} caracteres`,
      met: [...password].length >= MIN_PASSWORD_LENGTH,
    },
    {
      id: "uppercase",
      label: "Una letra mayúscula (A–Z)",
      met: /[A-Z]/.test(password),
    },
    {
      id: "lowercase",
      label: "Una letra minúscula (a–z)",
      met: /[a-z]/.test(password),
    },
    { id: "number", label: "Un número (0–9)", met: /[0-9]/.test(password) },
    {
      id: "symbol",
      label: "Un carácter especial, como @, # o %",
      met: [...PASSWORD_SYMBOLS].some((symbol) => password.includes(symbol)),
    },
  ];
}

export function validPassword(password: string) {
  return passwordRequirements(password).every((requirement) => requirement.met);
}

export function validateNewPassword(password: string, confirmation: string) {
  if (!validPassword(password))
    throw new Error(
      "La contraseña debe cumplir todos los requisitos indicados.",
    );
  if (password !== confirmation)
    throw new Error("Las contraseñas no coinciden.");
}
