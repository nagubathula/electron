document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const ordersList = document.getElementById('orders-list');

    const printerSetupModal = document.getElementById('printer-setup-modal');
    const printerSetupButton = document.getElementById('printer-setup-button');
    const closePrinterModalButton = document.getElementById('close-printer-modal');
    const printerSetupForm = document.getElementById('printer-setup-form');
    const printerSelect = document.getElementById('printer-select');
    const printerStatusDisplay = document.getElementById('printer-status');
    const printerSetupStatus = document.getElementById('printer-setup-status');

    let savedPrinterName = null;
    
    // --- Local Token Management ---
    let tokenCounter = 1;
    let currentDate = new Date().toDateString();
    const processedOrderIds = new Set();
    
    // Load token data from localStorage
    function loadTokenData() {
        try {
            const saved = localStorage.getItem('tokenData');
            if (saved) {
                const data = JSON.parse(saved);
                const savedDate = data.date;
                const today = new Date().toDateString();
                
                if (savedDate === today) {
                    tokenCounter = data.counter;
                    currentDate = savedDate;
                    if (data.processedOrders) {
                        data.processedOrders.forEach(id => processedOrderIds.add(id));
                    }
                    console.log(`Loaded token counter: ${tokenCounter} for today`);
                } else {
                    console.log('New day detected, resetting token counter to 1');
                    tokenCounter = 1;
                    currentDate = today;
                    processedOrderIds.clear();
                    saveTokenData();
                }
            }
        } catch (e) {
            console.error('Failed to load token data:', e);
        }
    }
    
    // Save token data to localStorage
    function saveTokenData() {
        try {
            const data = {
                counter: tokenCounter,
                date: currentDate,
                processedOrders: Array.from(processedOrderIds)
            };
            localStorage.setItem('tokenData', JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save token data:', e);
        }
    }
    
    // Assign token to an order
    function assignTokenToOrder(order) {
        // Check if this order already has a token assigned
        if (processedOrderIds.has(order.id)) {
            // Find the token from our records
            const saved = localStorage.getItem('tokenData');
            if (saved) {
                const data = JSON.parse(saved);
                // Return the order with previously assigned token
                return order;
            }
        }
        
        // Assign new token
        order.token_number = tokenCounter;
        processedOrderIds.add(order.id);
        tokenCounter++;
        saveTokenData();
        console.log(`Assigned token #${order.token_number} to order ${order.unique_order_id}`);
        return order;
    }
    
    // Initialize token system
    loadTokenData();

    // --- Check auth status on page load ---
    async function checkAuthStatus() {
        console.log('Checking for existing session...');
        const { session } = await window.api.getSession();

        if (session) {
            console.log('Session found, user is logged in.');
            showDashboard();
            await fetchAndRenderOrders();
        } else {
            console.log('No session found, showing login page.');
            loginView.style.display = 'flex';
            dashboardView.classList.add('hidden');
        }
    }

    // --- Function to generate single copy HTML receipt string ---
    function generateSingleCopyHtml(order, copyType = '') {
        const token = order.token_number ?? order.tokenNumber ?? order.token_no ?? order.tokenNo ?? order.token ?? null;

        const itemsHtml = order.order_items.map(item => {
            const singlePrice = (item.total_price / item.quantity).toFixed(2);
            let customsHtml = '';

            const customs = item.product_config.customizations;
            if (customs && Object.keys(customs).length > 0) {
                Object.entries(customs).forEach(([key, value]) => {
                    if (value) {
                        const displayValue = Array.isArray(value) ? value.join(', ') : value;
                        customsHtml += `<div><strong>• ${key}:</strong> ${displayValue}</div>`;
                    }
                });
            }

            return `
                <div style="border-bottom: 1px dotted #000; padding: 4px 0;">
                    <div style="display: flex; justify-content: space-between;">
                        <span><strong>${item.product_config.name}</strong></span>
                        <span>₹${item.total_price.toFixed(2)}</span>
                    </div>
                    <div><strong>${item.quantity} </strong> × ₹${singlePrice}</div>
                    ${customsHtml}
                </div>
            `;
        }).join('');

        const copyLabel = copyType ? `<div style="font-size:16px; font-weight:bold; border:2px solid #000; padding:4px; margin:4px 0;">${copyType} COPY</div>` : '';

        return `
            <div style="width: 70mm; margin: 0 auto; page-break-after: always;">
                <div class="center section">
                    <h2 style="font-size:18px;">LAURANS FOOD COURT</h2>
                    <div>Order Receipt</div>
                    ${copyLabel}
                    ${token ? `<div class="token-badge">TOKEN #${token}</div>` : ''}
                    <div class="divider"></div>
                </div>

                <div class="section">
                    <div style="display:flex; justify-content:space-between;">
                        <div><strong>Order ID:</strong> ${order.unique_order_id}</div>
                        ${token ? `<div><strong>Token:</strong> #${token}</div>` : ''}
                    </div>
                    <div><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</div>
                    <div><strong>Type:</strong> ${order.order_type.toUpperCase()}</div>
                    <div><strong>Status:</strong> ${order.status.toUpperCase()}</div>
                    <div><strong>Customer:</strong> ${order.customer_name}</div>
                    <div><strong>Email:</strong> ${order.customer_email || 'N/A'}</div>
                </div>

                <div class="divider"></div>

                <div class="section">
                    <div><strong>ORDER ITEMS:</strong></div>
                    ${itemsHtml}
                </div>

                <div class="divider"></div>

                <div class="section" style="text-align:right;">
                    <strong>TOTAL: ₹${order.total_amount.toFixed(2)}</strong>
                </div>

                <div class="center section" style="font-size:12px;">
                    <div>Thank you for your order!</div>
                    <div>Visit us again soon!</div>
                </div>
            </div>
        `;
    }

    // --- Function to generate BOTH copies in one HTML document ---
    function generateBothCopiesHtml(order) {
        const customerCopy = generateSingleCopyHtml(order, 'CUSTOMER');
        const restaurantCopy = generateSingleCopyHtml(order, 'RESTAURANT');

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Order Receipt - Laurans Food Court</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Courier New', monospace;
                        font-size: 14px;
                        width: 70mm;
                        margin: 0;
                        padding: 0;
                    }
                    @page { 
                        size: 70mm auto; 
                        margin: 0; 
                    }
                    .section { padding: 4px 0; }
                    .divider { border-top: 1px dashed #000; margin: 4px 0; }
                    .center { text-align: center; }
                    .token-badge {
                        font-size: 28px;
                        font-weight: 800;
                        padding: 4px 0;
                        letter-spacing: 2px;
                        border: 2px solid #000;
                        margin: 4px 0;
                    }
                    .page-break { 
                        page-break-after: always; 
                        break-after: page;
                    }
                </style>
            </head>
            <body>
                ${customerCopy}
                ${restaurantCopy}
            </body>
            </html>
        `;
    }

    // --- Printer Management Functions ---
    async function updatePrinterStatus() {
        savedPrinterName = await window.api.getSavedPrinterName();
        printerStatusDisplay.classList.remove('text-red-600', 'text-green-600', 'text-blue-600');
     
        if (savedPrinterName) {
            printerStatusDisplay.textContent = `Auto-print is ENABLED: ${savedPrinterName}`;
            printerStatusDisplay.classList.add('text-green-600');
        } else {
            printerStatusDisplay.textContent = 'WARNING: Printer not set. New orders will be AUTO-SAVED as PDF.';
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

            printerSelect.innerHTML = '<option value="">-- Select a Printer --</option>';
            printers.forEach(p => {
                const option = document.createElement('option');
                const printerName = p.name;
                option.value = printerName;
                option.textContent = printerName + (p.isDefault ? ' (Default)' : '');
                if (printerName === savedPrinterName) {
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

    // --- Event Listeners for Printer Setup ---
    printerSetupButton.addEventListener('click', () => {
        loadPrintersIntoSelect();
        printerSetupModal.classList.remove('hidden');
        printerSetupStatus.classList.add('hidden');
        printerSetupStatus.textContent = '';
    });

    closePrinterModalButton.addEventListener('click', () => {
        printerSetupModal.classList.add('hidden');
    });

    printerSetupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedPrinter = printerSelect.value;
        const saveButton = document.getElementById('save-printer-button');

        printerSetupStatus.classList.remove('hidden', 'text-green-600', 'text-red-600');
        printerSetupStatus.textContent = 'Saving...';
        saveButton.disabled = true;

        if (!selectedPrinter) {
            printerSetupStatus.textContent = 'Error: Please select a valid printer.';
            printerSetupStatus.classList.add('text-red-600');
            saveButton.disabled = false;
            return;
        }

        const { success, error } = await window.api.savePrinterSetting(selectedPrinter);

        if (success) {
            printerSetupStatus.textContent = `Configuration saved successfully to "${selectedPrinter}"!`;
            printerSetupStatus.classList.add('text-green-600');
            await updatePrinterStatus();
        } else {
            printerSetupStatus.textContent = `Save failed: ${error}`;
            printerSetupStatus.classList.add('text-red-600');
        }
        saveButton.disabled = false;
    });

    // --- Handle Login Form Submission ---
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
            showDashboard();
            await fetchAndRenderOrders();
        }
    });

    // --- UI Transition and Realtime Listener Setup ---
    function showDashboard() {
        loginView.style.display = 'none';
        dashboardView.classList.remove('hidden');
        updatePrinterStatus();

        window.api.onNewOrder(async (order) => {
            console.log('Realtime Event: New order received!', order);
            const orderElement = createOrderElement(order);
            orderElement.classList.add('new-order-fade-in');
            ordersList.prepend(orderElement);

            const noOrdersMessage = ordersList.querySelector('#no-orders-message');
            if(noOrdersMessage) {
                noOrdersMessage.remove();
            }

            // Print BOTH copies (Customer + Restaurant)
            const printHtml = generateBothCopiesHtml(order);
            const result = await window.api.silentPrintOrder(printHtml, order.unique_order_id);
         
            printerStatusDisplay.classList.remove('text-red-600', 'text-green-600', 'text-blue-600');

            if (result.success) {
                if (result.printed) {
                    printerStatusDisplay.textContent = `Order #${order.unique_order_id} (Token #${order.token_number}) - 2 copies printed!`;
                    printerStatusDisplay.classList.add('text-green-600');
                } else if (result.pdfSaved) {
                    printerStatusDisplay.textContent = `Order #${order.unique_order_id} (Token #${order.token_number}) - 2 copies saved as PDF.`;
                    printerStatusDisplay.classList.add('text-blue-600');
                    console.log('PDF saved path:', result.filePath);
                }
            } else {
                printerStatusDisplay.textContent = `Print/Save Error for #${order.unique_order_id}: ${result.error}`;
                printerStatusDisplay.classList.add('text-red-600');
            }
            setTimeout(updatePrinterStatus, 5000);
        });
    }

    // --- Fetch and Display Initial Orders ---
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

    // --- createOrderElement with Token Number Display and Fixed Customizations ---
    function createOrderElement(order) {
        const element = document.createElement('div');
        element.className = 'bg-white shadow-md rounded-lg p-4 border-l-4 border-blue-500';

        const token = order.token_number ?? order.tokenNumber ?? order.token_no ?? order.tokenNo ?? order.token ?? null;

        const itemsHtml = order.order_items.map(item => {
            let customizations = '';
            if (item.product_config.customizations) {
                const customs = item.product_config.customizations;
                let customParts = [];
                
                Object.entries(customs).forEach(([key, value]) => {
                    if (value) {
                        const displayValue = Array.isArray(value) ? value.join(', ') : value;
                        customParts.push(`${key}: ${displayValue}`);
                    }
                });
             
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
                    ${token ? `<div class="inline-block bg-indigo-600 text-white text-2xl font-bold px-4 py-2 rounded-lg mb-2">TOKEN #${token}</div>` : ''}
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
            <div class="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
                <span class="text-xs text-gray-400">
                    ${new Date(order.created_at).toLocaleString()}
                </span>
                <button data-order-id="${order.unique_order_id}" class="print-button px-3 py-1.5 text-sm font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                    Print Receipt (2 copies)
                </button>
            </div>
        `;

        // --- Manual Print Button Listener ---
        const printButton = element.querySelector('.print-button');
        printButton.addEventListener('click', async () => {
            console.log(`Manually printing order #${order.unique_order_id} (2 copies)`);
           
            printButton.disabled = true;
            printButton.textContent = 'Printing...';
            printerStatusDisplay.classList.remove('text-red-600', 'text-green-600', 'text-blue-600');

            // Print BOTH copies
            const printHtml = generateBothCopiesHtml(order);
            const result = await window.api.silentPrintOrder(printHtml, order.unique_order_id);

            if (result.success) {
                if (result.printed) {
                    printerStatusDisplay.textContent = `Order #${order.unique_order_id} (Token #${token}) - 2 copies re-printed!`;
                    printerStatusDisplay.classList.add('text-green-600');
                } else if (result.pdfSaved) {
                    printerStatusDisplay.textContent = `Order #${order.unique_order_id} (Token #${token}) - 2 copies re-saved as PDF.`;
                    printerStatusDisplay.classList.add('text-blue-600');
                }
            } else {
                printerStatusDisplay.textContent = `Re-print Error for #${order.unique_order_id}: ${result.error}`;
                printerStatusDisplay.classList.add('text-red-600');
            }

            setTimeout(() => {
                printButton.disabled = false;
                printButton.textContent = 'Print Receipt (2 copies)';
                setTimeout(updatePrinterStatus, 5000);
            }, 1000);
        });

        return element;
    }

    // --- INITIALIZE THE APP ---
    checkAuthStatus();
});
