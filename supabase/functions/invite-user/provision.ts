export interface InvitationTarget {
  id: string;
  version: number;
}
export class InvitationFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Reusing local access never invokes an Auth invitation or password operation.
export async function provisionTerritoriesAccess(deps: {
  lookup: () => Promise<InvitationTarget | null>;
  invite: () => Promise<InvitationTarget>;
  save: (target: InvitationTarget, reused: boolean) => Promise<void>;
}) {
  const previous = await deps.lookup();
  const target = previous ?? (await deps.invite());
  await deps.save(target, previous !== null);
  return { invited: previous === null, reused: previous !== null };
}
