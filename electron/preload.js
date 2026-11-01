const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  printReceiptSilent: (plainText, deviceName) =>
    ipcRenderer.invoke("print-receipt", plainText, deviceName || null),
  listPrinters: () => ipcRenderer.invoke("list-printers"),
  printRawNetwork: (host, port, plainText) =>
    ipcRenderer.invoke("print-raw-network", { host, port, plainText }),
});
