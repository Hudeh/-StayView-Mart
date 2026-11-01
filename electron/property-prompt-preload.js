const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__submitPropertyCode__", (propertyCode) => {
  ipcRenderer.send("property-code-submitted", propertyCode);
});
