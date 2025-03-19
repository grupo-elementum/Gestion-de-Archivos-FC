const { contextBridge, ipcRenderer } = require('electron');

// Exponer funciones seguras al Frontend
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (data) => ipcRenderer.invoke('dialog:saveFile', data),
  getPreview: (filePath) => ipcRenderer.invoke('file:getPreview', filePath),
});
