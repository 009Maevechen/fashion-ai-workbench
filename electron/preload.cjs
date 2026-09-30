/* eslint-disable @typescript-eslint/no-require-imports */
const {contextBridge,ipcRenderer}=require("electron");

contextBridge.exposeInMainWorld("desktop",Object.freeze({
  getAppInfo:()=>ipcRenderer.invoke("desktop:get-app-info"),
  openOutputFolder:()=>ipcRenderer.invoke("desktop:open-output-folder"),
  openDataFolder:()=>ipcRenderer.invoke("desktop:open-data-folder"),
  openLogFolder:()=>ipcRenderer.invoke("desktop:open-log-folder"),
  copyImage:value=>ipcRenderer.invoke("desktop:copy-image",value),
  openProductSystemLogin:(systemId)=>ipcRenderer.invoke("desktop:product-system-login",systemId),
  lookupProduct:(sku)=>ipcRenderer.invoke("desktop:product-system-lookup",sku),
}));
