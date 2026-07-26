// ─── SHOP MANAGEMENT SYSTEM - FRONTEND INTEGRATION ────────────────────────────

const API_URL = '/api';

let currentUser = null;
let activeShopId = null;

let state = {
  shop: {
    name: 'My Shop',
    tagline: 'Quality & Service',
    address: '',
    phone: '',
    gst: '',
    logo: null,
    currency: '₹',
    taxRate: 0,
    lowStockAlert: 5
  },
  items: [],
  categories: [],
  units: [],
  bills: [],
  logs: [],
  customers: [],
  shops: [],
  users: [],
  roles: []
};

// Cart State for Billing List View
let billCart = []; // Array of { itemId, name, price, qty, stock, unit }
let billCustomer = { name: '', phone: '' };

// ─── API Helper Function ───────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('sms_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(activeShopId ? { 'x-shop-id': activeShopId } : {}),
    ...(options.headers || {})
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    const data = await response.json();

    if (response.status === 401) {
      handleUnauthorized();
      throw new Error(data.message || 'Unauthorized');
    }

    if (!response.ok) {
      throw new Error(data.message || 'API request failed');
    }

    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err.message);
    throw err;
  }
}

function handleUnauthorized() {
  currentUser = null;
  localStorage.removeItem('sms_token');
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

// ─── Authentication Handlers ──────────────────────────────────────────────────
async function checkAuth() {
  const token = localStorage.getItem('sms_token');
  if (!token) {
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    return;
  }

  try {
    const res = await apiFetch('/auth/me');
    if (res.success && res.data) {
      currentUser = res.data;
      activeShopId = currentUser.shop_id;
      if (currentUser.shop) {
        state.shop = {
          id: currentUser.shop.id,
          name: currentUser.shop.name || 'My Shop',
          code: currentUser.shop.code,
          address: currentUser.shop.address || '',
          phone: currentUser.shop.phone || '',
          gst: currentUser.shop.gst || '',
          currency: currentUser.shop.currency || '₹',
          taxRate: currentUser.shop.taxRate || 0,
          logo: currentUser.shop.logo || null,
          lowStockAlert: currentUser.shop.lowStockAlert || 5
        };
      }

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';

      // Setup Admin Shop Switcher if Admin
      if (currentUser.role === 'Admin') {
        loadAdminShops();
      } else {
        document.getElementById('topbarAdminShopSelect').style.display = 'none';
      }

      updateTopbar();
      await loadInitialData();
      showSection('dashboard');
    }
  } catch (e) {
    handleUnauthorized();
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const loginBtn = document.getElementById('loginBtn');

  if (!username || !password) {
    alert('Please enter username and password');
    return;
  }

  try {
    loginBtn.disabled = true;
    loginBtn.textContent = '⏳ Signing in...';

    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    if (res.success && res.data && res.data.token) {
      localStorage.setItem('sms_token', res.data.token);
      currentUser = res.data.user;
      activeShopId = currentUser.shop_id;

      toast('✅ Welcome back!');
      await checkAuth();
    } else {
      alert(res.message || 'Login failed');
    }
  } catch (err) {
    alert(err.message || 'Invalid username or password');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = '🔐 Sign In';
  }
}

async function handleLogout() {
  if (!confirm('Are you sure you want to log out?')) return;
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch (e) {}
  handleUnauthorized();
  toast('Logged out');
}

function togglePasswordVisibility() {
  const pwdInput = document.getElementById('loginPassword');
  pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
}

// ─── Admin Multi-Shop Switcher ────────────────────────────────────────────────
async function loadAdminShops() {
  try {
    const res = await apiFetch('/shops');
    if (res.success && res.data) {
      state.shops = res.data;
      const select = document.getElementById('adminShopDropdown');
      select.innerHTML = state.shops.map(s => `
        <option value="${s.id}" ${s.id === activeShopId ? 'selected' : ''}>${s.shop_name}</option>
      `).join('');
      document.getElementById('topbarAdminShopSelect').style.display = 'block';
    }
  } catch (e) {}
}

async function handleAdminShopSwitch(shopId) {
  activeShopId = shopId;
  const targetShop = state.shops.find(s => s.id === shopId);
  if (targetShop) {
    state.shop.name = targetShop.shop_name;
    state.shop.currency = targetShop.currency || '₹';
    state.shop.taxRate = targetShop.tax_rate || 0;
  }
  updateTopbar();
  await loadInitialData();
  renderSection(currentSection);
  toast(`Switched shop to ${targetShop ? targetShop.shop_name : shopId}`);
}

// ─── Load Initial Backend Data ────────────────────────────────────────────────
async function loadInitialData() {
  try {
    const [itemsRes, catsRes, unitsRes, settingsRes] = await Promise.all([
      apiFetch('/items'),
      apiFetch('/categories'),
      apiFetch('/units'),
      apiFetch('/settings')
    ]);

    if (itemsRes.success) state.items = itemsRes.data || [];
    if (catsRes.success) state.categories = (catsRes.data || []).map(c => c.name || c);
    if (unitsRes.success) state.units = (unitsRes.data || []).map(u => u.name || u);
    if (settingsRes.success && settingsRes.data) {
      state.shop = { ...state.shop, ...settingsRes.data };
    }

    if (!state.categories.length) state.categories = ['General', 'Others'];
    if (!state.units.length) state.units = ['Pcs', 'Kg', 'Box'];

  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────────
let currentSection = 'dashboard';

function showSection(name) {
  currentSection = name;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const nb = document.getElementById('nav-' + name);
  if (nb) nb.classList.add('active');
  renderSection(name);
}

function renderSection(name) {
  const c = document.getElementById('mainContent');
  c.innerHTML = '';

  switch (name) {
    case 'dashboard': renderDashboard(c); break;
    case 'stock': renderStock(c); break;
    case 'bill': renderBill(c); break;
    case 'history': renderHistory(c); break;
    case 'settings': renderSettings(c); break;
    case 'customers': renderCustomers(c); break;
  }
  updateTopbar();
}

function updateTopbar() {
  const logo = document.getElementById('topbarLogo');
  const title = document.getElementById('topbarTitle');
  title.textContent = state.shop.name;
  if (state.shop.logo) {
    logo.innerHTML = `<img src="${state.shop.logo}" alt="logo">`;
  } else {
    logo.innerHTML = state.shop.name.substring(0, 3).toUpperCase() || 'SMS';
  }
}

// ─── 1. Dashboard Section ─────────────────────────────────────────────────────
async function renderDashboard(c) {
  c.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">⏳ Loading Analytics...</div>`;

  try {
    const res = await apiFetch('/dashboard');
    if (!res.success || !res.data) throw new Error(res.message);

    const stats = res.data;
    const lowStockCount = stats.items.lowStockCount || 0;
    const todayRev = stats.revenue.today || 0;
    const totalRev = stats.revenue.total || 0;
    const todayBillsCount = stats.bills.today || 0;
    const totalItemsCount = stats.items.total || 0;

    c.innerHTML = `
    <div class="fade-in">
      ${lowStockCount > 0 ? `<div class="alert alert-warn">⚠ ${lowStockCount} item${lowStockCount > 1 ? 's' : ''} running low on stock!</div>` : ''}

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${totalItemsCount}</div>
          <div class="stat-label">Total Items</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${lowStockCount > 0 ? 'var(--danger)' : 'var(--success)'};">${lowStockCount}</div>
          <div class="stat-label">Low Stock</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${state.shop.currency}${todayRev.toFixed(0)}</div>
          <div class="stat-label">Today's Revenue</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${todayBillsCount}</div>
          <div class="stat-label">Today's Bills</div>
        </div>
      </div>

      ${currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Owner') ? `
      <div class="card">
        <div class="card-header">
          <h3>Admin Controls</h3>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${currentUser.role === 'Admin' ? `<button class="btn-secondary" onclick="openShopsModal()">🏪 Manage Shops</button>` : ''}
          <button class="btn-secondary" onclick="openUsersModal()">👥 Manage Users</button>
          <button class="btn-secondary" onclick="openCustomersModal()">📱 Customers</button>
          <button class="btn-secondary" onclick="openReportsModal()">📊 Download Reports</button>
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <h3>Quick Actions</h3>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button class="btn-primary" onclick="showSection('bill')" style="padding:14px;font-size:14px;">🧾 New Bill</button>
          <button class="btn-secondary" onclick="openAddItem()" style="padding:14px;font-size:14px;">➕ Add Item</button>
          <button class="btn-secondary" onclick="openStockIn()" style="padding:14px;font-size:14px;">📥 Stock In</button>
          <button class="btn-secondary" onclick="openStockOut()" style="padding:14px;font-size:14px;">📤 Stock Out</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Recent Bills</h3></div>
        ${!stats.recentBills || stats.recentBills.length === 0 ? '<div class="empty-state" style="padding:20px"><p>No bills generated yet</p></div>' :
          stats.recentBills.map(b => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-size:14px;font-weight:700;">#${b.bill_number || b.billNo}</div>
                <div style="font-size:11px;color:var(--text-muted);">${b.customer_name || 'Walk-in'} · ${formatDate(b.created_at || b.date)}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:15px;font-weight:800;color:var(--brown);">${state.shop.currency}${(b.total || 0).toFixed(2)}</div>
                <button class="btn-sm btn-secondary" onclick="viewBill('${b.id}')" style="margin-top:4px;">View</button>
              </div>
            </div>
          `).join('')
        }
      </div>

      ${stats.items.lowStockItems && stats.items.lowStockItems.length > 0 ? `
      <div class="card">
        <div class="card-header"><h3>⚠ Low Stock Alerts</h3></div>
        ${stats.items.lowStockItems.map(i => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
            <div style="font-size:14px;font-weight:600;">📦 ${i.name}</div>
            <span class="badge badge-danger">${i.stock} ${i.unit}</span>
          </div>
        `).join('')}
      </div>` : ''}
    </div>`;
  } catch (err) {
    c.innerHTML = `<div class="alert alert-warn">Failed to load dashboard statistics: ${err.message}</div>`;
  }
}

// ─── 2. Billing Section (LIST VIEW & TAP TO ADD QUANTITY) ─────────────────────
let billSearchQuery = '';
let billSelectedCat = 'All';

async function renderBill(c) {
  // Fetch fresh items for billing list view
  try {
    const res = await apiFetch('/items');
    if (res.success) state.items = res.data || [];
  } catch (e) {}

  const filteredItems = state.items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(billSearchQuery.toLowerCase());
    const matchCat = billSelectedCat === 'All' || i.category === billSelectedCat;
    return matchSearch && matchCat;
  });

  const subtotal = billCart.reduce((s, item) => s + item.qty * item.price, 0);
  const tax = subtotal * (state.shop.taxRate || 0) / 100;
  const total = subtotal + tax;

  c.innerHTML = `
  <div class="fade-in">
    <!-- Customer Info Card -->
    <div class="card" style="padding:12px 14px;margin-bottom:10px;">
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Customer Name</label>
          <input type="text" id="billCustName" placeholder="Walk-in Customer" value="${billCustomer.name}" oninput="billCustomer.name=this.value">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Customer Phone</label>
          <input type="tel" id="billCustPhone" placeholder="Mobile Number" value="${billCustomer.phone}" oninput="billCustomer.phone=this.value">
        </div>
      </div>
    </div>

    <!-- Instant Search & Category Filter -->
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input type="text" id="billSearchInput" placeholder="Search items by name..." value="${billSearchQuery}" oninput="billSearchQuery=this.value;renderSection('bill')">
    </div>

    <!-- Item List View for Billing -->
    <div class="card" style="padding:12px;">
      <div class="card-header" style="margin-bottom:8px;">
        <h3>Select Items</h3>
        <span style="font-size:12px;color:var(--text-muted);">${filteredItems.length} items found</span>
      </div>

      <div style="max-height:340px;overflow-y:auto;padding-right:2px;">
        ${filteredItems.length === 0 ? '<div style="text-align:center;padding:30px;color:var(--text-muted);">No items found. Add items to inventory first.</div>' :
          filteredItems.map(i => {
            const inCart = billCart.find(c => c.itemId === i.id);
            const cartQty = inCart ? inCart.qty : 0;
            return `
              <div class="bill-item-card ${cartQty > 0 ? 'selected' : ''}">
                <div class="stock-icon">📦</div>
                <div class="bill-item-info">
                  <div class="bill-item-name">${i.name}</div>
                  <div class="bill-item-meta">${state.shop.currency}${(i.selling_price || i.price || 0).toFixed(2)} / ${i.unit} · Stock: ${i.stock}</div>
                </div>

                <div class="qty-stepper">
                  ${cartQty > 0 ? `
                    <button class="qty-btn" onclick="decrementCartItem('${i.id}')"> - </button>
                    <span class="qty-val">${cartQty}</span>
                  ` : ''}
                  <button class="qty-btn plus" onclick="incrementCartItem('${i.id}')"> + </button>
                </div>
              </div>
            `;
          }).join('')
        }
      </div>
    </div>

    <!-- Cart Summary & Checkout -->
    ${billCart.length > 0 ? `
    <div class="card fade-in" style="margin-top:12px;">
      <div class="card-header">
        <h3>Current Order (${billCart.length} item${billCart.length > 1 ? 's' : ''})</h3>
        <button class="btn-sm btn-secondary" onclick="billCart=[];renderSection('bill')">Clear All</button>
      </div>

      <div style="max-height:160px;overflow-y:auto;margin-bottom:10px;">
        ${billCart.map((item, idx) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border);font-size:13px;">
            <div>
              <span style="font-weight:600;">${item.name}</span>
              <span style="font-size:11px;color:var(--text-muted);"> (${item.qty} x ${state.shop.currency}${item.price.toFixed(2)})</span>
            </div>
            <div style="font-weight:700;">${state.shop.currency}${(item.qty * item.price).toFixed(2)}</div>
          </div>
        `).join('')}
      </div>

      <div class="bill-summary">
        <div class="summary-row"><span>Subtotal</span><span>${state.shop.currency}${subtotal.toFixed(2)}</span></div>
        ${state.shop.taxRate > 0 ? `<div class="summary-row"><span>Tax (${state.shop.taxRate}%)</span><span>${state.shop.currency}${tax.toFixed(2)}</span></div>` : ''}
        <div class="summary-row summary-total"><span>Total Payable</span><span>${state.shop.currency}${total.toFixed(2)}</span></div>
      </div>

      <button class="btn-primary" style="width:100%;margin-top:14px;padding:14px;font-size:16px;" onclick="generateBillSubmit()">🧾 Complete & Print Bill</button>
    </div>` : ''}
  </div>`;
}

function incrementCartItem(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  const existing = billCart.find(c => c.itemId === itemId);
  if (existing) {
    if (existing.qty + 1 > item.stock) {
      alert(`Only ${item.stock} ${item.unit} available in stock!`);
      return;
    }
    existing.qty += 1;
  } else {
    if (item.stock < 1) {
      alert(`Item is out of stock!`);
      return;
    }
    billCart.push({
      itemId: item.id,
      name: item.name,
      price: item.selling_price || item.price || 0,
      qty: 1,
      stock: item.stock,
      unit: item.unit
    });
  }

  renderSection('bill');
}

function decrementCartItem(itemId) {
  const existingIndex = billCart.findIndex(c => c.itemId === itemId);
  if (existingIndex >= 0) {
    if (billCart[existingIndex].qty > 1) {
      billCart[existingIndex].qty -= 1;
    } else {
      billCart.splice(existingIndex, 1);
    }
  }
  renderSection('bill');
}

async function generateBillSubmit() {
  if (billCart.length === 0) {
    alert('Please add at least one item to the bill');
    return;
  }

  const subtotal = billCart.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = subtotal * (state.shop.taxRate || 0) / 100;
  const total = subtotal + tax;

  const payload = {
    customerName: billCustomer.name.trim() || 'Walk-in Customer',
    customerPhone: billCustomer.phone.trim(),
    items: billCart,
    subtotal,
    tax,
    total,
    paymentMode: 'Cash'
  };

  try {
    const res = await apiFetch('/bills', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.success && res.data) {
      const generatedBill = res.data;
      toast('✅ Bill Generated Successfully!');

      billCart = [];
      billCustomer = { name: '', phone: '' };

      showBillReceipt(generatedBill);
    }
  } catch (err) {
    alert(err.message || 'Failed to generate bill');
  }
}

function showBillReceipt(bill) {
  const receiptHtml = buildReceipt(bill);
  showModal(`Bill #${bill.bill_number || bill.billNo}`, `
    ${receiptHtml}
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn-primary" style="flex:1;" onclick="printBill('${bill.id}')">🖨 Print Receipt</button>
      <button class="btn-secondary" style="flex:1;" onclick="closeModal();showSection('bill')">✅ Done</button>
    </div>
  `);
}

function buildReceipt(bill) {
  const b = state.shop;
  const dt = new Date(bill.created_at || bill.date || Date.now());
  const dateStr = dt.toLocaleDateString('en-IN');
  const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const items = bill.items || [];

  return `
    <div class="receipt">
      <div class="receipt-center">
        ${b.logo ? `<img src="${b.logo}" class="receipt-logo" alt="logo">` : `<div class="receipt-logo-placeholder">${b.name.substring(0,3).toUpperCase()}</div>`}
        <div style="font-weight:700;font-size:15px;">${b.name}</div>
        ${b.tagline ? `<div style="font-size:11px;">${b.tagline}</div>` : ''}
        ${b.address ? `<div style="font-size:10px;">${b.address}</div>` : ''}
        ${b.phone ? `<div style="font-size:10px;">📞 ${b.phone}</div>` : ''}
        ${b.gst ? `<div style="font-size:10px;">GST: ${b.gst}</div>` : ''}
      </div>
      <div class="receipt-divider"></div>
      <div class="receipt-row"><span>Bill No:</span><span>#${bill.bill_number || bill.billNo}</span></div>
      <div class="receipt-row"><span>Date:</span><span>${dateStr} ${timeStr}</span></div>
      ${bill.customer_name || bill.customerName ? `<div class="receipt-row"><span>Customer:</span><span>${bill.customer_name || bill.customerName}</span></div>` : ''}
      ${bill.customer_phone || bill.customerPhone ? `<div class="receipt-row"><span>Phone:</span><span>${bill.customer_phone || bill.customerPhone}</span></div>` : ''}
      <div class="receipt-divider"></div>
      <div class="receipt-row" style="font-weight:700;"><span>Item</span><span>Qty x Price = Amt</span></div>
      <div class="receipt-divider"></div>
      ${items.map(bi => `
        <div style="margin-bottom:4px;font-size:11px;">
          <div>${bi.name}</div>
          <div class="receipt-row"><span></span><span>${bi.qty} x ${b.currency}${bi.price.toFixed(2)} = ${b.currency}${(bi.total || bi.qty*bi.price).toFixed(2)}</span></div>
        </div>
      `).join('')}
      <div class="receipt-divider"></div>
      <div class="receipt-row"><span>Subtotal</span><span>${b.currency}${(bill.subtotal || 0).toFixed(2)}</span></div>
      ${(bill.tax || 0) > 0 ? `<div class="receipt-row"><span>Tax</span><span>${b.currency}${bill.tax.toFixed(2)}</span></div>` : ''}
      <div class="receipt-divider"></div>
      <div class="receipt-row" style="font-weight:800;font-size:14px;"><span>TOTAL</span><span>${b.currency}${(bill.total || 0).toFixed(2)}</span></div>
      <div class="receipt-divider"></div>
      <div class="receipt-center" style="font-size:11px;margin-top:6px;">Thank you for your visit!<br>Please come again 🙏</div>
    </div>
  `;
}

function printBill(billId) {
  const pa = document.getElementById('printArea');
  pa.innerHTML = document.querySelector('.receipt').outerHTML;
  pa.style.display = 'block';
  window.print();
  pa.style.display = 'none';
}

// ─── 3. Stock & Items Section ─────────────────────────────────────────────────
let stockTab = 'all';
let stockSearch = '';

async function renderStock(c) {
  try {
    const res = await apiFetch(`/items?search=${encodeURIComponent(stockSearch)}`);
    if (res.success) state.items = res.data || [];
  } catch (e) {}

  c.innerHTML = `
  <div class="fade-in">
    <div class="tabs">
      <button class="tab ${stockTab === 'all' ? 'active' : ''}" onclick="setStockTab('all')">All Items</button>
      <button class="tab ${stockTab === 'in' ? 'active' : ''}" onclick="setStockTab('in')">Stock In</button>
      <button class="tab ${stockTab === 'out' ? 'active' : ''}" onclick="setStockTab('out')">Stock Out</button>
    </div>

    ${stockTab === 'all' ? renderAllStock() : ''}
    ${stockTab === 'in' ? renderStockInForm() : ''}
    ${stockTab === 'out' ? renderStockOutForm() : ''}
  </div>`;
}

function setStockTab(t) { stockTab = t; renderSection('stock'); }

function renderAllStock() {
  return `
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input type="text" placeholder="Search inventory..." value="${stockSearch}" oninput="stockSearch=this.value;renderSection('stock')">
    </div>
    <button class="btn-primary" style="width:100%;margin-bottom:12px;" onclick="openAddItem()">➕ Add New Item</button>

    ${state.items.length === 0 ? `<div class="empty-state"><div class="empty-state-icon">📦</div><p>No items found in inventory.</p></div>` :
      state.items.map(item => `
        <div class="stock-item ${item.stock <= state.shop.lowStockAlert ? 'low-stock' : 'ok-stock'}">
          <div class="stock-icon">📦</div>
          <div class="stock-info">
            <div class="stock-name">${item.name}</div>
            <div class="stock-meta">Sell: ${state.shop.currency}${(item.selling_price || item.price || 0).toFixed(2)} · ${item.category || 'General'}</div>
          </div>
          <div class="stock-qty">
            <div class="qty-num">${item.stock || item.qty || 0}</div>
            <div class="qty-unit">${item.unit || 'Pcs'}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button class="btn-sm btn-secondary" onclick="openEditItem('${item.id}')">✏</button>
            <button class="btn-sm btn-danger" onclick="deleteItem('${item.id}')">🗑</button>
          </div>
        </div>
      `).join('')
    }
  `;
}

function renderStockInForm() {
  return `
    <div class="card">
      <h3 style="margin-bottom:14px;">📥 Stock In</h3>
      <div class="form-group">
        <label class="form-label">Select Item</label>
        <select id="siItem">
          <option value="">Choose item...</option>
          ${state.items.map(i => `<option value="${i.id}">📦 ${i.name} (Current: ${i.stock} ${i.unit})</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Quantity</label>
          <input type="number" id="siQty" placeholder="0" min="0.01" step="0.01">
        </div>
        <div class="form-group">
          <label class="form-label">Supplier Name</label>
          <input type="text" id="siSupplier" placeholder="Optional">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input type="text" id="siNotes" placeholder="e.g. Received fresh delivery">
      </div>
      <button class="btn-success" style="width:100%;" onclick="doStockInSubmit()">✅ Confirm Stock In</button>
    </div>
  `;
}

function renderStockOutForm() {
  return `
    <div class="card">
      <h3 style="margin-bottom:14px;">📤 Stock Out</h3>
      <div class="form-group">
        <label class="form-label">Select Item</label>
        <select id="soItem">
          <option value="">Choose item...</option>
          ${state.items.map(i => `<option value="${i.id}">📦 ${i.name} (Current: ${i.stock} ${i.unit})</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Quantity</label>
          <input type="number" id="soQty" placeholder="0" min="0.01" step="0.01">
        </div>
        <div class="form-group">
          <label class="form-label">Reason</label>
          <select id="soReason">
            <option>Sold</option>
            <option>Damaged</option>
            <option>Expired</option>
            <option>Other</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input type="text" id="soNotes" placeholder="Additional details...">
      </div>
      <button class="btn-danger" style="width:100%;" onclick="doStockOutSubmit()">📤 Confirm Stock Out</button>
    </div>
  `;
}

async function doStockInSubmit() {
  const itemId = document.getElementById('siItem').value;
  const qty = parseFloat(document.getElementById('siQty').value);
  if (!itemId || isNaN(qty) || qty <= 0) { alert('Please select an item and enter valid quantity'); return; }

  try {
    const res = await apiFetch('/stock/in', {
      method: 'POST',
      body: JSON.stringify({ itemId, qty, supplier: document.getElementById('siSupplier').value, notes: document.getElementById('siNotes').value })
    });

    if (res.success) {
      toast('✅ Stock In recorded');
      renderSection('stock');
    }
  } catch (err) {
    alert(err.message || 'Failed stock in');
  }
}

async function doStockOutSubmit() {
  const itemId = document.getElementById('siItem').value;
  const qty = parseFloat(document.getElementById('soQty').value);
  if (!itemId || isNaN(qty) || qty <= 0) { alert('Please select an item and enter valid quantity'); return; }

  try {
    const res = await apiFetch('/stock/out', {
      method: 'POST',
      body: JSON.stringify({ itemId, qty, reason: document.getElementById('soReason').value, notes: document.getElementById('soNotes').value })
    });

    if (res.success) {
      toast('📤 Stock Out recorded');
      renderSection('stock');
    }
  } catch (err) {
    alert(err.message || 'Failed stock out');
  }
}

// Item Add / Edit Modal
function openAddItem() {
  showModal('Add New Item', `
    <div class="form-group">
      <label class="form-label">Item Name *</label>
      <input type="text" id="itemName" placeholder="Item Name" maxlength="150">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="itemCat">${state.categories.map(c => `<option>${c}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Unit</label>
        <select id="itemUnit">${state.units.map(u => `<option>${u}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Buying Price (${state.shop.currency})</label>
        <input type="number" id="itemBuyPrice" placeholder="0.00" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">Selling Price (${state.shop.currency}) *</label>
        <input type="number" id="itemPrice" placeholder="0.00" min="0" step="0.01">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Initial Stock Quantity</label>
      <input type="number" id="itemQty" placeholder="0" min="0" step="0.01">
    </div>
    <button class="btn-primary" style="width:100%;" onclick="saveItemSubmit(null)">✅ Save Item</button>
  `);
}

function openEditItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;

  showModal('Edit Item', `
    <div class="form-group">
      <label class="form-label">Item Name *</label>
      <input type="text" id="itemName" value="${item.name}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="itemCat">${state.categories.map(c => `<option ${c === item.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Unit</label>
        <select id="itemUnit">${state.units.map(u => `<option ${u === item.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Buying Price (${state.shop.currency})</label>
        <input type="number" id="itemBuyPrice" value="${item.buy_price || 0}" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">Selling Price (${state.shop.currency}) *</label>
        <input type="number" id="itemPrice" value="${item.selling_price || item.price || 0}" min="0" step="0.01">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Current Stock</label>
      <input type="number" id="itemQty" value="${item.stock || item.qty || 0}" min="0" step="0.01">
    </div>
    <button class="btn-primary" style="width:100%;" onclick="saveItemSubmit('${id}')">💾 Save Changes</button>
  `);
}

async function saveItemSubmit(id) {
  const name = document.getElementById('itemName').value.trim();
  const buy_price = parseFloat(document.getElementById('itemBuyPrice').value) || 0;
  const selling_price = parseFloat(document.getElementById('itemPrice').value) || 0;
  const stock = parseFloat(document.getElementById('itemQty').value) || 0;

  if (!name) { alert('Item name is required'); return; }

  const payload = {
    name,
    category: document.getElementById('itemCat').value,
    unit: document.getElementById('itemUnit').value,
    buy_price,
    selling_price,
    stock
  };

  try {
    const res = await apiFetch(id ? `/items/${id}` : '/items', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      if (res.data && res.data.warning) {
        alert(res.data.warning);
      }
      closeModal();
      toast(id ? '✅ Item updated' : '✅ Item created');
      renderSection('stock');
    }
  } catch (err) {
    alert(err.message || 'Failed to save item');
  }
}

async function deleteItem(id) {
  if (!confirm('Are you sure you want to delete this item?')) return;
  try {
    const res = await apiFetch(`/items/${id}`, { method: 'DELETE' });
    if (res.success) {
      toast('🗑 Item deleted');
      renderSection('stock');
    }
  } catch (e) {
    alert(e.message);
  }
}

// ─── 4. History Section ───────────────────────────────────────────────────────
async function renderHistory(c) {
  c.innerHTML = `
  <div class="fade-in">
    <div class="tabs">
      <button class="tab active" id="hTab-bills" onclick="switchHistoryTab('bills')">Bills History</button>
      <button class="tab" id="hTab-logs" onclick="switchHistoryTab('logs')">Stock Activity Log</button>
    </div>
    <div id="historyContent">⏳ Loading History...</div>
  </div>`;

  await renderHistoryBills();
}

function switchHistoryTab(t) {
  document.querySelectorAll('[id^="hTab-"]').forEach(b => b.classList.remove('active'));
  document.getElementById('hTab-' + t).classList.add('active');
  if (t === 'bills') renderHistoryBills();
  else renderHistoryLogs();
}

async function renderHistoryBills() {
  const hc = document.getElementById('historyContent');
  try {
    const res = await apiFetch('/bills');
    if (!res.success || !res.data || res.data.length === 0) {
      hc.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧾</div><p>No bills generated yet</p></div>';
      return;
    }

    hc.innerHTML = res.data.map(b => `
      <div class="card" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:700;font-size:15px;">#${b.bill_number || b.billNo}</div>
            <div style="font-size:12px;color:var(--text-muted);">${b.customer_name || 'Walk-in'} ${b.customer_phone ? '· ' + b.customer_phone : ''}</div>
            <div style="font-size:11px;color:var(--text-light);">${formatDateFull(b.created_at || b.date)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:17px;font-weight:800;color:var(--brown);">${state.shop.currency}${(b.total || 0).toFixed(2)}</div>
            <button class="btn-sm btn-secondary" style="margin-top:6px;" onclick="viewBill('${b.id}')">🧾 View</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    hc.innerHTML = `<div class="alert alert-warn">Failed to load bill history: ${e.message}</div>`;
  }
}

async function renderHistoryLogs() {
  const hc = document.getElementById('historyContent');
  try {
    const res = await apiFetch('/stock/logs');
    if (!res.success || !res.data || res.data.length === 0) {
      hc.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No stock log entries recorded</p></div>';
      return;
    }

    hc.innerHTML = res.data.map(l => `
      <div class="log-entry ${l.type === 'in' ? 'in' : 'out'}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:700;">
              ${l.type === 'in' ? '📥 Stock In' : '📤 Stock Out'}: ${l.item_name || l.itemName} (${l.quantity || l.qty})
            </div>
            ${l.supplier ? `<div style="font-size:11px;color:var(--text-muted);">Supplier: ${l.supplier}</div>` : ''}
            ${l.reason ? `<div style="font-size:11px;color:var(--text-muted);">Reason: ${l.reason}</div>` : ''}
            ${l.notes ? `<div style="font-size:11px;color:var(--text-muted);">${l.notes}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div class="log-time">${formatDateFull(l.created_at || l.date)}</div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    hc.innerHTML = `<div class="alert alert-warn">Failed to load logs</div>`;
  }
}

async function viewBill(id) {
  try {
    const res = await apiFetch(`/bills/${id}`);
    if (res.success && res.data) {
      showBillReceipt(res.data);
    }
  } catch (e) {
    alert(e.message);
  }
}

// ─── 5. Settings Section ──────────────────────────────────────────────────────
async function renderSettings(c) {
  c.innerHTML = `
  <div class="fade-in">
    <div class="card">
      <h3 style="margin-bottom:14px;">🏪 Shop Profile & Settings</h3>

      <div class="form-group" style="text-align:center;">
        <label class="form-label">Shop Logo</label>
        <div class="logo-upload" onclick="document.getElementById('logoFile').click()">
          ${state.shop.logo ? `<img src="${state.shop.logo}" class="logo-preview" alt="logo">` : `<div style="font-size:36px;">SMS</div>`}
          <div style="font-size:12px;color:var(--text-muted);">Tap to upload logo</div>
        </div>
        <input type="file" id="logoFile" accept="image/*" style="display:none;" onchange="uploadLogo(this)">
      </div>

      <div class="form-group">
        <label class="form-label">Shop Name *</label>
        <input type="text" id="setName" value="${state.shop.name}">
      </div>
      <div class="form-group">
        <label class="form-label">Address</label>
        <textarea id="setAddress" rows="2">${state.shop.address || ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input type="tel" id="setPhone" value="${state.shop.phone || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">GST Number</label>
          <input type="text" id="setGst" value="${state.shop.gst || ''}">
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:14px;">⚙ Financial & System Settings</h3>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Currency Symbol</label>
          <select id="setCurrency">
            ${['₹', '$', '€', '£', '¥', '₵'].map(curr => `<option ${state.shop.currency === curr ? 'selected' : ''}>${curr}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tax Rate (%)</label>
          <input type="number" id="setTax" value="${state.shop.taxRate || 0}" min="0" max="100" step="0.1">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Low Stock Alert Threshold</label>
        <input type="number" id="setLowStock" value="${state.shop.lowStockAlert || 5}" min="0">
      </div>
    </div>

    <button class="btn-primary" style="width:100%;padding:14px;font-size:16px;" onclick="saveSettingsSubmit()">💾 Save All Settings</button>
  </div>`;
}

function uploadLogo(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.shop.logo = e.target.result;
    renderSection('settings');
    updateTopbar();
  };
  reader.readAsDataURL(file);
}

async function saveSettingsSubmit() {
  const payload = {
    name: document.getElementById('setName').value.trim(),
    address: document.getElementById('setAddress').value.trim(),
    phone: document.getElementById('setPhone').value.trim(),
    gst: document.getElementById('setGst').value.trim(),
    currency: document.getElementById('setCurrency').value,
    taxRate: parseFloat(document.getElementById('setTax').value) || 0,
    lowStockAlert: parseInt(document.getElementById('setLowStock').value) || 5,
    logo: state.shop.logo
  };

  try {
    const res = await apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      state.shop = { ...state.shop, ...payload };
      updateTopbar();
      toast('✅ Settings saved');
    }
  } catch (err) {
    alert(err.message || 'Failed to save settings');
  }
}

// ─── 6. Reports Modal & Export ────────────────────────────────────────────────
function openReportsModal() {
  const today = new Date().toISOString().split('T')[0];

  showModal('📊 Export Reports', `
    <div class="form-group">
      <label class="form-label">Report Type</label>
      <select id="repType">
        <option value="Billing">Billing & Sales Report</option>
        <option value="Financial">Financial & Profit Report</option>
        <option value="Inventory">Inventory Stock Value Report</option>
        <option value="Low Stock">Low Stock Report</option>
        <option value="Stock Logs">Stock Activity Log</option>
        <option value="Customer">Customer Report</option>
      </select>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">From Date</label>
        <input type="date" id="repFrom" value="${today}">
      </div>
      <div class="form-group">
        <label class="form-label">To Date</label>
        <input type="date" id="repTo" value="${today}">
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-top:20px;">
      <button class="btn-primary" style="flex:1;padding:12px;" onclick="downloadReport('excel')">📗 Excel (.xlsx)</button>
      <button class="btn-accent" style="flex:1;padding:12px;" onclick="downloadReport('pdf')">📕 PDF (.pdf)</button>
    </div>
  `);
}

function downloadReport(format) {
  const type = document.getElementById('repType').value;
  const from = document.getElementById('repFrom').value;
  const to = document.getElementById('repTo').value;
  const token = localStorage.getItem('sms_token');

  const url = `${API_URL}/reports/${format}?type=${encodeURIComponent(type)}&from=${from}&to=${to}&token=${token}`;
  window.open(url, '_blank');
  closeModal();
  toast(`📥 Downloading ${type} ${format.toUpperCase()} Report...`);
}

// ─── 7. Admin & User Management Modals ────────────────────────────────────────
async function openUsersModal() {
  try {
    const [usersRes, permsRes] = await Promise.all([
      apiFetch('/users'),
      apiFetch('/roles/permissions')
    ]);

    const users = usersRes.data || [];
    const allPerms = permsRes.data || [];

    showModal('👥 Manage Users & RBAC', `
      <button class="btn-primary" style="width:100%;margin-bottom:14px;" onclick="openCreateUserModal('${allPerms.join(',')}')">➕ Add New User</button>
      <div style="max-height:300px;overflow-y:auto;">
        ${users.map(u => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
            <div>
              <div style="font-weight:700;">${u.name} (@${u.username})</div>
              <div style="font-size:11px;color:var(--text-muted);">Role: <strong>${u.role}</strong> · Shop: ${u.shop_name || u.shop_id}</div>
            </div>
            <span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">${u.status}</span>
          </div>
        `).join('')}
      </div>
    `);
  } catch (e) {
    alert('Failed to load users: ' + e.message);
  }
}

function openCreateUserModal(permsCsv) {
  const perms = permsCsv.split(',');
  showModal('Create User Account', `
    <div class="form-group">
      <label class="form-label">Full Name *</label>
      <input type="text" id="uName" placeholder="John Doe">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Username *</label>
        <input type="text" id="uUsername" placeholder="username">
      </div>
      <div class="form-group">
        <label class="form-label">Password *</label>
        <input type="password" id="uPassword" placeholder="••••••••">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Role</label>
      <select id="uRole">
        <option>Manager</option>
        <option>Cashier</option>
        <option>Staff</option>
        <option>Owner</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">Role Permissions (RBAC Checkboxes)</label>
      <div class="perm-grid">
        ${perms.map(p => `
          <label class="perm-item">
            <input type="checkbox" name="uPerm" value="${p}" checked> ${p}
          </label>
        `).join('')}
      </div>
    </div>

    <button class="btn-primary" style="width:100%;" onclick="createUserSubmit()">✅ Create User</button>
  `);
}

async function createUserSubmit() {
  const name = document.getElementById('uName').value.trim();
  const username = document.getElementById('uUsername').value.trim();
  const password = document.getElementById('uPassword').value;
  const role = document.getElementById('uRole').value;

  const checkboxes = document.querySelectorAll('input[name="uPerm"]:checked');
  const permissions = Array.from(checkboxes).map(c => c.value);

  if (!name || !username || !password) {
    alert('Name, username, and password are required');
    return;
  }

  try {
    const res = await apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify({ name, username, password, role, permissions })
    });

    if (res.success) {
      closeModal();
      toast('✅ User created');
    }
  } catch (err) {
    alert(err.message || 'Failed to create user');
  }
}

// ─── 8. Admin Multi-Shop Modal ────────────────────────────────────────────────
async function openShopsModal() {
  try {
    const res = await apiFetch('/shops');
    const shops = res.data || [];

    showModal('🏪 Multi-Shop Architecture', `
      <button class="btn-primary" style="width:100%;margin-bottom:14px;" onclick="openCreateShopModal()">➕ Add New Shop Branch</button>
      <div style="max-height:300px;overflow-y:auto;">
        ${shops.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
            <div>
              <div style="font-weight:700;">${s.shop_name} (${s.shop_code})</div>
              <div style="font-size:11px;color:var(--text-muted);">${s.address || 'No address'} · Currency: ${s.currency}</div>
            </div>
            <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}">${s.status}</span>
          </div>
        `).join('')}
      </div>
    `);
  } catch (e) {
    alert(e.message);
  }
}

function openCreateShopModal() {
  showModal('Add New Shop Branch', `
    <div class="form-group">
      <label class="form-label">Shop Name *</label>
      <input type="text" id="sName" placeholder="Downtown Bakery">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Shop Code *</label>
        <input type="text" id="sCode" placeholder="DT002">
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <input type="text" id="sCurrency" value="₹">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Shop Owner Username</label>
      <input type="text" id="sOwnerUsername" placeholder="owner_dt02">
    </div>
    <div class="form-group">
      <label class="form-label">Shop Owner Password</label>
      <input type="password" id="sOwnerPassword" placeholder="••••••••">
    </div>

    <button class="btn-primary" style="width:100%;" onclick="createShopSubmit()">✅ Create Shop</button>
  `);
}

async function createShopSubmit() {
  const shop_name = document.getElementById('sName').value.trim();
  const shop_code = document.getElementById('sCode').value.trim();
  const currency = document.getElementById('sCurrency').value.trim() || '₹';
  const owner_username = document.getElementById('sOwnerUsername').value.trim();
  const owner_password = document.getElementById('sOwnerPassword').value;

  if (!shop_name || !shop_code) {
    alert('Shop name and shop code are required');
    return;
  }

  try {
    const res = await apiFetch('/shops', {
      method: 'POST',
      body: JSON.stringify({ shop_name, shop_code, currency, owner_username, owner_password })
    });

    if (res.success) {
      closeModal();
      toast('✅ Shop created');
      await loadAdminShops();
    }
  } catch (e) {
    alert(e.message);
  }
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────
function showModal(title, body) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').style.display = 'none';
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatDateFull(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

let toastTimer;
function toast(msg) {
  let t = document.getElementById('toastMsg');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toastMsg';
    t.style = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--brown);color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;font-weight:600;z-index:999;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.style.opacity = '0', 2500);
}

// Quick Stock Helpers
function openStockIn() { showSection('stock'); stockTab = 'in'; renderSection('stock'); }
function openStockOut() { showSection('stock'); stockTab = 'out'; renderSection('stock'); }
function openCustomersModal() { showSection('customers'); }

// ─── App Initialize ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});