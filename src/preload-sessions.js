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
});
