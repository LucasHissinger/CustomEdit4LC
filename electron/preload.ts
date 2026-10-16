/* eslint-disable @typescript-eslint/no-explicit-any */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  downloadMedia: (url: string) => ipcRenderer.invoke('download-media', url),
  exportMedia: (options: any) => ipcRenderer.invoke('export-media', options),
  quitApp: () => ipcRenderer.invoke('quit-app'), // 👈 NOUVEAU
  getExportPath: (originalName: string, ext: string) => ipcRenderer.invoke('get-export-path', originalName, ext),
  copyFileToClipboard: (filePath: string) => ipcRenderer.invoke('copy-file-to-clipboard', filePath),
  onExportProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on('export-progress', (_, percent) => callback(percent));
  },
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('show-item-in-folder', filePath),
});