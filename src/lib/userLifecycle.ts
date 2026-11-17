interface Account {
  id: string;
  email?: string | null;
  username?: string | null;
  deleted_at?: string | null;
}
export const normalizedAlias = (alias: string | null | undefined) =>
  alias?.trim().toLowerCase() || null;
export function aliasOccupied(
  users: readonly Account[],
  alias: string | null | undefined,
  exceptId?: string,
) {
  const name = normalizedAlias(alias);
  return (
    !!name &&
    users.some(
      (u) =>
        u.id !== exceptId &&
        !u.deleted_at &&
        normalizedAlias(u.username) === name,
    )
  );
}
export function deletedAccountForEmail<T extends Account>(
  users: readonly T[],
  email: string,
) {
  const previous = users.find(
    (u) => u.email?.trim().toLowerCase() === email.trim().toLowerCase(),
  );
  if (previous && !previous.deleted_at)
    throw new Error(
      "El correo ya tiene un acceso de Territorios. Búscalo en Usuarios para editarlo o activarlo.",
    );
  return previous;
}
export function restoredAlias(users: readonly Account[], account: Account) {
  return aliasOccupied(users, account.username, account.id)
    ? null
    : normalizedAlias(account.username);
}
