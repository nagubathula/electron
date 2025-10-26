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

    // --- NEW FUNCTION: Check auth status on page load ---
    async function checkAuthStatus() {
        console.log('Checking for existing session...');
        const { session } = await window.api.getSession();

        if (session) {
            console.log('Session found, user is logged in.');
            showDashboard();
            await fetchAndRenderOrders();
        } else {
            console.log('No session found, showing login page.');
            // Show the login view
            loginView.style.display = 'flex'; // Use flex as per your HTML
            dashboardView.classList.add('hidden');
        }
    }

    // --- NEW: Generate Print Data for electron-pos-printer ---
    function generatePrintDataForPos(order) {
        // Define some styles for the receipt
        const styles = {
            header: 'font-size:22px;text-align:center;font-weight:bold;',
            subHeader: 'font-size:26px;text-align:center;font-weight:bold;margin-bottom:10px;',
            info: 'font-size:16px;',
            infoBold: 'font-size:16px;font-weight:bold;',
            item: 'font-size:18px;font-weight:bold;',
            customization: 'font-size:16px;margin-left:15px;',
            totalHeader: 'font-size:22px;font-weight:bold;text-align:right;',
            total: 'font-size:22px;font-weight:bold;text-align:right;',
        };

        // Build the print data array
        const data = [
            { type: 'text', value: 'ORDER TICKET', style: styles.header },
            { type: 'text', value: `#${order.unique_order_id}`, style: styles.subHeader },
            { type: 'hr' }, // Horizontal line
            { type: 'text', value: `Type: ${order.order_type.toUpperCase()}`, style: styles.info },
            { type: 'text', value: `Time: ${new Date(order.created_at).toLocaleTimeString()}`, style: styles.info },
            { type: 'text', value: `Cust: ${order.customer_name}`, style: `${styles.info};margin-bottom:10px;` },
            { type: 'hr' },
        ];

        // --- Create table for items ---
        // This creates a left-aligned column for items and a right-aligned column for prices
        const tableBody = [];
        order.order_items.forEach(item => {
            // Item name and price row
            tableBody.push([
                { type: 'text', value: `${item.quantity}x ${item.product_config.name}`, style: styles.item },
                { type: 'text', value: `₹${item.total_price.toFixed(2)}`, style: `${styles.item};text-align:right;` }
            ]);

            // Customizations row
            if (item.product_config.customizations) {
                const { selectedSauce, selectedToppings, selectedAddOns } = item.product_config.customizations;
                let customParts = [];
                if (selectedSauce) customParts.push(`Sauce: ${selectedSauce}`);
                if (selectedToppings?.length) customParts.push(`Toppings: ${selectedToppings.join(', ')}`);
                if (selectedAddOns?.length) customParts.push(`Add-ons: ${selectedAddOns.join(', ')}`);
              
                if (customParts.length > 0) {
                    // Add customizations as a new row spanning one column (it will be left-aligned)
                    tableBody.push([
                        { type: 'text', value: `(${customParts.join(' | ')})`, style: styles.customization },
                        { type: 'text', value: '', style: styles.customization } // Empty cell for alignment
                    ]);
                }
            }
        });

        // Add the table to the data array
        data.push({
            type: 'table',
            // Define column widths (70% for item name, 30% for price)
            tableHeader: [{ type: 'text', value: '', width: '70%' }, { type: 'text', value: '', width: '30%' }],
            // Add the rows
            tableBody: tableBody.map(row => [row[0], row[1]]),
        });


        // --- Total ---
        data.push({ type: 'hr' });
        data.push({
            type: 'table',
            // 50/50 split for the "TOTAL" text and the final price
            tableHeader: [{ type: 'text', value: '', width: '50%' }, { type: 'text', value: '', width: '50%' }],
            tableBody: [
                [
                    { type: 'text', value: 'TOTAL', style: styles.totalHeader },
                    { type: 'text', value: `₹${order.total_amount.toFixed(2)}`, style: styles.total }
                ]
            ]
        });

        // --- Feed paper and cut ---
        data.push({ type: 'feed', lines: 3 }); // Add 3 blank lines for spacing
        data.push({ type: 'cut' }); // Send paper cut command (if supported)

        return data;
    }

    // --- Printer Management Functions ---
    async function updatePrinterStatus() {
        savedPrinterName = await window.api.getSavedPrinterName();
        printerStatusDisplay.classList.remove('text-red-600', 'text-green-600', 'text-blue-600'); 
      
        if (savedPrinterName) {
            printerStatusDisplay.textContent = `Auto-print is ENABLED: ${savedPrinterName}`;
            printerStatusDisplay.classList.add('text-green-600');
        } else {
            // --- UPDATED: Reflect that PDF saving is no longer the default ---
            printerStatusDisplay.textContent = 'WARNING: Printer not set. New orders will NOT be auto-printed.';
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
                // --- UPDATED: Use p.name, as this is the standard identifier ---
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
            await updatePrinterStatus(); // Update the main dashboard status
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
        updatePrinterStatus(); // Load initial printer status

        // Start listening for new orders pushed from the main process
        window.api.onNewOrder(async (order) => {
            console.log('Realtime Event: New order received!', order);
            const orderElement = createOrderElement(order);
            orderElement.classList.add('new-order-fade-in');
            ordersList.prepend(orderElement);

            // If the "no orders" message is present, remove it
            const noOrdersMessage = ordersList.querySelector('#no-orders-message');
            if(noOrdersMessage) {
                noOrdersMessage.remove();
            }

            // --- AUTOMATIC POS PRINTING ---
            // --- UPDATED: Call new functions ---
            const printData = generatePrintDataForPos(order);
            // Pass the printData array and orderId to the main process
            const result = await window.api.silentPrintOrder(printData, order.unique_order_id);
          
            // Clear previous message classes
            printerStatusDisplay.classList.remove('text-red-600', 'text-green-600', 'text-blue-600');

            // --- UPDATED: Changed status messages, removed PDF logic ---
            if (result.success && result.printed) {
                printerStatusDisplay.textContent = `Order #${order.unique_order_id} successfully printed to ${savedPrinterName}!`;
                printerStatusDisplay.classList.add('text-green-600');
            } else {
                printerStatusDisplay.textContent = `Print Error for #${order.unique_order_id}: ${result.error}. Check setup.`;
                printerStatusDisplay.classList.add('text-red-600');
                // Revert to general status after a delay
                setTimeout(updatePrinterStatus, 5000); 
            }
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

    // --- Helper Function to Create an Order Card Element for Display ---
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
            <div class="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
                <span class="text-xs text-gray-400">
                    ${new Date(order.created_at).toLocaleString()}
                </span>
                <button data-order-id="${order.unique_order_id}" class="print-button px-3 py-1.5 text-sm font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                    Print Receipt
                </button>
            </div>
        `;

        // --- NEW: Add click listener for the manual print button ---
        const printButton = element.querySelector('.print-button');
        printButton.addEventListener('click', async () => {
            console.log(`Manually printing order #${order.unique_order_id}`);
            
            // Disable button
            printButton.disabled = true;
            printButton.textContent = 'Printing...';

            // Clear previous status
            printerStatusDisplay.classList.remove('text-red-600', 'text-green-600', 'text-blue-600');

            const printData = generatePrintDataForPos(order);
            const result = await window.api.silentPrintOrder(printData, order.unique_order_id);

            if (result.success && result.printed) {
                printerStatusDisplay.textContent = `Order #${order.unique_order_id} successfully re-printed to ${savedPrinterName}!`;
                printerStatusDisplay.classList.add('text-green-600');
            } else {
                printerStatusDisplay.textContent = `Re-print Error for #${order.unique_order_id}: ${result.error}. Check setup.`;
                printerStatusDisplay.classList.add('text-red-600');
            }

            // Re-enable button after a short delay
            setTimeout(() => {
                printButton.disabled = false;
                printButton.textContent = 'Print Receipt';
                // Revert to general status after 5 seconds
                setTimeout(updatePrinterStatus, 5000);
            }, 1000);
        });

        return element;
    }

    // --- INITIALIZE THE APP ---
    checkAuthStatus(); // <-- CALL THE NEW FUNCTION HERE
});

