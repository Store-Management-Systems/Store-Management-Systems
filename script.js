const API_URL = 'http://localhost:3000/api';

// Replace your existing loadState with this async setup:
async function loadState() {
  try {
    const [settings, items, categories, units, bills, logs, dash] = await Promise.all([
      fetch(`${API_URL}/settings`).then(r => r.json()),
      fetch(`${API_URL}/items`).then(r => r.json()),
      fetch(`${API_URL}/categories`).then(r => r.json()),
      fetch(`${API_URL}/units`).then(r => r.json()),
      fetch(`${API_URL}/bills`).then(r => r.json()),
      fetch(`${API_URL}/history`).then(r => r.json()),
      fetch(`${API_URL}/dashboard`).then(r => r.json())
    ]);

    state.shop = settings.data || state.shop;
    state.items = items.data.map(i => ({...i, qty: i.stock, price: i.selling_price, buyPrice: i.buy_price}));
    state.categories = categories.data.map(c => c.name);
    state.units = units.data.map(u => u.name);
    state.bills = bills.data.map(b => ({
        ...b, 
        billNo: b.bill_number, 
        date: b.created_at,
        customerName: b.customer_name,
        customerPhone: b.customer_phone 
    }));
    state.logs = logs.data.map(l => ({...l, itemName: l.item_name, qty: l.quantity, date: l.created_at}));
    
    updateTopbar();
    showSection('dashboard');
  } catch (error) {
    console.error("Failed to load backend state", error);
    toast("Error connecting to server");
  }
}

// Map frontend save operations to specific backend endpoints
async function saveItem(id) {
    // ... your existing validation logic ...
    
    const itemData = {
        name, category: document.getElementById('itemCat').value,
        unit: document.getElementById('itemUnit').value,
        buy_price: buyPrice, selling_price: price, stock: qty
    };

    const url = id ? `${API_URL}/items/${id}` : `${API_URL}/items`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
    });
    
    if (res.ok) {
        closeModal();
        await loadState(); // Refresh state from DB
        toast(id ? '✅ Item updated' : '✅ Item added');
    }
}

async function doStockIn() {
    // ... your existing logic to gather data ...
    await fetch(`${API_URL}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, qty, type: 'in', supplier: document.getElementById('siSupplier').value, notes: document.getElementById('siNotes').value })
    });
    await loadState();
    toast(`✅ Stock Added`);
}

async function generateBill() {
    // ... your existing validation ...
    const billData = {
        customer_name: billCustomer.name,
        customer_phone: billCustomer.phone,
        items: billItems, subtotal, tax, total
    };

    const res = await fetch(`${API_URL}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billData)
    });
    const result = await res.json();
    
    await loadState();
    billItems = []; billCustomer = {name:'', phone:''};
    // Fetch the specific generated bill to pass to showBillReceipt
    const newBill = state.bills.find(b => b.billNo === result.data.bill_number);
    showBillReceipt(newBill);
}

async function saveSettings() {
    // ... gather DOM elements ...
    const settingsData = {
        shop_name: document.getElementById('setName').value.trim(),
        tagline: document.getElementById('setTagline').value.trim(),
        address: document.getElementById('setAddress').value.trim(),
        phone: document.getElementById('setPhone').value.trim(),
        gst: document.getElementById('setGst').value.trim(),
        currency: document.getElementById('setCurrency').value,
        tax_rate: parseFloat(document.getElementById('setTax').value) || 0,
        low_stock_alert: parseInt(document.getElementById('setLowStock').value) || 5,
        logo: state.shop.logo // Assuming logo is updated in state during file read
    };

    await fetch(`${API_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsData)
    });
    
    await loadState();
    toast('✅ Settings saved');
}

// Delete the old synchronous saveState() function and replace any remaining calls with await loadState() to sync UI.