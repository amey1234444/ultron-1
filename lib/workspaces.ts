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

/**
 * The demo account's workspace.
 *
 * Kept beside the default because the same question gets asked about it: the
 * console needs to know whether it is looking at the workspace the built-in
 * oilseed plant belongs to. The id is the fallback in `src/server/users.ts`
 * for `SOYA_SUPER_ADMIN_WORKSPACE_ID`, and the two have to agree — a
 * deployment that overrides that variable also overrides this, which
 * `check:soya-admin` is where it would be noticed.
 */
export const SOYA_DEMO_WORKSPACE_ID = 'soya';

/** Whether an account's workspace is the one the built-in plant is shown in. */
export function isSoyaDemoWorkspace(workspaceId: string | null | undefined): boolean {
  return (workspaceId ?? '') === SOYA_DEMO_WORKSPACE_ID;
}
