import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PasswordRequirements from "../src/components/PasswordRequirements";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_SYMBOLS,
  passwordRequirements,
  validPassword,
  validateNewPassword,
} from "../src/lib/passwordPolicy";

describe("Requisitos de contraseña nueva", () => {
  it.each([
    ["", "length"],
    ["Aa1@aa", "length"],
    ["Aa1@aaa", "length"],
    ["minuscula12@", "uppercase"],
    ["MAYUSCULA12@", "lowercase"],
    ["SinNumeros@@@", "number"],
    ["SinSimbolos12", "symbol"],
    ["Espacios123  ", "symbol"],
    ["Emoji123abc😀😀", "symbol"],
  ])("rechaza el caso sintético %j", (value, missing) => {
    expect(validPassword(value)).toBe(false);
    expect(passwordRequirements(value).find((r) => r.id === missing)?.met).toBe(
      false,
    );
    expect(() => validateNewPassword(value, value)).toThrow(/requisitos/);
  });
  it("acepta el límite exacto y contraseñas largas sin alterar espacios ni caracteres", () => {
    const value = "Aa1@abcdefgh";
    expect(value.length).toBe(MIN_PASSWORD_LENGTH);
    expect(validPassword(value)).toBe(true);
    expect(() => validateNewPassword(value, value)).not.toThrow();
    expect(validPassword(value + " ñ Espacio".repeat(5))).toBe(true);
  });
  it("acepta todos los símbolos que reconoce la política del proveedor", () => {
    for (const symbol of PASSWORD_SYMBOLS)
      expect(validPassword("Mayuscula123" + symbol)).toBe(true);
  });
  it("la confirmación debe ser idéntica, incluidos espacios y mayúsculas", () => {
    expect(() => validateNewPassword("Aa1@abcdefgh", "Aa1@abcdefgH")).toThrow(
      /no coinciden/,
    );
    expect(() => validateNewPassword("Aa1@abcdefgh", "Aa1@abcdefgh ")).toThrow(
      /no coinciden/,
    );
  });
  it("muestra los cinco requisitos y su cumplimiento en la interfaz", () => {
    const pending = renderToStaticMarkup(
      createElement(PasswordRequirements, { password: "" }),
    );
    const valid = renderToStaticMarkup(
      createElement(PasswordRequirements, { password: "Aa1@abcdefgh" }),
    );
    expect(pending.match(/data-met="false"/g)).toHaveLength(5);
    expect(valid.match(/data-met="true"/g)).toHaveLength(5);
    expect(valid).toContain("Al menos 12 caracteres");
    expect(valid).toContain("Un carácter especial");
  });
});
