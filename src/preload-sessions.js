const { contextBridge, ipcRenderer } = require("electron");
const { formatCompactRelativeTime } = require("./relative-time");

/**
 * Invoke a workspace-tree IPC channel from the renderer bridge.
 *
 * @param {string} channel - IPC channel name.
 * @param {object} [options] - Payload forwarded to the main process.
 * @returns {Promise<any>} IPC result payload.
 */
function invokeWorkspaceTree(channel, options) {
  return ipcRenderer.invoke(channel, options);
}

/**
 * Read one workspace document through the main-process bridge.
 *
 * @param {object} options - Workspace root and relative file path.
 * @returns {Promise<object>} Document payload for the renderer.
 */
function readWorkspaceDocument(options) {
  return invokeWorkspaceTree("workspace-file:read", options);
}

/**
 * Save one editable workspace document through the main-process bridge.
 *
 * @param {object} options - Workspace root, relative file path, and content.
 * @returns {Promise<object>} Save result summary.
 */
function writeWorkspaceDocument(options) {
  return invokeWorkspaceTree("workspace-file:write", options);
}

/**
 * Compile one TeX document through the main-process bridge.
 *
 * @param {object} options - Workspace root and relative TeX file path.
 * @returns {Promise<object>} Compile result payload.
 */
function compileWorkspaceTexDocument(options) {
  return invokeWorkspaceTree("workspace-file:tex:compile", options);
}

contextBridge.exposeInMainWorld("sessionsAPI", {
  onSessionsUpdate: (cb) => ipcRenderer.on("sessions-update", (_, sessions) => cb(sessions)),
  closeWorkspace: (cwd) => ipcRenderer.send("close-workspace", cwd),
  newThread: (cwd) => ipcRenderer.send("new-thread", cwd),
  focusThread: (sessionId) => ipcRenderer.send("focus-thread", sessionId),
  closeThread: (sessionId) => ipcRenderer.send("close-thread", sessionId),
  hideSessions: () => ipcRenderer.send("hide-sessions"),
  formatRelativeTime: (value) => formatCompactRelativeTime(value),
  listWorkspaceEntries: (options) => invokeWorkspaceTree("workspace-tree:list", options),
  createWorkspaceEntry: (options) => invokeWorkspaceTree("workspace-tree:create", options),
  renameWorkspaceEntry: (options) => invokeWorkspaceTree("workspace-tree:rename", options),
  deleteWorkspaceEntry: (options) => invokeWorkspaceTree("workspace-tree:delete", options),
  setWorkspaceClipboard: (options) => invokeWorkspaceTree("workspace-tree:clipboard:set", options),
  getWorkspaceClipboard: () => invokeWorkspaceTree("workspace-tree:clipboard:get"),
  pasteWorkspaceClipboard: (options) => invokeWorkspaceTree("workspace-tree:clipboard:paste", options),
  copyWorkspacePath: (options) => invokeWorkspaceTree("workspace-tree:path:copy", options),
  openWorkspaceEntry: (options) => invokeWorkspaceTree("workspace-tree:open", options),
  copyWorkspaceRelativePath: (options) => invokeWorkspaceTree("workspace-tree:path:copy", { ...options, format: "relative" }),
  copyWorkspaceAbsolutePath: (options) => invokeWorkspaceTree("workspace-tree:path:copy", { ...options, format: "absolute" }),
  cutWorkspaceEntry: (options) => invokeWorkspaceTree("workspace-tree:clipboard:set", { ...options, mode: "cut" }),
  copyWorkspaceEntry: (options) => invokeWorkspaceTree("workspace-tree:clipboard:set", { ...options, mode: "copy" }),
  readWorkspaceDocument,
  writeWorkspaceDocument,
  compileWorkspaceTexDocument,
});
