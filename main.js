const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// --- Configuration Storage Path & Directories ---
const userDataPath = app.getPath('userData');
const configFilePath = path.join(userDataPath, 'printer-config.json');
const defaultBillsDir = path.join(userDataPath, 'bills'); // Default directory for auto-saved PDFs
let selectedPrinterName = null;
let pdfSavePath = null;
// NEW: File path for storing the Supabase session
const sessionFilePath = path.join(userDataPath, 'supabase-session.json'); 

// --- Your Supabase Credentials ---
const supabaseUrl = 'https://vdkpdyjyupqqciojirkg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZka3BkeWp5dXBxcWNpb2ppcmtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwMDI3MDYsImV4cCI6MjA2ODU3ODcwNn0.hw-opTjIs1ZSGXMMmvpHO2FlFfw5ovTRbdqNoutE2T4';

// Initialize the Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

let mainWindow;
let realtimeChannel = null;

// --- SESSION MANAGEMENT FUNCTIONS (NEW) ---

// Function to save the session to disk
function saveSession(session) {
    try {
        if (session) {
            fs.writeFileSync(sessionFilePath, JSON.stringify(session), 'utf8');
            console.log('Supabase session saved.');
        } else {
            // Remove session file if the session is null (e.g., on logout)
            if (fs.existsSync(sessionFilePath)) {
                fs.unlinkSync(sessionFilePath);
                console.log('Supabase session deleted.');
            }
        }
    } catch (e) {
        console.error('Failed to save session:', e);
    }
}

// Function to attempt restoring the session from disk
async function restoreSession() {
    try {
        if (fs.existsSync(sessionFilePath)) {
            const storedSession = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
            if (storedSession && storedSession.refresh_token) {
                // Use setSession to restore and validate the session
                const { data, error } = await supabase.auth.setSession(storedSession);
                if (error) {
                    console.error('Failed to restore Supabase session:', error.message);
                    saveSession(null); // Clear invalid session
                    return null;
                }
                console.log('Supabase session successfully restored.');
                // IMPORTANT: Listen for auth changes to save any new sessions (e.g., token refresh)
                setupAuthChangeListener(); 
                return data.session;
            }
        }
    } catch (e) {
        console.error('Error restoring session:', e);
        saveSession(null); // Clear corrupted file
    }
    return null;
}

// Set up a listener to automatically save sessions when they change (e.g., token refresh)
function setupAuthChangeListener() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            saveSession(session);
        } else if (event === 'SIGNED_OUT') {
            saveSession(null);
        }
    });
}

// --- Configuration Loading ---

// Load configuration on startup
function loadPrinterConfig() {
    try {
        if (fs.existsSync(configFilePath)) {
            const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
            selectedPrinterName = config.printerName || null;
            pdfSavePath = config.pdfSavePath || defaultBillsDir;
            console.log(`Loaded printer config: ${selectedPrinterName}, PDF path: ${pdfSavePath}`);
        } else {
             pdfSavePath = defaultBillsDir;
             console.log(`Using default PDF save path: ${pdfSavePath}`);
        }
    } catch (e) {
        console.error('Failed to load printer config:', e);
        pdfSavePath = defaultBillsDir; // Fallback
    }
}

// --- Window Creation ---

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

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();

  // NEW: Attempt to restore session and inform the renderer
  const session = await restoreSession();
  if (session) {
      // If a session is restored, set up the realtime channel immediately
      setupRealtimeChannel(session.user);
      // Send the restored user data to the renderer to skip the login screen
      mainWindow.webContents.on('did-finish-load', () => {
          mainWindow.webContents.send('supabase:sessionRestored', session.user);
      });
  }
}

