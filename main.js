const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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

// --- PRINTER HANDLERS (HTML-based) ---

ipcMain.handle('printer:getPrinters', async () => {
    // --- Reverted to Electron's built-in printer discovery ---
    console.log("Attempting to fetch printers via getPrintersAsync()...");
    try {
        const printers = await mainWindow.webContents.getPrintersAsync();
        console.log("--- Found System Printers ---");
        if (printers && printers.length > 0) {
            printers.forEach((printer, index) => {
                console.log(`  [${index}] Name: ${printer.name}`);
            });
        } else {
            console.log("No printers found.");
        }
        console.log("-----------------------------");
        return printers;
    } catch (err) {
        console.error("Critical error in getPrintersAsync:", err);
        return []; // Return empty array on error
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

// --- This function now handles an HTML string ---
ipcMain.handle('printer:silentPrintOrder', async (event, orderHtmlContent, orderId) => {
    
    // 1. Setup hidden window to render content
    let printWindow = new BrowserWindow({
        show: false, 
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // 2. Load the HTML string from the renderer
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(orderHtmlContent)}`);

    // --- CASE 1: Automatic PDF Save (No Printer Configured) ---
    if (!selectedPrinterName) {
        console.warn('No printer selected. Falling back to automatic PDF saving.');
        try {
            if (!fs.existsSync(billsDir)) {
                fs.mkdirSync(billsDir, { recursive: true });
            }
            await new Promise(resolve => printWindow.webContents.on('did-finish-load', resolve));
          
            const pdfBuffer = await printWindow.webContents.printToPDF({
                marginsType: 0,
                pageSize: { width: 80000, height: 297000 }, // 80mm x 297mm
                printBackground: true,
                landscape: false,
            });

            const fileName = `order_${orderId}_${Date.now()}.pdf`;
            const filePath = path.join(billsDir, fileName);
            fs.writeFileSync(filePath, pdfBuffer);
            console.log(`PDF successfully saved to: ${filePath}`);

            if (printWindow) printWindow.close();
            return { success: true, pdfSaved: true, filePath: filePath };

        } catch (e) {
            console.error('Automatic PDF save failed:', e);
            if (printWindow) printWindow.close();
            return { success: false, error: e.message, pdfSaved: false };
        }
    } 
   
    // --- CASE 2: Silent Print to Configured Printer ---
    else {
        return new Promise((resolve) => {
            printWindow.webContents.on('did-finish-load', () => {
                console.log(`Attempting silent print to ${selectedPrinterName}...`);
                printWindow.webContents.print({
                    silent: true, // <-- No dialog box
                    deviceName: selectedPrinterName,
                    margins: { marginType: 'none' }, 
                    printBackground: true,
                }, (success, failureReason) => {
                    if (printWindow) printWindow.close();

                    if (success) {
                        console.log(`Order printed successfully to ${selectedPrinterName}`);
                        resolve({ success: true, printed: true });
                    } else {
                        console.error(`Print failed: ${failureReason}`);
                        resolve({ success: false, error: failureReason, printed: false });
                    }
                });
            });
        });
    }
});