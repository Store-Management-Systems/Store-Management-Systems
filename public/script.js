const API_URL = '/api';
let state = { user: null, shopId: null, shops: [], items: [], cart: {} };

// --- Auth & RBAC ---
async function handleLogin() {
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  // 1. Prevent empty submissions
  if (!u || !p) {
    alert("Please type 'admin' in the Username box and 'admin123' in the Password box.");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/login`, { 
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({username: u, password: p}) 
    });

    const text = await res.text(); // Read raw response first
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      // 2. Catch server crashes (e.g., Render returning a 502 HTML error page)
      alert("Server is not responding correctly. It returned HTML instead of JSON. Ensure the Render Web Service is running.");
      console.error("Raw Server Response:", text);
      return;
    }

    // 3. Handle success or explicit backend rejection
    if(data.success) {
      localStorage.setItem('sms_token', data.token);
      document.getElementById('authOverlay').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      await loadApp();
    } else {
      alert("Login Rejected: " + data.message); // E.g., "Invalid credentials"
    }

  } catch(e) { 
    alert("Network Error: Could not connect to the backend server. " + e.message); 
  }
}

function logout() { localStorage.removeItem('sms_token'); location.reload(); }

async function authFetch(endpoint, options = {}) {
  const token = localStorage.getItem('sms_token');
  if(!token) { logout(); return; }
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  if(state.shopId) headers['X-Shop-ID'] = state.shopId;
  
  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  if(res.status === 401 || res.status === 403) { 
     if(res.status===401) logout(); 
     else alert("Access Denied."); 
     throw new Error("Auth error"); 
  }
  return res.json();
}

function checkPermissions() {
  if(state.user.role === 'admin') return;
  const perms = JSON.parse(state.user.permissions || '[]');
  document.querySelectorAll('[data-perm]').forEach(el => {
    if(!perms.includes(el.dataset.perm) && !perms.includes('ALL')) el.style.display = 'none';
  });
}

// --- App Initialization ---
async function loadApp() {
  const token = localStorage.getItem('sms_token');
  if(!token) return;
  state.user = JSON.parse(atob(token.split('.')[1]));
  
  if(state.user.role === 'admin') {
    let res = await authFetch('/shops');
    
    // Auto-create a default shop if the database is completely empty
    if (res.data.length === 0) {
        await authFetch('/shops', {
            method: 'POST',
            body: JSON.stringify({ name: "My Main Shop", address: "", phone: "" })
        });
        res = await authFetch('/shops'); // Re-fetch the newly created shop
    }

    state.shops = res.data;
    state.shopId = state.shops[0].id;
    
    const sel = document.getElementById('adminShopSelector');
    sel.style.display = 'block';
    sel.innerHTML = state.shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    sel.value = state.shopId;
  } else {
    state.shopId = state.user.shop_id;
  }
  
  checkPermissions();
  await fetchData();
  showSection('pos'); 
}

async function changeActiveShop(id) { state.shopId = id; await fetchData(); showSection(currentSection); }

async function fetchData() {
  if(!state.shopId) return;
  const res = await authFetch('/data');
  if(res.success) {
    state.items = res.data.items;
    document.getElementById('topbarTitle').innerText = res.data.settings.name || 'Shop Management';
  }
}

// --- Navigation ---
let currentSection = 'pos';
function showSection(name) {
  currentSection = name;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`nav-${name}`);
  if(btn) btn.classList.add('active');
  
  const c = document.getElementById('mainContent');
  if(name === 'pos') renderPOS(c);
  else if(name === 'reports') renderReports(c);
  else c.innerHTML = `<div class="card"><h2>${name.toUpperCase()}</h2><p>Integrated successfully. Construct specific UI here utilizing authFetch.</p></div>`;
}

// --- POS Redesign ---
function renderPOS(container) {
  let gridHtml = state.items.map(i => `
    <div class="pos-item-card" onclick="addToCart('${i.id}')">
      <div class="name">${i.name}</div>
      <div class="price">₹${i.selling_price}</div>
      <div style="font-size:10px; color:${i.stock>0?'green':'red'}">${i.stock > 0 ? i.stock+' in stock' : 'Out of Stock'}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="fade-in pos-layout">
      <div>
        <input type="text" placeholder="🔍 Search items..." style="margin-bottom:12px;" oninput="filterPOS(this.value)">
        <div class="pos-grid" id="posGrid">${gridHtml}</div>
      </div>
      <div class="pos-cart" id="posCartContainer">
        ${renderCartHTML()}
      </div>
    </div>
  `;
}

function addToCart(id) {
  const item = state.items.find(i => i.id === id);
  if(!item) return;
  if(state.cart[id]) state.cart[id].qty++;
  else state.cart[id] = { id, name: item.name, price: item.selling_price, qty: 1 };
  updateCartUI();
}

function modifyCart(id, amt) {
  if(!state.cart[id]) return;
  state.cart[id].qty += amt;
  if(state.cart[id].qty <= 0) delete state.cart[id];
  updateCartUI();
}

function renderCartHTML() {
  const items = Object.values(state.cart);
  const total = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
  
  let html = `<h3 style="margin-bottom:10px;">Current Bill</h3><div style="flex:1; overflow-y:auto; margin-bottom:10px;">`;
  if(items.length === 0) html += `<div style="text-align:center; color:#888; font-size:13px; margin-top:20px;">Cart is empty</div>`;
  
  items.forEach(i => {
    html += `
      <div class="cart-item">
        <div style="font-size:13px; font-weight:600; width:50%;">${i.name}</div>
        <div class="cart-qty-ctrl">
          <div class="cart-qty-btn" onclick="modifyCart('${i.id}', -1)">-</div>
          <span style="font-size:14px; width:20px; text-align:center;">${i.qty}</span>
          <div class="cart-qty-btn" onclick="modifyCart('${i.id}', 1)">+</div>
        </div>
        <div style="font-size:13px; font-weight:600;">₹${i.price * i.qty}</div>
      </div>
    `;
  });
  html += `</div>
    <div style="border-top:2px solid var(--border); padding-top:10px; display:flex; justify-content:space-between; font-weight:700; font-size:18px; margin-bottom:12px;">
      <span>Total:</span><span>₹${total}</span>
    </div>
    <button class="btn-primary w-100" onclick="checkoutBill(${total})">🧾 Generate Bill</button>
  `;
  return html;
}

function updateCartUI() { document.getElementById('posCartContainer').innerHTML = renderCartHTML(); }

async function checkoutBill(total) {
  const items = Object.values(state.cart);
  if(items.length === 0) return alert("Cart is empty");
  
  const res = await authFetch('/bills', { method: 'POST', body: JSON.stringify({
    customer_name: "Walk-in", items, subtotal: total, tax: 0, total
  })});
  
  if(res.success) {
    alert(`Bill ${res.data.bill_number} Generated Successfully!`);
    state.cart = {};
    await fetchData();
    renderPOS(document.getElementById('mainContent'));
  }
}

// --- Excel Reporting UI ---
function renderReports(container) {
  container.innerHTML = `
    <div class="card fade-in">
      <h2>Generate Reports</h2>
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">Export shop data directly to Excel (.xlsx)</p>
      
      <div class="form-group">
        <label class="form-label">Report Type</label>
        <select id="reportType">
          <option value="bills">Billing Report</option>
          <option value="inventory">Inventory & Stock</option>
        </select>
      </div>
      <button class="btn-primary w-100" onclick="downloadReport()">📥 Download Excel</button>
    </div>
  `;
}

async function downloadReport() {
  const type = document.getElementById('reportType').value;
  const token = localStorage.getItem('sms_token');
  let url = `${API_URL}/reports/export?type=${type}`;
  
  // Use standard browser fetch blob for file download
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'X-Shop-ID': state.shopId } });
  if(!res.ok) return alert("Failed to generate report");
  
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${type}-report.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Init Check
if(localStorage.getItem('sms_token')) {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  loadApp();
}