// Function to set up the Realtime channel (extracted from login handler)
function setupRealtimeChannel(user) {
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
    }
    
    realtimeChannel = supabase
        .channel('public:orders')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'orders' },
            (payload) => {
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


app.whenReady().then(() => {
  createWindow();
  // Call the listener setup once the app is ready for the initial setup
  setupAuthChangeListener(); 
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// --- Supabase API Handlers (MODIFIED) ---

ipcMain.handle('supabase:login', async (event, email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    console.error('Login Error:', error.message);
    return { error: error.message };
  }

  // Session persistence is now handled by the listener, but we save on successful login too
  saveSession(data.session);

  // --- Login successful, now set up Realtime ---
  setupRealtimeChannel(data.user);

  return { user: data.user };
});

ipcMain.handle('supabase:logout', async () => {
    const { error } = await supabase.auth.signOut();
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
    }
    saveSession(null); // Clear the session file
    if (error) {
        console.error('Logout Error:', error.message);
        return { error: error.message };
    }
    return { success: true };
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

// --- PRINTER HANDLERS (Unchanged) ---

ipcMain.handle('printer:getPrinters', async () => {
    return mainWindow.webContents.getPrinters();
});

ipcMain.handle('printer:getSavedName', async () => {
    return selectedPrinterName;
});

ipcMain.handle('printer:getPdfSavePath', async () => {
    return pdfSavePath;
});

ipcMain.handle('app:selectDirectory', async (event) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Folder to Save Bills',
        defaultPath: pdfSavePath || defaultBillsDir, 
    });

    if (result.canceled) {
        return null;
    }
    return result.filePaths[0];
});

ipcMain.handle('printer:saveSetting', (event, { printerName, path }) => {
    selectedPrinterName = printerName;
    pdfSavePath = path; 
    try {
        fs.writeFileSync(configFilePath, JSON.stringify({ printerName, pdfSavePath: path }), 'utf8');
        console.log(`Printer setting saved: ${printerName}, PDF Path: ${path}`);
        return { success: true };
    } catch (e) {
        console.error('Failed to save printer config:', e);
        return { success: false, error: e.message };
    }
});

/**
 * Handles printing: either silent print to a configured device, or automatic PDF save.
 */
ipcMain.handle('printer:silentPrintOrder', async (event, orderHtmlContent, orderId) => {
    let printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    const printHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: sans-serif; margin: 0; padding: 10px; font-size: 10px; width: 80mm; }
                .receipt { padding: 5px; }
                h3 { text-align: center; margin-bottom: 5px; }
                ul { list-style: none; padding: 0; }
                li { display: flex; justify-content: space-between; margin-bottom: 2px; }
                .item-name { font-weight: bold; }
                .total { margin-top: 10px; padding-top: 5px; border-top: 1px dashed black; font-size: 12px; font-weight: bold; display: flex; justify-content: space-between; }
            </style>
        </head>
        <body>
            <div class="receipt">${orderHtmlContent}</div>
        </body>
        </html>
    `;
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printHtml)}`);

    if (!selectedPrinterName) {
        console.warn('No printer selected. Falling back to automatic PDF saving.');
        try {
            if (!fs.existsSync(pdfSavePath)) {
                fs.mkdirSync(pdfSavePath, { recursive: true });
            }

            await new Promise(resolve => printWindow.webContents.on('did-finish-load', resolve));
            
            const pdfBuffer = await printWindow.webContents.printToPDF({
                marginsType: 0,
                pageSize: { width: 80000, height: 300000 },
                printBackground: true,
                landscape: false,
            });

            const fileName = `order_${orderId}_${Date.now()}.pdf`;
            const filePath = path.join(pdfSavePath, fileName); 
            fs.writeFileSync(filePath, pdfBuffer);

            console.log(`PDF successfully saved to ABSOLUTE PATH: ${filePath}`);

            if (printWindow) {
              printWindow.close();
              printWindow = null;
            }

            return { success: true, pdfSaved: true, filePath: filePath };

        } catch (e) {
            console.error('Automatic PDF save failed:', e);
            if (printWindow) {
              printWindow.close();
              printWindow = null;
            }
            return { success: false, error: e.message, pdfSaved: false };
        }
    } 
    else {
        return new Promise((resolve) => {
            printWindow.webContents.on('did-finish-load', () => {
                printWindow.webContents.print({
                    silent: true, 
                    deviceName: selectedPrinterName,
                    margins: { marginType: 'none' }, 
                    printBackground: true,
                }, (success, failureReason) => {
                    if (printWindow) {
                      printWindow.close();
                      printWindow = null;
                    }

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