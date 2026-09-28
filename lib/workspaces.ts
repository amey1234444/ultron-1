/**
 * Workspace identity, in the shared tree.
 *
 * The server owns everything about workspaces except this: which one is the
 * original. The console needs that too — to know whether it is looking at the
 * workspace the SSE demo hardware belongs to — and the shared tree cannot
 * import from `src/`, so the constant lives here and the server imports it
 * rather than the other way round.
 */

/** The workspace every account belonged to before workspaces existed. */
export const DEFAULT_WORKSPACE_ID = 'default';

/** Whether an account's workspace is the original shared one. */
export function isDefaultWorkspace(workspaceId: string | null | undefined): boolean {
  return (workspaceId ?? DEFAULT_WORKSPACE_ID) === DEFAULT_WORKSPACE_ID;
}

