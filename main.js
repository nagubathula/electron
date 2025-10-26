const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
// --- NEW: Import electron-pos-printer ---
const { PosPrinter } = require("electron-pos-printer");

// --- Configuration Storage Path & Directories ---
const userDataPath = app.getPath('userData');
const configFilePath = path.join(userDataPath, 'printer-config.json');
const billsDir = path.join(userDataPath, 'bills'); // Directory for auto-saved PDFs
let selectedPrinterName = null;

// --- Your Supabase Credentials ---
const supabaseUrl = 'https://vdkpdyjyupqqciojirkg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZka3BkeWp5dXBxcWNpb2ppcmtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwMDI3MDYsImV4cCI6MjA2ODU3ODcwNn0.hw-opTjIs1ZSGXMMmvpHO2FlFfw5ovTRbdqNoutE2T4';

// Initialize the Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

let mainWindow;
let realtimeChannel = null;

// Load configuration on startup
function loadPrinterConfig() {
    try {
        if (fs.existsSync(configFilePath)) {
            const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
            selectedPrinterName = config.printerName || null;
            console.log(`Loaded printer config: ${selectedPrinterName}`);
        }
    } catch (e) {
        console.error('Failed to load printer config:', e);
    }
}

async function createWindow() {
  loadPrinterConfig(); // Load config before creating window

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // --- Check session to decide which page to load ---
  const { data } = await supabase.auth.getSession();

  if (data.session) {
    console.log('Active session found, loading dashboard.');
    mainWindow.loadFile('index.html'); // Load index.html, renderer will handle view
    setupRealtimeChannel(); // Setup realtime as we are logged in
  } else {
    console.log('No session found, loading login page.');
    mainWindow.loadFile('index.html'); // Load index.html, renderer will handle view
  }

  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// --- Reusable Function for Realtime ---
function setupRealtimeChannel() {
  if (realtimeChannel) {
    console.log('Realtime channel already exists. Unsubscribing before creating new one.');
    supabase.removeChannel(realtimeChannel);
  }

  console.log('Setting up new realtime channel for public:orders');
  realtimeChannel = supabase
    .channel('public:orders')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => {
        // Fetch the full order data with items, as payload.new might be minimal
        fetchOrderById(payload.new.id).then(newOrderData => {
          if (newOrderData) {
            mainWindow.webContents.send('supabase:newOrder', newOrderData);
          }
        });
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('Successfully connected to realtime channel!');
      } else if (err) {
        console.error('Realtime connection error:', err);
      }
    });
}

function stopRealtimeChannel() {
  if (realtimeChannel) {
    console.log('Stopping realtime channel.');
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

app.on('window-all-closed', () => {
  stopRealtimeChannel();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// --- NAVIGATION HANDLERS ---
ipcMain.on('navigate:toDashboard', () => {
  console.log('Navigating to Dashboard');
  mainWindow.loadFile('index.html');
});

ipcMain.on('navigate:toLogin', async () => {
  console.log('Navigating to Login');
  await supabase.auth.signOut();
  stopRealtimeChannel();
  mainWindow.loadFile('index.html');
});


// --- Supabase API Handlers ---

ipcMain.handle('supabase:login', async (event, email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    console.error('Login Error:', error.message);
    return { error: error.message };
  }

  setupRealtimeChannel();
  return { user: data.user };
});

ipcMain.handle('supabase:getSession', async () => {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting session:', error.message);
    return { session: null };
  }
 
  if (data.session && !realtimeChannel) {
      console.log('Session found, re-initializing realtime.');
      setupRealtimeChannel();
  }

  return { session: data.session };
});


async function fetchOrderById(orderId) {
    const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single();

    if (error) {
        console.error('Error fetching new order by ID:', error.message);
        return null;
    }
    return data;
}

ipcMain.handle('supabase:getPendingOrders', async () => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending orders:', error.message);
    return { error: error.message };
  }
  return { data };
});

// --- PRINTER HANDLERS (UPDATED) ---

ipcMain.handle('printer:getPrinters', async () => {
    try {
        console.log("Attempting to fetch printers via electron-pos-printer...");
        // --- NEW: Use PosPrinter.getPrinters() ---
        const printers = await PosPrinter.getPrinters();
        
        console.log("--- Found System Printers (pos-printer) ---");
        if (printers && printers.length > 0) {
            printers.forEach((printer, index) => {
                console.log(`  [${index}] Name: ${printer.name}`);
                console.log(`      DeviceName: ${printer.deviceName}`);
            });
        } else {
            console.log("No printers found by electron-pos-printer.");
        }
        console.log("------------------------------------------");
        return printers;

    } catch (err) {
        console.error("Critical error in PosPrinter.getPrinters:", err.message);
        console.log("Falling back to Electron's internal getPrintersAsync()...");
        try {
            // --- FALLBACK: Use Electron's native method ---
            const printers = await mainWindow.webContents.getPrintersAsync();
            console.log("--- Found System Printers (Electron fallback) ---");
             if (printers && printers.length > 0) {
                printers.forEach((printer, index) => {
                    console.log(`  [${index}] Name: ${printer.name}`);
                });
            } else {
                console.log("No printers found by Electron fallback.");
            }
            console.log("-----------------------------------------------");
            return printers;
        } catch (e) {
             console.error("Critical error in getPrintersAsync (fallback):", e);
             return []; // Return empty array on error
        }
    }
});

ipcMain.handle('printer:getSavedName', async () => {
    return selectedPrinterName;
});

ipcMain.handle('printer:saveSetting', (event, printerName) => {
    selectedPrinterName = printerName;
    try {
        fs.writeFileSync(configFilePath, JSON.stringify({ printerName }), 'utf8');
        console.log(`Printer setting saved: ${printerName}`);
        return { success: true };
    } catch (e) {
        console.error('Failed to save printer config:', e);
        return { success: false, error: e.message };
    }
});

// --- UPDATED: This function now receives printData (array) instead of HTML ---
ipcMain.handle('printer:silentPrintOrder', async (event, printData, orderId) => {
    
    // --- CASE 1: No Printer Configured ---
    if (!selectedPrinterName) {
        console.warn(`No printer selected. Cannot print order ${orderId}. Please select a printer in settings.`);
        return { 
            success: false, 
            error: `No printer selected. Cannot print order ${orderId}.`, 
            printed: false 
        };
    } 
   
    // --- CASE 2: Silent Print to Configured POS Printer ---
    const options = {
        printerName: selectedPrinterName,
        silent: true,
        width: '80mm', // Or '58mm'
        margin: '0 0 0 0',
        copies: 1,
        // You may need to specify the driver type for some printers on Windows
        // e.g., type: 'epson', // 'star' or 'epson'
    };

    try {
        console.log(`Printing order ${orderId} to ${selectedPrinterName}...`);
        // --- NEW: Use PosPrinter.print() ---
        await PosPrinter.print(printData, options);
        
        console.log(`Order printed successfully to ${selectedPrinterName}`);
        return { success: true, printed: true };

    } catch (err) {
        console.error(`POS Print failed for order ${orderId}:`, err);
        return { success: false, error: err.message || err.toString(), printed: false };
    }
});

