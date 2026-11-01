import { contextBridge, ipcRenderer } from 'electron'
import { API_CHANNEL, isApiMethod, type BridgeApi } from '../shared/api'

const bridge: BridgeApi = {
  invoke: (method, ...args) => {
    if (!isApiMethod(method)) return Promise.reject(new Error(`Unknown method: ${String(method)}`))
    return ipcRenderer.invoke(API_CHANNEL, method, args)
  }
}

contextBridge.exposeInMainWorld('recallo', bridge)
