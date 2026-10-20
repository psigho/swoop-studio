"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Keep Node and raw IPC out of the page. Every privileged action has one named API.
contextBridge.exposeInMainWorld(
  "swoop",
  Object.freeze({
    getSources: () => ipcRenderer.invoke("swoop:get-sources"),
    selectSource: (id) => ipcRenderer.invoke("swoop:select-source", id),
    startPointerCapture: (id) => ipcRenderer.invoke("swoop:pointer-start", id),
    pausePointerCapture: (paused) =>
      ipcRenderer.invoke("swoop:pointer-pause", paused),
    stopPointerCapture: () => ipcRenderer.invoke("swoop:pointer-stop"),
    saveVideo: (options) => ipcRenderer.invoke("swoop:save-video", options),
    saveProject: (data) => ipcRenderer.invoke("swoop:save-project", data),
    openProject: () => ipcRenderer.invoke("swoop:open-project"),
    beginTake: (details) => ipcRenderer.invoke("swoop:take-begin", details),
    appendTakeChunk: (id, bytes) => ipcRenderer.invoke("swoop:take-append", id, bytes),
    completeTake: (id, details) => ipcRenderer.invoke("swoop:take-complete", id, details),
    interruptTake: (id) => ipcRenderer.invoke("swoop:take-interrupt", id),
    listTakes: () => ipcRenderer.invoke("swoop:take-list"),
    openTake: (id) => ipcRenderer.invoke("swoop:take-open", id),
    showTakesFolder: () => ipcRenderer.invoke("swoop:take-show-folder"),
    getAppInfo: () => ipcRenderer.invoke("swoop:app-info"),
    minimize: () => ipcRenderer.invoke("swoop:window", "minimize"),
    maximize: () => ipcRenderer.invoke("swoop:window", "maximize"),
    close: () => ipcRenderer.invoke("swoop:window", "close"),
    onExportProgress: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("A progress callback is required.");
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on("swoop:export-progress", listener);
      return () =>
        ipcRenderer.removeListener("swoop:export-progress", listener);
    },
  }),
);
