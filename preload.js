const { contextBridge, ipcRenderer } = require('electron');

// Expose a secure API to the renderer process (your webpage)
contextBridge.exposeInMainWorld('api', {
  // --- Supabase API (from Renderer to Main) ---
  login: (email, password) => ipcRenderer.invoke('supabase:login', email, password),
  logout: () => ipcRenderer.invoke('supabase:logout'), // NEW: Logout function
  getPendingOrders: () => ipcRenderer.invoke('supabase:getPendingOrders'),

  // --- Printer API (from Renderer to Main) ---
  getPrinters: () => ipcRenderer.invoke('printer:getPrinters'),
  getSavedPrinterName: () => ipcRenderer.invoke('printer:getSavedName'),
  savePrinterSetting: (config) => ipcRenderer.invoke('printer:saveSetting', config), 
  silentPrintOrder: (orderHtmlContent, orderId) => ipcRenderer.invoke('printer:silentPrintOrder', orderHtmlContent, orderId),
  getPdfSavePath: () => ipcRenderer.invoke('printer:getPdfSavePath'), 
  selectDirectory: () => ipcRenderer.invoke('app:selectDirectory'), 

  // --- Event listeners (from Main to Renderer) ---
  onNewOrder: (callback) => {
    ipcRenderer.removeAllListeners('supabase:newOrder');
    ipcRenderer.on('supabase:newOrder', (event, order) => {
      callback(order);
    });
  },
  // NEW: Listener for session restoration on startup
  onSessionRestored: (callback) => {
    ipcRenderer.removeAllListeners('supabase:sessionRestored');
    ipcRenderer.on('supabase:sessionRestored', (event, user) => {
      callback(user);
    });
  },
});