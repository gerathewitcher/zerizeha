const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ptt: {
    setEnabled: (enabled) => ipcRenderer.invoke("ptt:set-enabled", enabled),
    setKey: (code) => ipcRenderer.invoke("ptt:set-key", code),
    onState: (callback) => {
      const handler = (_event, active) => callback(Boolean(active));
      ipcRenderer.on("ptt:state", handler);
      return () => ipcRenderer.removeListener("ptt:state", handler);
    },
  },
  desktop: {
    getSources: () => ipcRenderer.invoke("desktop-capturer:get-sources"),
  },
  window: {
    setFullscreen: (enabled) => ipcRenderer.invoke("window:set-fullscreen", enabled),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  },
});
