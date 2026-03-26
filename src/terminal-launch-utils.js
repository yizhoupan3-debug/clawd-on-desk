/**
 * Resolve the best per-session terminal action.
 *
 * @param {{
 *   id: string,
 *   state: string,
 *   updatedAt: number,
 *   sourcePid?: number | null,
 *   cwd?: string | null,
 *   editor?: string | null,
 *   pidChain?: Array<number> | null
 * }} session
 * @param {(pid: number) => boolean} isProcessAlive
 * @returns {{
 *   type: "focus-session",
 *   sessionId: string,
 *   sourcePid: number,
 *   cwd: string,
 *   editor: string | null,
 *   pidChain: Array<number> | null
 * } | {
 *   type: "open-workspace",
 *   cwd: string
 * } | null}
 */
function resolveSessionTerminalAction(session, isProcessAlive) {
  if (session.sourcePid && isProcessAlive(session.sourcePid)) {
    return {
      type: "focus-session",
      sessionId: session.id,
      sourcePid: session.sourcePid,
      cwd: session.cwd || "",
      editor: session.editor || null,
      pidChain: Array.isArray(session.pidChain) ? session.pidChain : null,
    };
  }

  if (session.cwd) {
    return {
      type: "open-workspace",
      cwd: session.cwd,
    };
  }

  return null;
}

/**
 * Choose the best terminal action for a top-level click.
 *
 * @param {{
 *   sessionEntries: Iterable<[string, {
 *     state: string,
 *     updatedAt: number,
 *     sourcePid?: number | null,
 *     cwd?: string | null,
 *     editor?: string | null,
 *     pidChain?: Array<number> | null
 *   }]>,
 *   focusedSessionId?: string | null,
 *   activeWorkspaceRoots?: string[],
 *   savedWorkspaceRoots?: string[],
 *   statePriority: Record<string, number>,
 *   isProcessAlive: (pid: number) => boolean
 * }} input
 * @returns {{
 *   type: "focus-session",
 *   sessionId: string,
 *   sourcePid: number,
 *   cwd: string,
 *   editor: string | null,
 *   pidChain: Array<number> | null
 * } | {
 *   type: "open-workspace",
 *   cwd: string
 * } | null}
 */
function resolveTerminalAction(input) {
  const {
    sessionEntries,
    focusedSessionId = null,
    activeWorkspaceRoots = [],
    savedWorkspaceRoots = [],
    statePriority,
    isProcessAlive,
  } = input;

  let bestAction = null;
  let bestPriority = -1;
  let bestUpdatedAt = -1;
  let focusedWorkspaceCwd = null;
  let mostRecentWorkspaceCwd = null;
  let mostRecentWorkspaceUpdatedAt = -1;

  for (const [sessionId, session] of sessionEntries) {
    if (focusedSessionId && sessionId === focusedSessionId && session.cwd) {
      focusedWorkspaceCwd = session.cwd;
    }

    if (session.cwd && session.updatedAt > mostRecentWorkspaceUpdatedAt) {
      mostRecentWorkspaceUpdatedAt = session.updatedAt;
      mostRecentWorkspaceCwd = session.cwd;
    }

    const action = resolveSessionTerminalAction({
      id: sessionId,
      ...session,
    }, isProcessAlive);

    if (!action || action.type !== "focus-session") continue;

    const priority = statePriority[session.state] || 0;
    if (priority > bestPriority || (priority === bestPriority && session.updatedAt > bestUpdatedAt)) {
      bestAction = action;
      bestPriority = priority;
      bestUpdatedAt = session.updatedAt;
    }
  }

  if (bestAction) {
    return bestAction;
  }

  const fallbackCwd = focusedWorkspaceCwd
    || activeWorkspaceRoots.find(Boolean)
    || mostRecentWorkspaceCwd
    || savedWorkspaceRoots.find(Boolean);

  if (!fallbackCwd) {
    return null;
  }

  return {
    type: "open-workspace",
    cwd: fallbackCwd,
  };
}

module.exports = {
  resolveSessionTerminalAction,
  resolveTerminalAction,
};
