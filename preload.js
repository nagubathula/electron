const { contextBridge, ipcRenderer } = require('electron');

// Expose a secure API to the renderer process (your webpage)
contextBridge.exposeInMainWorld('api', {
  // --- Navigation ---
  navigateToDashboard: () => ipcRenderer.send('navigate:toDashboard'),
  navigateToLogin: () => ipcRenderer.send('navigate:toLogin'),

  // --- Supabase API (from Renderer to Main) ---
  login: (email, password) => ipcRenderer.invoke('supabase:login', email, password),
  getPendingOrders: () => ipcRenderer.invoke('supabase:getPendingOrders'),
  getSession: () => ipcRenderer.invoke('supabase:getSession'),

  // --- Printer API (from Renderer to Main) ---
  getPrinters: () => ipcRenderer.invoke('printer:getPrinters'),
  getSavedPrinterName: () => ipcRenderer.invoke('printer:getSavedName'),
  savePrinterSetting: (printerName) => ipcRenderer.invoke('printer:saveSetting', printerName),
  
  // --- Passes the HTML string to the main process ---
  silentPrintOrder: (orderHtmlContent, orderId) => ipcRenderer.invoke('printer:silentPrintOrder', orderHtmlContent, orderId),

  // --- Event listeners (from Main to Renderer) ---
  onNewOrder: (callback) => {
    ipcRenderer.removeAllListeners('supabase:newOrder');
    ipcRenderer.on('supabase:newOrder', (event, order) => {
      callback(order);
    });
  },
});