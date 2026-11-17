import { describe, expect, it, vi } from "vitest";
import { provisionTerritoriesAccess } from "../supabase/functions/invite-user/provision";
import {
  aliasOccupied,
  deletedAccountForEmail,
  restoredAlias,
} from "../src/lib/userLifecycle";

describe("Alta de un acceso eliminado", () => {
  it("conserva la identidad existente y no solicita invitación ni contraseña", async () => {
    const lookup = vi.fn().mockResolvedValue({ id: "existing", version: 7 });
    const invite = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    expect(await provisionTerritoriesAccess({ lookup, invite, save })).toEqual({
      invited: false,
      reused: true,
    });
    expect(invite).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({ id: "existing", version: 7 }, true);
  });
  it("solo invita a identidades nuevas y respeta la versión inicial", async () => {
    const invite = vi.fn().mockResolvedValue({ id: "new", version: 1 });
    const save = vi.fn().mockResolvedValue(undefined);
    expect(
      await provisionTerritoriesAccess({
        lookup: async () => null,
        invite,
        save,
      }),
    ).toEqual({ invited: true, reused: false });
    expect(invite).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({ id: "new", version: 1 }, false);
  });
  it("un conflicto previo no envía correos ni concede acceso", async () => {
    const invite = vi.fn(),
      save = vi.fn();
    await expect(
      provisionTerritoriesAccess({
        lookup: async () => {
          throw new Error("ocupado");
        },
        invite,
        save,
      }),
    ).rejects.toThrow("ocupado");
    expect(invite).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("un cambio concurrente no vuelve a invitar a la identidad compartida", async () => {
    const invite = vi.fn();
    await expect(
      provisionTerritoriesAccess({
        lookup: async () => ({ id: "old", version: 3 }),
        invite,
        save: async () => {
          throw new Error("cambió");
        },
      }),
    ).rejects.toThrow("cambió");
    expect(invite).not.toHaveBeenCalled();
  });
});

describe("Alias y correo en Papelera", () => {
  const removed = {
    id: "old",
    email: "previous@example.invalid",
    username: "Persona",
    deleted_at: "2026-01-01",
  };
  const current = {
    id: "current",
    email: "current@example.invalid",
    username: "PERSONA",
    deleted_at: null,
  };
  it("libera los alias eliminados y conserva la exclusividad entre accesos vigentes", () => {
    expect(aliasOccupied([removed], " persona ")).toBe(false);
    expect(aliasOccupied([removed, current], " persona ")).toBe(true);
    expect(aliasOccupied([removed, current], "persona", "current")).toBe(false);
    expect(aliasOccupied([current], " ")).toBe(false);
  });
  it("restaurar un registro cuyo alias fue reutilizado lo deja sin alias", () => {
    expect(restoredAlias([removed, current], removed)).toBeNull();
    expect(restoredAlias([removed], removed)).toBe("persona");
  });
  it("reconoce el correo eliminado sin crear una segunda identidad", () => {
    expect(
      deletedAccountForEmail([removed], " PREVIOUS@example.invalid "),
    ).toBe(removed);
    expect(
      deletedAccountForEmail([removed], "new@example.invalid"),
    ).toBeUndefined();
    expect(() => deletedAccountForEmail([current], current.email)).toThrow(
      "ya tiene un acceso",
    );
  });
});
