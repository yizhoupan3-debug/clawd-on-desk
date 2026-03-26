const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  showContextMenu: () => ipcRenderer.send("show-context-menu"),
  moveWindowTo: (targetX, targetY) => ipcRenderer.send("move-window-to", targetX, targetY),
  onStateChange: (callback) => ipcRenderer.on("state-change", (_, state, svg) => callback(state, svg)),
  onEyeMove: (callback) => ipcRenderer.on("eye-move", (_, dx, dy) => callback(dx, dy)),
  onWakeFromDoze: (callback) => ipcRenderer.on("wake-from-doze", () => callback()),
  pauseCursorPolling: () => ipcRenderer.send("pause-cursor-polling"),
  resumeFromReaction: () => ipcRenderer.send("resume-from-reaction"),
  onDndChange: (callback) => ipcRenderer.on("dnd-change", (_, enabled) => callback(enabled)),
  onThemeChange: (callback) => ipcRenderer.on("theme-change", (_, color) => callback(color)),
  dragLock: (locked) => ipcRenderer.send("drag-lock", locked),
  onMiniModeChange: (cb) => ipcRenderer.on("mini-mode-change", (_, enabled) => cb(enabled)),
  exitMiniMode: () => ipcRenderer.send("exit-mini-mode"),
  dragEnd: () => ipcRenderer.send("drag-end"),
  focusTerminal: () => ipcRenderer.send("focus-terminal"),
  showSessionMenu: () => ipcRenderer.send("show-session-menu"),
});
