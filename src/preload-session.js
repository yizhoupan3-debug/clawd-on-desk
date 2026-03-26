const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sessionAPI", {
  onUpdate: (callback) => ipcRenderer.on("menu-update", (event, data) => callback(data)),
  selectSession: (id) => ipcRenderer.send("select-session", id),
  newThread: (id) => ipcRenderer.send("new-thread", id),
  reportHeight: (h) => ipcRenderer.send("report-session-height", h),
});
