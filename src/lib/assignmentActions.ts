import { can } from "./permissions";
import type { Profile } from "./types";

export type AssignmentActionKind =
  "assign" | "complete" | "correct" | "void" | "observe";

export function requireAssignmentAction(
  profile: Profile | null,
  kind: AssignmentActionKind,
) {
  if (!can(profile, `territories.${kind}`))
    throw new Error("Tu perfil no tiene permiso para realizar esta acción.");
}
