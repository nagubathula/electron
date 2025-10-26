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

    // --- Function to generate your HTML receipt string ---
 function generatePrintableOrderHtml(order) {
    const itemsHtml = order.order_items.map(item => {
        const singlePrice = (item.total_price / item.quantity).toFixed(2);
        let customsHtml = '';

        const customs = item.product_config.customizations;
        if (customs) {
            if (customs.size) customsHtml += `<div><strong>• Size:</strong> ${customs.size}</div>`;
            if (customs.selectedSauce) customsHtml += `<div><strong>• Sauce:</strong> ${customs.selectedSauce}</div>`;
            if (customs.selectedToppings?.length)
                customsHtml += `<div><strong>• Toppings:</strong> ${customs.selectedToppings.join(', ')}</div>`;
            if (customs.selectedAddOns?.length)
                customsHtml += `<div><strong>• Add-ons:</strong> ${customs.selectedAddOns.join(', ')}</div>`;
        }

        return `
            <div style="border-bottom: 1px dotted #000; padding: 4px 0;">
                <div style="display: flex; justify-content: space-between;">
                    <span><strong>${item.product_config.name}</strong></span>
                    <span>₹${item.total_price.toFixed(2)}</span>
                </div>
                <div>${item.quantity} × ₹${singlePrice}</div>
                ${customsHtml}
            </div>
        `;
    }).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Order Receipt - Laurans Food Court</title>
          <style>
            * { 
              margin: 0; 
              padding: 0; 
              box-sizing: border-box; 
            }
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
            .section {
              padding: 4px 0;
            }
            .divider {
              border-top: 1px dashed #000;
              margin: 4px 0;
            }
            .center {
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div style="width: 70mm; margin: 0 auto;">
            <div class="center section">
              <h2 style="font-size:18px;">LAURANS FOOD COURT</h2>
              <div>Order Receipt</div>
              <div class="divider"></div>
            </div>

            <div class="section">
              <div><strong>Order ID:</strong> ${order.unique_order_id}</div>
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
            // --- PDF warning is back ---
            printerStatusDisplay.textContent = 'WARNING: Printer not set. New orders will be AUTO-SAVED as PDF.';
            printerStatusDisplay.classList.add('text-red-600');
        }
    }

    async function loadPrintersIntoSelect() {
        printerSelect.innerHTML = '<option value="">Loading printers...</option>';
        try {
            // --- Uses Electron's getPrinters ---
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

    // --- Event Listeners for Printer Setup (unchanged) ---
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

    // --- Handle Login Form Submission (unchanged) ---
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

            // --- Passes HTML to main process ---
            const printHtml = generatePrintableOrderHtml(order);
            const result = await window.api.silentPrintOrder(printHtml, order.unique_order_id);
          
            printerStatusDisplay.classList.remove('text-red-600', 'text-green-600', 'text-blue-600');

            // --- Status logic includes PDF fallback ---
            if (result.success) {
                if (result.printed) {
                    printerStatusDisplay.textContent = `Order #${order.unique_order_id} successfully printed to ${savedPrinterName}!`;
                    printerStatusDisplay.classList.add('text-green-600');
                } else if (result.pdfSaved) {
                    printerStatusDisplay.textContent = `Order #${order.unique_order_id} saved as PDF (no printer set).`;
                    printerStatusDisplay.classList.add('text-blue-600');
                    console.log('PDF saved path:', result.filePath);
                }
            } else {
                printerStatusDisplay.textContent = `Print/Save Error for #${order.unique_order_id}: ${result.error}. Check setup.`;
                printerStatusDisplay.classList.add('text-red-600');
            }
            setTimeout(updatePrinterStatus, 5000); 
        });
    }

    // --- Fetch and Display Initial Orders (unchanged) ---
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

    // --- createOrderElement (unchanged) ---
    function createOrderElement(order) {
        const element = document.createElement('div');
        element.className = 'bg-white shadow-md rounded-lg p-4 border-l-4 border-blue-500';

        const itemsHtml = order.order_items.map(item => {
            let customizations = '';
            if (item.product_config.customizations) {
                const { selectedSauce, selectedToppings, selectedAddOns } = item.product_config.customizations;
                let customParts = [];
                if (selectedSauce) customParts.push(`Sauce: ${selectedSauce}`);
                if (selectedToppings?.length) customParts.push(`Toppings: ${selectedToppings.join(', ')}`);
                if (selectedAddOns?.length) customParts.push(`Add-ons: ${selectedAddOns.join(', ')}`);
              
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
            <div class="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
                <span class="text-xs text-gray-400">
                    ${new Date(order.created_at).toLocaleString()}
                </span>
                <button data-order-id="${order.unique_order_id}" class="print-button px-3 py-1.5 text-sm font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                    Print Receipt
                </button>
            </div>
        `;

        // --- Manual Print Button Listener ---
        const printButton = element.querySelector('.print-button');
        printButton.addEventListener('click', async () => {
            console.log(`Manually printing order #${order.unique_order_id}`);
            
            printButton.disabled = true;
            printButton.textContent = 'Printing...';
            printerStatusDisplay.classList.remove('text-red-600', 'text-green-600', 'text-blue-600');

            // --- Passes HTML to main process ---
            const printHtml = generatePrintableOrderHtml(order);
            const result = await window.api.silentPrintOrder(printHtml, order.unique_order_id);

            if (result.success) {
                if (result.printed) {
                    printerStatusDisplay.textContent = `Order #${order.unique_order_id} successfully re-printed to ${savedPrinterName}!`;
                    printerStatusDisplay.classList.add('text-green-600');
                } else if (result.pdfSaved) {
                    printerStatusDisplay.textContent = `Order #${order.unique_order_id} re-saved as PDF (no printer set).`;
                    printerStatusDisplay.classList.add('text-blue-600');
                }
            } else {
                printerStatusDisplay.textContent = `Re-print Error for #${order.unique_order_id}: ${result.error}. Check setup.`;
                printerStatusDisplay.classList.add('text-red-600');
            }

            setTimeout(() => {
                printButton.disabled = false;
                printButton.textContent = 'Print Receipt';
                setTimeout(updatePrinterStatus, 5000);
            }, 1000);
        });

        return element;
    }

    // --- INITIALIZE THE APP ---
    checkAuthStatus();
});