const STATIC_ACTIVE_UPDATED_AT = 2;
const STATIC_RECENT_UPDATED_AT = 1;
const UNASSIGNED_WORKSPACE_KEY = "__clawd_unassigned__";

/**
 * Normalize one workspace root for sessions UI grouping.
 *
 * @param {string | null | undefined} cwd - Candidate workspace root.
 * @returns {{ cwd: string | null, workspaceKey: string }} Normalized workspace identity.
 */
function normalizeWorkspaceDescriptor(cwd) {
  const normalizedCwd = typeof cwd === "string" && cwd.trim() ? cwd : null;
  return {
    cwd: normalizedCwd,
    workspaceKey: normalizedCwd || UNASSIGNED_WORKSPACE_KEY,
  };
}

/**
 * Build a compact render signature for one task view.
 *
 * @param {object | null | undefined} view - Workspace task view.
 * @returns {string} Stable render signature.
 */
function getWorkspaceTaskViewRenderKey(view) {
  if (!view || typeof view !== "object") return "";
  if (typeof view.renderKey === "string" && view.renderKey) return view.renderKey;
  return JSON.stringify(view);
}

/**
 * Build the payload consumed by the sessions window renderer.
 *
 * @param {{
 *   sessionEntries: Iterable<[string, {
 *     state: string,
 *     updatedAt: number,
 *     sourcePid?: number | null,
 *     cwd?: string | null,
 *     editor?: string | null,
 *     pidChain?: Array<number> | null,
 *     agentId?: string | null,
 *     lastEvent?: string | null
 *   }]>,
 *   activeWorkspaceRoots: string[],
 *   savedWorkspaceRoots: string[],
 *   focusedSessionId: string | null,
 *   workspaceTaskViews?: Record<string, object>
 * }} input
 * @returns {{ entries: Array<object>, focusedSessionId: string | null, workspaceTaskViews: Record<string, object> }}
 */
function buildSessionsWindowPayload(input) {
  const {
    sessionEntries,
    activeWorkspaceRoots,
    savedWorkspaceRoots,
    focusedSessionId,
    workspaceTaskViews = {},
  } = input;

  const entries = [];
  const seenCwds = new Set();
  const activeRoots = new Set(activeWorkspaceRoots);
  let focusedCwd = null;

  for (const [id, session] of sessionEntries) {
    if (id === focusedSessionId) {
      focusedCwd = session.cwd || null;
      break;
    }
  }

  for (const [id, session] of sessionEntries) {
    const workspace = normalizeWorkspaceDescriptor(session.cwd);
    entries.push({
      id,
      state: session.state,
      updatedAt: session.updatedAt,
      sourcePid: session.sourcePid,
      cwd: workspace.cwd,
      workspaceKey: workspace.workspaceKey,
      editor: session.editor,
      pidChain: session.pidChain,
      agentId: session.agentId || "claude",
      lastEvent: session.lastEvent,
      isFocused: focusedSessionId === id,
      isActive: !!workspace.cwd && (activeRoots.has(workspace.cwd) || (!!focusedCwd && workspace.cwd === focusedCwd)),
    });

    if (workspace.cwd) {
      seenCwds.add(workspace.cwd);
    }
  }

  for (const root of activeWorkspaceRoots) {
    if (seenCwds.has(root)) continue;
    const workspace = normalizeWorkspaceDescriptor(root);

    entries.push({
      id: `static:active:${root}`,
      state: "idle",
      updatedAt: STATIC_ACTIVE_UPDATED_AT,
      cwd: workspace.cwd,
      workspaceKey: workspace.workspaceKey,
      isStatic: true,
      isActive: true,
    });
    seenCwds.add(root);
  }

  for (const root of savedWorkspaceRoots) {
    if (seenCwds.has(root)) continue;
    const workspace = normalizeWorkspaceDescriptor(root);

    entries.push({
      id: `static:recent:${root}`,
      state: "idle",
      updatedAt: STATIC_RECENT_UPDATED_AT,
      cwd: workspace.cwd,
      workspaceKey: workspace.workspaceKey,
      isStatic: true,
    });
    seenCwds.add(root);
  }

  return {
    entries,
    focusedSessionId,
    workspaceTaskViews,
  };
}

/**
 * Serialize the sessions payload to skip duplicate renderer updates.
 *
 * @param {{entries: Array<object>, focusedSessionId: string | null, workspaceTaskViews?: Record<string, object>}} payload
 * @returns {string}
 */
function serializeSessionsWindowPayload(payload) {
  return [
    payload.focusedSessionId || "",
    ...payload.entries.map((entry) => [
        entry.id,
        entry.state,
        entry.updatedAt,
        entry.cwd,
        entry.workspaceKey || "",
        entry.agentId || "",
        entry.lastEvent || "",
        entry.isStatic ? 1 : 0,
      entry.isActive ? 1 : 0,
      entry.isFocused ? 1 : 0,
    ].join("~")),
    JSON.stringify(
      Object.entries(payload.workspaceTaskViews || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([cwd, view]) => [cwd, getWorkspaceTaskViewRenderKey(view)])
    ),
  ].join("||");
}

module.exports = {
  STATIC_ACTIVE_UPDATED_AT,
  STATIC_RECENT_UPDATED_AT,
  UNASSIGNED_WORKSPACE_KEY,
  buildSessionsWindowPayload,
  getWorkspaceTaskViewRenderKey,
  normalizeWorkspaceDescriptor,
  serializeSessionsWindowPayload,
};
