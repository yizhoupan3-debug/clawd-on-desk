const { contextBridge, ipcRenderer } = require("electron");
const { formatCompactRelativeTime } = require("./relative-time");

contextBridge.exposeInMainWorld("sessionsAPI", {
  onSessionsUpdate: (cb) => ipcRenderer.on("sessions-update", (_, sessions) => cb(sessions)),
  closeWorkspace: (cwd) => ipcRenderer.send("close-workspace", cwd),
  newThread: (cwd) => ipcRenderer.send("new-thread", cwd),
  focusThread: (sessionId) => ipcRenderer.send("focus-thread", sessionId),
  closeThread: (sessionId) => ipcRenderer.send("close-thread", sessionId),
  hideSessions: () => ipcRenderer.send("hide-sessions"),
  formatRelativeTime: (value) => formatCompactRelativeTime(value),
  listWorkspaceEntries: (options) => ipcRenderer.invoke("workspace-tree:list", options),
  createWorkspaceEntry: (options) => ipcRenderer.invoke("workspace-tree:create", options),
  renameWorkspaceEntry: (options) => ipcRenderer.invoke("workspace-tree:rename", options),
  deleteWorkspaceEntry: (options) => ipcRenderer.invoke("workspace-tree:delete", options),
  setWorkspaceClipboard: (options) => ipcRenderer.invoke("workspace-tree:clipboard:set", options),
  getWorkspaceClipboard: () => ipcRenderer.invoke("workspace-tree:clipboard:get"),
  pasteWorkspaceClipboard: (options) => ipcRenderer.invoke("workspace-tree:clipboard:paste", options),
  copyWorkspacePath: (options) => ipcRenderer.invoke("workspace-tree:path:copy", options),
});
