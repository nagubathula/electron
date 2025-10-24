document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const ordersList = document.getElementById('orders-list');
    
    // NEW: Dashboard element for user info
    const userInfo = document.getElementById('user-info');
    const logoutButton = document.getElementById('logout-button');

    const printerSetupModal = document.getElementById('printer-setup-modal');
    const printerSetupButton = document.getElementById('printer-setup-button');
    const closePrinterModalButton = document.getElementById('close-printer-modal');
    const printerSetupForm = document.getElementById('printer-setup-form');
    const printerSelect = document.getElementById('printer-select');
    const printerStatusDisplay = document.getElementById('printer-status');
    const printerSetupStatus = document.getElementById('printer-setup-status');
    
    const pdfPathInput = document.getElementById('pdf-path-input');
    const selectPdfPathButton = document.getElementById('select-pdf-path-button');

    let savedPrinterName = null;
    let currentPdfSavePath = null;

    // --- Utility: Receipt HTML Generator (for Printing - Unchanged) ---
    function generatePrintableOrderHtml(order) {
        const itemsList = order.order_items.map(item => {
            let customizations = '';
            if (item.product_config.customizations) {
                const { selectedSauce, selectedToppings, selectedAddOns } = item.product_config.customizations;
                
                let customParts = [];
                if (selectedSauce) customParts.push(`Sauce: ${selectedSauce}`);
                if (selectedToppings?.length) customParts.push(`Toppings: ${selectedToppings.join(', ')}`);
                if (selectedAddOns?.length) customParts.push(`Add-ons: ${selectedAddOns.join(', ')}`);
                
                if (customParts.length > 0) {
                    customizations = `<div style="font-size: 8px; margin-left: 10px;">(${customParts.join(' | ')})</div>`;
                }
            }

            return `
                <li>
                    <span class="item-name">${item.quantity}x ${item.product_config.name}</span>
                    <span class="item-price">₹${item.total_price.toFixed(2)}</span>
                </li>
                ${customizations}
            `;
        }).join('');

        return `
            <div style="text-align: center; margin-bottom: 10px;">
                <h3 style="margin: 0; font-size: 14px;">ORDER TICKET</h3>
                <h4 style="margin: 0; font-size: 18px;">#${order.unique_order_id}</h4>
            </div>
            <div style="border-top: 1px dashed black; padding-top: 5px;">
                <p style="margin: 0;">Type: ${order.order_type.toUpperCase()}</p>
                <p style="margin: 0;">Time: ${new Date(order.created_at).toLocaleTimeString()}</p>
                <p style="margin: 0;">Customer: ${order.customer_name}</p>
            </div>
            <div style="border-top: 1px dashed black; margin-top: 10px; padding-top: 5px;">
                <ul style="list-style: none; padding: 0;">${itemsList}</ul>
            </div>
            <div class="total" style="font-size: 12px; margin-top: 10px; padding-top: 5px; border-top: 1px dashed black; font-weight: bold; display: flex; justify-content: space-between;">
                <span>TOTAL AMOUNT:</span>
                <span>₹${order.total_amount.toFixed(2)}</span>
            </div>
        `;
    }

    // --- Printer Management Functions (Unchanged) ---
    async function updatePrinterStatus() {
        savedPrinterName = await window.api.getSavedPrinterName();
        currentPdfSavePath = await window.api.getPdfSavePath(); 

        pdfPathInput.value = currentPdfSavePath || 'No path set (using default)'; 
        
        printerStatusDisplay.classList.remove('text-red-600', 'text-green-600', 'text-blue-600'); 
        
        if (savedPrinterName) {
            printerStatusDisplay.textContent = `Auto-print is ENABLED: ${savedPrinterName}`;
            printerStatusDisplay.classList.add('text-green-600');
        } else {
            printerStatusDisplay.textContent = `WARNING: Printer not set. New orders will be AUTO-SAVED as PDF to: ${currentPdfSavePath}`;
            printerStatusDisplay.classList.add('text-red-600');
        }
    }

    async function loadPrintersIntoSelect() {
        printerSelect.innerHTML = '<option value="">Loading printers...</option>';
        try {
            const printers = await window.api.getPrinters();
            printerSelect.innerHTML = '';
            
            if (printers.length === 0) {
                 printerSelect.innerHTML = '<option value="">No printers found.</option>';
                 printerSelect.disabled = true;
                 return;
            }

            printerSelect.innerHTML = '<option value="">-- Select a Printer (Optional) --</option>';
            printers.forEach(p => {
                const option = document.createElement('option');
                option.value = p.name;
                option.textContent = p.name + (p.isDefault ? ' (Default)' : '');
                if (p.name === savedPrinterName) {
                    option.selected = true;
                }
                printerSelect.appendChild(option);
            });
            printerSelect.disabled = false;
        } catch (error) {
            console.error('Error loading printers:', error);
            printerSelect.innerHTML = '<option value="">Error loading printers.</option>';
            printerSelect.disabled = true;
        }
    }

    // --- Event Listeners for Printer Setup (Unchanged) ---
    printerSetupButton.addEventListener('click', () => {
        loadPrintersIntoSelect();
        printerSetupModal.classList.remove('hidden');
        printerSetupStatus.classList.add('hidden');
        printerSetupStatus.textContent = '';
    });

    closePrinterModalButton.addEventListener('click', () => {
        printerSetupModal.classList.add('hidden');
    });
    
    selectPdfPathButton.addEventListener('click', async () => {
        const newPath = await window.api.selectDirectory();
        if (newPath) {
            currentPdfSavePath = newPath; 
            pdfPathInput.value = newPath; 
            printerSetupStatus.classList.remove('hidden', 'text-green-600', 'text-red-600', 'text-blue-600');
            printerSetupStatus.textContent = `New PDF folder selected: ${newPath}. Click 'Save' to confirm.`;
            printerSetupStatus.classList.add('text-blue-600');
        }
    });

    printerSetupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedPrinter = printerSelect.value;
        const saveButton = document.getElementById('save-printer-button');
        const path = pdfPathInput.value; 

        printerSetupStatus.classList.remove('hidden', 'text-green-600', 'text-red-600', 'text-blue-600');
        printerSetupStatus.textContent = 'Saving...';
        saveButton.disabled = true;

        if (!path) {
             printerSetupStatus.textContent = 'Error: PDF save path cannot be empty.';
             printerSetupStatus.classList.add('text-red-600');
             saveButton.disabled = false;
             return;
        }

        const { success, error } = await window.api.savePrinterSetting({ 
            printerName: selectedPrinter, 
            path: path 
        });

        if (success) {
            const statusMessage = selectedPrinter ? 
                `Configuration saved: Printer "${selectedPrinter}", PDF Path: "${path}"` :
                `Configuration saved: PDF Path "${path}". Printer still not set.`;

            printerSetupStatus.textContent = statusMessage;
            printerSetupStatus.classList.add('text-green-600');
            await updatePrinterStatus(); 
        } else {
            printerSetupStatus.textContent = `Save failed: ${error}`;
            printerSetupStatus.classList.add('text-red-600');
        }
        saveButton.disabled = false;
    });

    // --- Handle Login/Logout (MODIFIED) ---
    
    // Function to transition to the login view
    function showLogin() {
        dashboardView.classList.add('hidden');
        loginView.style.display = 'flex';
        // Clear login form and errors
        loginForm.reset();
        loginError.textContent = '';
        userInfo.textContent = '';
        userInfo.classList.add('hidden');
        ordersList.innerHTML = ''; // Clear order list
    }

    // Function to transition to the dashboard view
    function showDashboard(user) {
        loginView.style.display = 'none';
        dashboardView.classList.remove('hidden');
        userInfo.textContent = `Logged in as: ${user.email}`;
        userInfo.classList.remove('hidden');

        updatePrinterStatus(); // Load initial printer status and PDF path
        fetchAndRenderOrders();
        setupRealtimeListener(); // Set up the listener only once the dashboard is shown
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        loginError.textContent = '';
        const submitButton = loginForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Signing in...';

        const { user, error } = await window.api.login(
            emailInput.value,
            passwordInput.value
        );

        if (error) {
            loginError.textContent = `Login Failed: ${error}`;
            submitButton.disabled = false;
            submitButton.textContent = 'Sign in';
        } else {
            console.log('Login Successful!', user);
            showDashboard(user);
        }
    });
    
    logoutButton.addEventListener('click', async () => {
        const buttonText = logoutButton.textContent;
        logoutButton.textContent = 'Logging out...';
        logoutButton.disabled = true;
        
        const { error } = await window.api.logout();
        
        if (error) {
            console.error('Logout failed:', error);
            alert(`Logout failed: ${error}`);
            logoutButton.textContent = buttonText;
            logoutButton.disabled = false;
        } else {
            showLogin();
            logoutButton.textContent = buttonText;
            logoutButton.disabled = false;
        }
    });


    // --- Realtime Listener Setup (Extracted and Modified) ---
    function setupRealtimeListener() {
        // Start listening for new orders pushed from the main process
        window.api.onNewOrder(async (order) => {
            console.log('Realtime Event: New order received!', order);
            const orderElement = createOrderElement(order);
            orderElement.classList.add('new-order-fade-in');
            ordersList.prepend(orderElement);

            const noOrdersMessage = ordersList.querySelector('#no-orders-message');
            if(noOrdersMessage) {
                noOrdersMessage.remove();
            }

            // --- AUTOMATIC PRINTING / PDF SAVING ---
            const printHtml = generatePrintableOrderHtml(order);
            const result = await window.api.silentPrintOrder(printHtml, order.unique_order_id);
            
            printerStatusDisplay.classList.remove('text-red-600', 'text-green-600', 'text-blue-600');

            if (result.success) {
                if (result.printed) {
                    printerStatusDisplay.textContent = `Order #${order.unique_order_id} successfully printed to ${savedPrinterName}!`;
                    printerStatusDisplay.classList.add('text-green-600');
                } else if (result.pdfSaved) {
                    printerStatusDisplay.textContent = `Order #${order.unique_order_id} saved as PDF to: ${currentPdfSavePath}`;
                    printerStatusDisplay.classList.add('text-blue-600');
                    console.log('PDF saved path:', result.filePath);
                }
            } else {
                printerStatusDisplay.textContent = `Print/Save Error for #${order.unique_order_id}: ${result.error}. Check setup.`;
                printerStatusDisplay.classList.add('text-red-600');
                setTimeout(updatePrinterStatus, 5000); 
            }
        });
    }


    // --- Fetch and Display Initial Orders (Unchanged) ---
    async function fetchAndRenderOrders() {
        ordersList.innerHTML = `<p class="text-center text-gray-500 py-8">Loading orders...</p>`;
        const { data, error } = await window.api.getPendingOrders();

        if (error) {
            ordersList.innerHTML = `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong class="font-bold">Error!</strong>
                <span class="block sm:inline">Could not fetch orders: ${error}</span>
            </div>`;
            return;
        }

        if (!data || data.length === 0) {
            ordersList.innerHTML = `<p id="no-orders-message" class="text-center text-gray-500 py-8">No pending orders right now.</p>`;
            return;
        }

        ordersList.innerHTML = '';
        data.forEach(order => {
            const orderElement = createOrderElement(order);
            ordersList.appendChild(orderElement);
        });
    }

    // --- Helper Function to Create an Order Card Element for Display (Unchanged) ---
    function createOrderElement(order) {
        const element = document.createElement('div');
        element.className = 'bg-white shadow-md rounded-lg p-4 border-l-4 border-blue-500';

        const itemsHtml = order.order_items.map(item => {
            let customizations = '';
            if (item.product_config.customizations) {
                const { selectedSauce, selectedToppings, selectedAddOns } = item.product_config.customizations;
                const toppings = selectedToppings?.join(', ');
                const addOns = selectedAddOns?.join(', ');

                let customParts = [];
                if (selectedSauce) customParts.push(`Sauce: ${selectedSauce}`);
                if (toppings) customParts.push(`Toppings: ${toppings}`);
                if (addOns) customParts.push(`Add-ons: ${addOns}`);
                
                if (customParts.length > 0) {
                    customizations = `<div class="text-xs text-gray-500 ml-4">${customParts.join(' | ')}</div>`;
                }
            }
            return `
                <li class="flex justify-between py-1">
                    <div>
                        <span class="font-semibold">${item.quantity} x ${item.product_config.name}</span>
                        ${customizations}
                    </div>
                    <span class="text-gray-700">₹${item.total_price.toFixed(2)}</span>
                </li>`;
        }).join('');

        element.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">${order.unique_order_id}</h3>
                    <p class="text-sm text-gray-600">${order.customer_name}</p>
                </div>
                <div class="text-right">
                    <span class="inline-block bg-yellow-200 text-yellow-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full">${order.order_type}</span>
                     <p class="text-xl font-bold text-gray-900">₹${order.total_amount.toFixed(2)}</p>
                </div>
            </div>
            <div class="border-t border-gray-200 mt-2 pt-2">
                <ul class="divide-y divide-gray-100">
                    ${itemsHtml}
                </ul>
            </div>
            <div class="text-right text-xs text-gray-400 mt-2">
                ${new Date(order.created_at).toLocaleString()}
            </div>
        `;
        return element;
    }
    
    // --- Initial Check (NEW) ---
    // Listen for a session restored message from the main process
    window.api.onSessionRestored((user) => {
        // If the main process sends the user, skip login
        if (user) {
            console.log('Session restored from disk. Skipping login.');
            showDashboard(user);
        }
    });
    
    // If no session is restored, the user remains on the login screen.
});