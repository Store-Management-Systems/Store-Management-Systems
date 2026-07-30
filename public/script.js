const API_URL = (typeof window !== 'undefined' && window.SMS_API_URL)
  ? window.SMS_API_URL
  : (typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.origin === 'null' || !window.location.origin || (window.location.port && window.location.port !== '3000')))
    ? 'http://localhost:3000/api'
    : '/api';

let currentUser = null;
let activeShopId = null;

let state = {
  shop: {
    name: 'STORE MANAGEMENT SYSTEMS',
    tagline: 'Quality & Service',
    address: '',
    phone: '',
    gst: '',
    logo: 'logo.png',
    currency: '₹',
    taxRate: 0,
    lowStockAlert: 5
  },
  items: [],
  categories: [],
  units: [],
  bills: [],
  logs: [],
  people: [],
  shops: [],
  users: [],
  roles: []
};

// Cart State for Billing List View
let billCart = []; // Array of { itemId, name, price, qty, stock, unit }
let billCustomer = { personId: null, name: '', phone: '' };
let billDiscount = 0;
let billDiscountType = 'rupees'; // 'rupees' or 'percent'
let billPaymentMode = 'Cash';
let billSplitPayments = [
  { mode: 'Cash', amount: 0 },
  { mode: 'UPI', amount: 0 }
];
let billPaidAmount = null;

// ─── 15-Minute Inactivity Session Timeout ─────────────────────────────────────
let inactivityTimer = null;
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (!localStorage.getItem('sms_token')) return;

  inactivityTimer = setTimeout(() => {
    handleSessionTimeout();
  }, SESSION_TIMEOUT_MS);
}

function handleSessionTimeout() {
  currentUser = null;
  localStorage.removeItem('sms_token');
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  alert('⏱ Session expired due to 15 minutes of inactivity. Please sign in again.');
}

['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetInactivityTimer, { passive: true });
});

// Helper to format numbers safely without crashing on strings/nulls
function fmtNum(val, decimals = 2) {
  const n = parseFloat(val);
  return isNaN(n) ? (0).toFixed(decimals) : n.toFixed(decimals);
}

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
    const contentType = response.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Server connection error (${response.status}): ${text.substring(0, 120)}`);
    }

    if (response.status === 401) {
      if (endpoint !== '/auth/login') {
        handleUnauthorized();
      }
      throw new Error(data.message || 'Invalid credentials');
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
async function updateApprovalBadge() {
  try {
    const btn = document.getElementById('btnTopApprovals');
    if (!btn) return;
    if (currentUser && currentUser.role === 'Admin') {
      const res = await apiFetch('/approvals?status=pending');
      if (res.success && Array.isArray(res.data)) {
        const count = res.data.length;
        btn.innerHTML = `🛡 Approvals ${count > 0 ? `<span style="background:#ef4444;color:#fff;padding:2px 6px;border-radius:10px;font-size:10px;margin-left:4px;">${count}</span>` : ''}`;
        btn.style.display = 'inline-flex';
        return;
      }
    }
    if (btn) btn.style.display = (currentUser && currentUser.role === 'Admin') ? 'inline-flex' : 'none';
  } catch (e) {
    console.error('Failed to update approval badge:', e);
  }
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

      resetInactivityTimer();

      try { updateRoleUI(); } catch (err) { console.error('Role UI update error:', err); }
      try { updateTopbar(); } catch (err) { console.error('Topbar error:', err); }
      try { await updateApprovalBadge(); } catch (err) { console.error('Approval badge error:', err); }
      try { await loadInitialData(); } catch (err) { console.error('Initial data error:', err); }
      try { showSection('dashboard'); } catch (err) { console.error('Section error:', err); }

      if (currentUser.branches && currentUser.branches.length > 1 && !sessionStorage.getItem('sms_branch_selected')) {
        try { openMultiBranchLoginModal(); } catch (err) { }
      }
    }
  } catch (e) {
    console.error('CheckAuth error:', e);
    handleUnauthorized();
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';
  const loginBtn = document.getElementById('loginBtn');
  const loginCard = document.getElementById('loginCardContainer');

  if (!username || !password) {
    showToast('Validation Error', 'Please enter username and password', 'warning');
    if (loginCard) {
      loginCard.classList.add('shake-error');
      setTimeout(() => loginCard.classList.remove('shake-error'), 400);
    }
    return;
  }

  try {
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = '⏳ Signing in...';
    }

    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    if (res.success && res.data && res.data.token) {
      localStorage.setItem('sms_token', res.data.token);
      currentUser = res.data.user;
      activeShopId = currentUser ? currentUser.shop_id : null;

      if (currentUser && currentUser.shop) {
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

      // Hide login overlay & reveal main application screen immediately
      const loginScreen = document.getElementById('loginScreen');
      const appScreen = document.getElementById('app');
      if (loginScreen) loginScreen.style.display = 'none';
      if (appScreen) appScreen.style.display = 'flex';

      resetInactivityTimer();

      try { updateRoleUI(); } catch (err) { console.error('Role UI update error:', err); }
      try { updateTopbar(); } catch (err) { console.error('Topbar error:', err); }
      try { await updateApprovalBadge(); } catch (err) { console.error('Approval badge error:', err); }
      try { await loadInitialData(); } catch (err) { console.error('Initial data error:', err); }
      try { showSection('dashboard'); } catch (err) { console.error('Section error:', err); }

      try {
        showToast('Welcome Back!', `Signed in as ${currentUser.name || currentUser.username}`, 'success');
      } catch (e) {
        alert('Welcome back!');
      }

      if (currentUser.branches && currentUser.branches.length > 1 && !sessionStorage.getItem('sms_branch_selected')) {
        try { openMultiBranchLoginModal(); } catch (err) { }
      }
    } else {
      if (loginCard) {
        loginCard.classList.add('shake-error');
        setTimeout(() => loginCard.classList.remove('shake-error'), 400);
      }
      alert(res.message || 'Invalid username or password');
    }
  } catch (err) {
    if (loginCard) {
      loginCard.classList.add('shake-error');
      setTimeout(() => loginCard.classList.remove('shake-error'), 400);
    }
    alert(err.message || 'Invalid credentials');
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = '🔐 Sign In';
    }
  }
}

async function handleLogout() {
  if (!confirm('Are you sure you want to log out?')) return;
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch (e) { }
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
        <option value="${s.id}" ${s.id === activeShopId ? 'selected' : ''}>🏢 ${s.shop_name}</option>
      `).join('');
      document.getElementById('topbarAdminShopSelect').style.display = 'block';
    }
  } catch (e) { }
}

function loadMultiBranchDropdown() {
  if (!currentUser || !currentUser.branches) return;
  state.shops = currentUser.branches;
  const select = document.getElementById('adminShopDropdown');
  select.innerHTML = currentUser.branches.map(s => `
    <option value="${s.id}" ${s.id === activeShopId ? 'selected' : ''}>🏢 ${s.shop_name || s.name}</option>
  `).join('');
  document.getElementById('topbarAdminShopSelect').style.display = 'block';
}

function openMultiBranchLoginModal() {
  if (!currentUser || !currentUser.branches || currentUser.branches.length <= 1) return;
  sessionStorage.setItem('sms_branch_selected', 'true');

  const branchesHtml = `
    <div style="padding:4px;">
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">Your account has full management access to <strong>${currentUser.branches.length} branches</strong>. Select a branch to open:</p>
      <div style="display:grid;grid-template-columns:1fr;gap:10px;max-height:360px;overflow-y:auto;">
        ${currentUser.branches.map(b => `
          <div onclick="handleAdminShopSwitch('${b.id}');closeModal();" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid var(--border-light);border-radius:12px;background:#fff;cursor:pointer;transition:all 0.2s ease;">
            <div>
              <div style="font-weight:700;font-size:15px;color:var(--text-primary);">${b.shop_name || b.name}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Code: ${b.shop_code} ${b.address ? '· ' + b.address : ''}</div>
            </div>
            <button class="btn-sm btn-primary">Select Branch ➔</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  showModal(`🏢 Select Branch to Access (${currentUser.branches.length} Branches)`, branchesHtml);
}

async function handleAdminShopSwitch(shopId) {
  activeShopId = shopId;
  const targetShop = state.shops.find(s => s.id === shopId);
  if (targetShop) {
    state.shop.name = targetShop.shop_name || targetShop.name;
    state.shop.currency = targetShop.currency || '₹';
    state.shop.taxRate = targetShop.tax_rate || 0;
  }
  updateTopbar();
  await loadInitialData();
  renderSection(currentSection);
  toast(`Switched branch to ${targetShop ? (targetShop.shop_name || targetShop.name) : shopId}`);
}

function updateTopbar() {
  const logoEl = document.getElementById('topbarLogo');
  const titleEl = document.getElementById('topbarTitle');
  const loginLogoEl = document.getElementById('loginLogo');
  const loginShopNameEl = document.getElementById('loginShopName');
  const sidebarLogoImg = document.getElementById('sidebarLogoImg');

  const logoSrc = (state.shop && state.shop.logo) ? state.shop.logo : 'logo.png';
  const shopTitle = (state.shop && state.shop.name) ? state.shop.name : 'STORE MANAGEMENT SYSTEMS';

  if (logoEl) {
    logoEl.innerHTML = `<img src="${logoSrc}" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
  }
  if (sidebarLogoImg) {
    sidebarLogoImg.src = logoSrc;
  }
  if (titleEl) {
    titleEl.textContent = shopTitle;
  }
  if (loginLogoEl) {
    loginLogoEl.innerHTML = `<img src="${logoSrc}" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:20px;">`;
  }
  if (loginShopNameEl) {
    loginShopNameEl.textContent = shopTitle;
  }

  if (currentUser) {
    const pillName = document.getElementById('userPillName');
    const pillRole = document.getElementById('userPillRole');
    const avatarCircle = document.getElementById('userAvatarCircle');

    if (pillName) pillName.textContent = currentUser.name || currentUser.username;
    if (pillRole) pillRole.textContent = currentUser.role || 'STAFF';
    if (avatarCircle) avatarCircle.textContent = (currentUser.name || currentUser.username || 'A').charAt(0).toUpperCase();
  }
}

function updateRoleUI() {
  if (!currentUser) return;
  const role = currentUser.role;

  const adminShopSelect = document.getElementById('topbarAdminShopSelect');
  const sideOrgs = document.getElementById('side-organizations');
  const sidePeople = document.getElementById('side-people');
  const sideStock = document.getElementById('side-stock');
  const sideBill = document.getElementById('side-bill');
  const sideAnalytics = document.getElementById('side-analytics');

  if (role === 'Admin') {
    // 1. Hide topbar shop switcher for Admin (Superadmin manages Organizations, not individual branch switching)
    if (adminShopSelect) adminShopSelect.style.display = 'none';

    // 2. Show Admin-specific sidebar items & hide operational items (POS Billing, Stock, Parties)
    if (sideOrgs) sideOrgs.style.display = 'flex';
    if (sidePeople) sidePeople.style.display = 'none';
    if (sideStock) sideStock.style.display = 'none';
    if (sideBill) sideBill.style.display = 'none';
    if (sideAnalytics) sideAnalytics.style.display = 'none';
  } else if (role === 'Owner') {
    // Owner sees branch selector if multiple branches exist for their organization
    if (currentUser.branches && currentUser.branches.length > 1) {
      loadMultiBranchDropdown();
    } else if (adminShopSelect) {
      adminShopSelect.style.display = 'none';
    }

    if (sideOrgs) sideOrgs.style.display = 'none';
    if (sidePeople) sidePeople.style.display = 'flex';
    if (sideStock) sideStock.style.display = 'flex';
    if (sideBill) sideBill.style.display = 'flex';
    if (sideAnalytics) sideAnalytics.style.display = 'flex';
  } else {
    // Manager / Staff
    if (adminShopSelect) adminShopSelect.style.display = 'none';
    if (sideOrgs) sideOrgs.style.display = 'none';
    if (sidePeople) sidePeople.style.display = 'flex';
    if (sideStock) sideStock.style.display = 'flex';
    if (sideBill) sideBill.style.display = 'flex';
    if (sideAnalytics) sideAnalytics.style.display = 'flex';
  }
}

// ─── Load Initial Backend Data ────────────────────────────────────────────────
async function loadInitialData() {
  try {
    const [itemsRes, catsRes, unitsRes, settingsRes, peopleRes] = await Promise.all([
      apiFetch('/items'),
      apiFetch('/categories'),
      apiFetch('/units'),
      apiFetch('/settings'),
      apiFetch('/people')
    ]);

    if (itemsRes.success) state.items = itemsRes.data || [];
    if (catsRes.success) state.categories = (catsRes.data || []).map(c => c.name || c);
    if (unitsRes.success) state.units = (unitsRes.data || []).map(u => u.name || u);
    if (peopleRes.success) state.people = peopleRes.data || [];
    if (settingsRes.success && settingsRes.data) {
      state.shop = { ...state.shop, ...settingsRes.data };
      if (!state.shop.logo) state.shop.logo = 'logo.png';
    }

    updateTopbar();

    if (!state.categories.length) state.categories = ['General', 'Others'];
    if (!state.units.length) state.units = ['Pcs', 'Kg', 'Box'];

  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// ─── Navigation & Enterprise Theme Engine ─────────────────────────────────────
let currentSection = 'dashboard';

function showSection(name) {
  currentSection = name;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));

  const nb = document.getElementById('nav-' + name);
  if (nb) nb.classList.add('active');

  const sb = document.getElementById('side-' + name);
  if (sb) sb.classList.add('active');

  const secTitleEl = document.getElementById('currentSectionTitle');
  if (secTitleEl) {
    const titles = {
      dashboard: 'Dashboard',
      people: 'Parties & Customers',
      stock: 'Inventory Stock',
      bill: 'POS Billing',
      analytics: 'Financial Analytics',
      history: 'Audit History',
      settings: 'Settings'
    };
    secTitleEl.textContent = titles[name] || name.charAt(0).toUpperCase() + name.slice(1);
  }

  // Close mobile sidebar if open
  const sidebar = document.getElementById('appSidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');

  renderSection(name);
}

function renderSection(name) {
  const c = document.getElementById('mainContent');
  c.innerHTML = '';

  switch (name) {
    case 'dashboard': renderDashboard(c); break;
    case 'people': renderPeopleSection(c); break;
    case 'stock': renderStock(c); break;
    case 'bill': renderBill(c); break;
    case 'analytics': renderAnalytics(c); break;
    case 'history': renderHistory(c); break;
    case 'settings': renderSettings(c); break;
    case 'customers': renderPeopleSection(c, 'Customer'); break;
  }
  updateTopbar();
}

// ─── 1. Dashboard Section ─────────────────────────────────────────────────────
async function renderDashboard(c, overrideRange = null, overrideBranch = null) {
  c.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">⏳ Loading Dashboard...</div>`;

  try {
    let url = '/dashboard';
    const params = [];
    if (overrideRange) params.push(`range=${encodeURIComponent(overrideRange)}`);
    if (overrideBranch) params.push(`branch_id=${encodeURIComponent(overrideBranch)}`);
    if (params.length > 0) url += '?' + params.join('&');

    const res = await apiFetch(url);
    if (!res.success || !res.data) throw new Error(res.message);

    const stats = res.data;

    // -------------------------------------------------------------
    // 1. ADMIN DASHBOARD VIEW (Organization & Subscription Overview)
    // -------------------------------------------------------------
    if (stats.mode === 'Admin') {
      const m = stats.metrics || {};
      const subs = m.subscriptions || { active: 0, expiringSoon: 0, expired: 0 };
      const orgs = stats.organizations || [];

      c.innerHTML = `
      <div class="fade-in">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
          <div>
            <h2 style="font-size:22px;font-weight:800;color:var(--text-primary);">🏢 Super Admin Dashboard</h2>
            <div style="font-size:13px;color:var(--text-muted);">Manage Organizations, Branch-Based Subscriptions & Tenants</div>
          </div>
          <button class="btn-primary" onclick="openCreateOrganizationModal()">➕ Create Organization</button>
        </div>

        <div class="stats-grid" style="grid-template-columns:repeat(4, 1fr);">
          <div class="stat-card">
            <div class="stat-value" style="color:var(--ios-blue);">${m.totalOrganizations || 0}</div>
            <div class="stat-label">Total Organizations</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color:var(--ios-green);">${m.activeOrganizations || 0}</div>
            <div class="stat-label">Active Organizations</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color:var(--ios-orange);">${subs.expiringSoon || 0}</div>
            <div class="stat-label">Expiring Subscriptions</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color:var(--ios-red);">${subs.expired || 0}</div>
            <div class="stat-label">Expired Subscriptions</div>
          </div>
        </div>

        <div class="card" style="margin-top:16px;">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
            <h3>🏢 Organization Directory & Branch-Based Subscriptions</h3>
            <button class="btn-sm btn-secondary" onclick="openOrganizationsModal()">⚙ Manage Directory</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Code</th>
                  <th>Owner</th>
                  <th>Active Branches</th>
                  <th>Price / Branch</th>
                  <th>Current Subscription</th>
                  <th>Plan & Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${orgs.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">No organizations created yet</td></tr>' :
          orgs.map(o => {
            const activeCount = o.active_branches_count !== undefined ? o.active_branches_count : o.branches_count;
            const pricePerBranch = o.price_per_branch || 999;
            const subAmount = activeCount * pricePerBranch;
            return `
                    <tr>
                      <td style="font-weight:700;">${o.name}</td>
                      <td><code>${o.code}</code></td>
                      <td>
                        <div style="font-weight:600;">${o.owner ? o.owner.name : (o.owner_name || 'Unassigned')}</div>
                        <div style="font-size:11px;color:var(--text-muted);">${o.owner ? '@' + o.owner.username : ''}</div>
                      </td>
                      <td style="font-weight:700;color:var(--ios-blue);">${activeCount} Active Branch${activeCount !== 1 ? 'es' : ''}</td>
                      <td style="font-weight:600;">${state.shop.currency}${fmtNum(pricePerBranch, 0)}</td>
                      <td style="font-weight:800;color:var(--ios-green);font-size:15px;">${state.shop.currency}${fmtNum(subAmount, 0)} <span style="font-size:10px;font-weight:400;color:var(--text-muted);">(${activeCount} × ${state.shop.currency}${pricePerBranch})</span></td>
                      <td>
                        <span class="badge badge-info">${o.subscription_plan || 'Standard'}</span>
                        <span class="badge ${o.subscription_status === 'Expired' ? 'badge-danger' : (o.subscription_status === 'Expiring Soon' ? 'badge-warning' : 'badge-success')}">${o.subscription_status || 'Active'}</span>
                      </td>
                      <td>
                        <div style="display:flex;gap:4px;">
                          <button class="btn-sm btn-secondary" onclick="openOrganizationDetailsModal('${o.id}')" title="View Subscription Details & Breakdown">🔍 Details</button>
                          <button class="btn-sm btn-secondary" onclick="openEditOrganizationModal('${o.id}')" title="Edit / Assign Owner">✏ Edit</button>
                          <button class="btn-sm btn-danger" onclick="confirmDeleteOrganizationModal('${o.id}', '${o.name}')" title="Delete Organization & Cascade Branches">🗑 Delete</button>
                        </div>
                      </td>
                    </tr>
                    `;
          }).join('')
        }
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
      return;
    }

    // -------------------------------------------------------------
    // 2. OWNER DASHBOARD VIEW (Organization & Branch-wise Sales)
    // -------------------------------------------------------------
    if (stats.mode === 'Owner') {
      const org = stats.organization || {};
      const sum = stats.summary || {};
      const perf = stats.branchPerformance || [];
      const activeCount = org.active_branches_count !== undefined ? org.active_branches_count : (sum.activeBranches || perf.filter(b => b.status === 'active').length);
      const pricePerBranch = org.price_per_branch || 999;
      const subAmount = activeCount * pricePerBranch;

      c.innerHTML = `
      <div class="fade-in">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
          <div>
            <h2 style="font-size:22px;font-weight:800;color:var(--text-primary);">🏢 ${org.name || 'Organization Dashboard'}</h2>
            <div style="font-size:13px;color:var(--text-muted);">
              Plan: <strong>${org.subscription_plan || 'Standard'}</strong> · Status: <span class="badge badge-success">${org.subscription_status || 'Active'}</span> · Subscription: <strong>${activeCount} Active Branches × ${state.shop.currency}${pricePerBranch} = ${state.shop.currency}${fmtNum(subAmount, 0)}</strong>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <select id="ownerBranchFilter" class="form-control" style="width:auto;padding:8px 12px;" onchange="renderDashboard(document.getElementById('mainContent'), document.getElementById('ownerDateRangeFilter').value, this.value)">
              <option value="all" ${(!overrideBranch || overrideBranch === 'all') ? 'selected' : ''}>🌐 All Branches (${perf.length})</option>
              ${perf.map(b => `<option value="${b.branch_id}" ${overrideBranch === b.branch_id ? 'selected' : ''}>📍 ${b.branch_name} (${b.branch_code})</option>`).join('')}
            </select>
            <select id="ownerDateRangeFilter" class="form-control" style="width:auto;padding:8px 12px;" onchange="renderDashboard(document.getElementById('mainContent'), this.value, document.getElementById('ownerBranchFilter').value)">
              <option value="all" ${(!overrideRange || overrideRange === 'all') ? 'selected' : ''}>📅 All Time</option>
              <option value="today" ${overrideRange === 'today' ? 'selected' : ''}>Today</option>
              <option value="yesterday" ${overrideRange === 'yesterday' ? 'selected' : ''}>Yesterday</option>
              <option value="7days" ${overrideRange === '7days' ? 'selected' : ''}>Last 7 Days</option>
              <option value="30days" ${overrideRange === '30days' ? 'selected' : ''}>Last 30 Days</option>
            </select>
            <button class="btn-primary" onclick="openCreateBranchModal()">➕ Create Branch</button>
          </div>
        </div>

        <div class="stats-grid" style="grid-template-columns:repeat(4, 1fr);">
          <div class="stat-card" style="background:linear-gradient(135deg, rgba(0,122,255,0.08), rgba(52,199,89,0.08));border:1px solid rgba(0,122,255,0.2);">
            <div class="stat-value" style="color:var(--ios-blue);">${state.shop.currency}${fmtNum(sum.totalSales, 2)}</div>
            <div class="stat-label">Total Organization Sales</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color:var(--ios-green);">${sum.totalBills || 0}</div>
            <div class="stat-label">Total Invoices / Bills</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color:var(--ios-purple);">${activeCount} Active</div>
            <div class="stat-label">Active Billable Branches</div>
          </div>
          <div class="stat-card" style="background:rgba(52,199,89,0.05);border:1px solid rgba(52,199,89,0.2);">
            <div class="stat-value" style="color:var(--ios-green);">${state.shop.currency}${fmtNum(subAmount, 0)}</div>
            <div class="stat-label">Subscription Amount</div>
          </div>
        </div>

        <div class="card" style="margin-top:16px;">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
            <h3>📍 Branch Performance Breakdown</h3>
            <button class="btn-sm btn-secondary" onclick="openCreateBranchModal()">➕ Add Branch</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Branch Name</th>
                  <th>Branch Code</th>
                  <th>Total Sales</th>
                  <th>Total Invoices</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${perf.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No branches created yet</td></tr>' :
          perf.map(b => `
                    <tr>
                      <td style="font-weight:700;font-size:15px;color:var(--text-primary);">${b.branch_name}</td>
                      <td><code>${b.branch_code}</code></td>
                      <td style="font-weight:800;color:var(--ios-green);font-size:16px;">${state.shop.currency}${fmtNum(b.sales, 2)}</td>
                      <td style="font-weight:700;">${b.bill_count} Bills</td>
                      <td><span class="badge ${b.status === 'active' ? 'badge-success' : 'badge-warning'}">${b.status.toUpperCase()}</span></td>
                      <td>
                        <div style="display:flex;gap:4px;">
                          <button class="btn-sm btn-primary" onclick="handleSwitchBranch('${b.branch_id}')">🔄 Switch Branch</button>
                          <button class="btn-sm btn-danger" onclick="confirmDeleteBranchModal('${b.branch_id}', '${b.branch_name}')">🗑 Delete Branch</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')
        }
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
      return;
    }

    // -------------------------------------------------------------
    // 3. BRANCH / STAFF DASHBOARD VIEW
    // -------------------------------------------------------------
    const lowStockCount = stats.items.lowStockCount || 0;
    const todayRev = stats.revenue.today || 0;
    const todayBillsCount = stats.bills.today || 0;
    const totalItemsCount = stats.items.total || 0;

    const custW = stats.customersWidget || { total: 0, active: 0, outstanding: 0 };
    const partyW = stats.partiesWidget || { total: 0, receivable: 0, overdue: 0 };
    const suppW = stats.suppliersWidget || { total: 0, payable: 0, overdue: 0 };
    const finW = stats.financeWidget || { totalReceivable: 0, totalPayable: 0, netOutstanding: 0, todayCollections: 0, todayPayments: 0 };

    c.innerHTML = `
    <div class="fade-in">
      ${lowStockCount > 0 ? `<div class="alert alert-warn">⚠ ${lowStockCount} item${lowStockCount > 1 ? 's' : ''} running low on stock!</div>` : ''}

      <!-- Core Quick Metrics -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value" style="color:var(--ios-blue);">${totalItemsCount}</div>
          <div class="stat-label">Total Items</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${lowStockCount > 0 ? 'var(--ios-red)' : 'var(--ios-green)'};">${lowStockCount}</div>
          <div class="stat-label">Low Stock</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--ios-green);">${state.shop.currency}${fmtNum(finW.todayCollections, 0)}</div>
          <div class="stat-label">Today's Collections</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--ios-indigo);">${state.shop.currency}${fmtNum(todayRev, 0)}</div>
          <div class="stat-label">Today's Sales</div>
        </div>
      </div>

      <!-- Financial Receivable & Payable Overview Card -->
      <div class="card" style="background:linear-gradient(135deg, rgba(0,122,255,0.06), rgba(52,199,89,0.06));border:1px solid rgba(0,122,255,0.2);">
        <div class="card-header">
          <h3>💰 Financial Position Overview</h3>
          <button class="btn-sm btn-secondary" onclick="showSection('analytics')">📊 Analytics</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;text-align:center;">
          <div style="background:#fff;padding:12px;border-radius:12px;border:1px solid var(--border-light);cursor:pointer;" onclick="openReceivableDrilldownModal('all')" title="Click to view detailed outstanding invoices drilldown">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);">TOTAL RECEIVABLE</div>
            <div style="font-size:20px;font-weight:800;color:var(--ios-green);margin-top:2px;">${state.shop.currency}${fmtNum(finW.totalReceivable, 2)}</div>
            <div style="font-size:10px;color:var(--ios-blue);margin-top:2px;font-weight:600;">🔍 Tap to View Breakdown</div>
          </div>
          <div style="background:#fff;padding:12px;border-radius:12px;border:1px solid var(--border-light);">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);">TOTAL PAYABLE</div>
            <div style="font-size:20px;font-weight:800;color:var(--ios-red);margin-top:2px;">${state.shop.currency}${fmtNum(finW.totalPayable, 2)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Suppliers Restock</div>
          </div>
          <div style="background:#fff;padding:12px;border-radius:12px;border:1px solid var(--border-light);">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);">NET OUTSTANDING</div>
            <div style="font-size:20px;font-weight:800;color:${finW.netOutstanding >= 0 ? 'var(--ios-blue)' : 'var(--ios-purple)'};margin-top:2px;">${state.shop.currency}${fmtNum(finW.netOutstanding, 2)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Net Balance</div>
          </div>
        </div>
      </div>

      <!-- People Entity Cards Summary Grid -->
      <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;margin-bottom:16px;">
        <div class="card" style="margin-bottom:0;padding:14px;cursor:pointer;" onclick="openReceivableDrilldownModal('customer')">
          <div style="font-size:12px;font-weight:700;color:var(--ios-green);">📱 RETAIL B2C</div>
          <div style="font-size:18px;font-weight:800;margin-top:4px;">${custW.total} Customers</div>
          <div style="font-size:11px;color:var(--ios-red);margin-top:2px;font-weight:600;">Due: ${state.shop.currency}${fmtNum(custW.outstanding, 0)} (🔍 Tap)</div>
        </div>

        <div class="card" style="margin-bottom:0;padding:14px;cursor:pointer;" onclick="openReceivableDrilldownModal('party')">
          <div style="font-size:12px;font-weight:700;color:var(--ios-blue);">🏢 B2B PARTIES</div>
          <div style="font-size:18px;font-weight:800;margin-top:4px;">${partyW.total} Parties</div>
          <div style="font-size:11px;color:var(--ios-red);margin-top:2px;font-weight:600;">Due: ${state.shop.currency}${fmtNum(partyW.receivable, 0)} (🔍 Tap)</div>
        </div>

        <div class="card" style="margin-bottom:0;padding:14px;" onclick="showSection('people')" style="cursor:pointer;">
          <div style="font-size:12px;font-weight:700;color:var(--ios-purple);">🚚 SUPPLIERS</div>
          <div style="font-size:18px;font-weight:800;margin-top:4px;">${suppW.total} Suppliers</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Payable: ${state.shop.currency}${fmtNum(suppW.payable, 0)}</div>
        </div>
      </div>

      <!-- Quick Actions Grid -->
      <div class="card">
        <div class="card-header">
          <h3>Quick Enterprise Actions</h3>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;">
          <button class="btn-primary" onclick="showSection('bill')" style="padding:12px;font-size:13px;">🧾 New Bill</button>
          <button class="btn-secondary" onclick="openNewPurchaseModal()" style="padding:12px;font-size:13px;">📥 B2B Purchase</button>
          <button class="btn-secondary" onclick="openAddPersonModal('Party')" style="padding:12px;font-size:13px;">🏢 Add Party</button>
          <button class="btn-secondary" onclick="openAddPersonModal('Supplier')" style="padding:12px;font-size:13px;">🚚 Add Supplier</button>
        </div>
      </div>

      <!-- Recent Bills -->
      <div class="card">
        <div class="card-header"><h3>Recent Invoices & Bills</h3></div>
        ${!stats.recentBills || stats.recentBills.length === 0 ? '<div class="empty-state" style="padding:20px"><p>No bills generated yet</p></div>' :
        stats.recentBills.map(b => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-size:14px;font-weight:700;">#${b.bill_number || b.billNo} <span class="badge ${b.due_amount > 0 ? 'badge-partial' : 'badge-paid'}">${b.payment_status || 'Paid'}</span></div>
                <div style="font-size:11px;color:var(--text-muted);">${b.customer_name || 'Walk-in'} · ${formatDate(b.created_at || b.date)}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:15px;font-weight:800;color:var(--brown);">${state.shop.currency}${fmtNum(b.total, 2)}</div>
                <button class="btn-sm btn-secondary" onclick="viewBill('${b.id}')" style="margin-top:4px;">View</button>
              </div>
            </div>
          `).join('')
      }
      </div>
    </div>`;
  } catch (err) {
    c.innerHTML = `<div class="alert alert-warn">Failed to load dashboard statistics: ${err.message}</div>`;
  }
}

// ─── 2. Unified People (B2B & B2C) Section ────────────────────────────────────
let peopleCategoryTab = 'All';
let peopleSearchQuery = '';

async function renderPeopleSection(c, forceTab = null) {
  if (forceTab) peopleCategoryTab = forceTab;

  c.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">⏳ Loading Records...</div>`;

  try {
    const res = await apiFetch(`/people?category=${peopleCategoryTab}&search=${encodeURIComponent(peopleSearchQuery)}`);
    if (res.success) state.people = res.data || [];
  } catch (e) { }

  c.innerHTML = `
  <div class="fade-in">
    <!-- Category Tabs -->
    <div class="tabs">
      <button class="tab ${peopleCategoryTab === 'All' ? 'active' : ''}" onclick="peopleCategoryTab='All';renderPeopleSection(document.getElementById('mainContent'))">All People</button>
      <button class="tab ${peopleCategoryTab === 'Customer' ? 'active' : ''}" onclick="peopleCategoryTab='Customer';renderPeopleSection(document.getElementById('mainContent'))">Customers (B2C)</button>
      <button class="tab ${peopleCategoryTab === 'Party' ? 'active' : ''}" onclick="peopleCategoryTab='Party';renderPeopleSection(document.getElementById('mainContent'))">Parties (B2B)</button>
      <button class="tab ${peopleCategoryTab === 'Supplier' ? 'active' : ''}" onclick="peopleCategoryTab='Supplier';renderPeopleSection(document.getElementById('mainContent'))">Suppliers</button>
    </div>

    <!-- Search & Actions -->
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input type="text" placeholder="Search by name, mobile, business name, GST..." value="${peopleSearchQuery}" oninput="peopleSearchQuery=this.value;renderPeopleSection(document.getElementById('mainContent'))">
    </div>

    <div style="display:flex;gap:10px;margin-bottom:14px;">
      <button class="btn-primary" style="flex:1;" onclick="openAddPersonModal('${peopleCategoryTab === 'All' ? 'Customer' : peopleCategoryTab}')">➕ Add New ${peopleCategoryTab === 'All' ? 'Entity' : peopleCategoryTab}</button>
      <button class="btn-secondary" style="flex:1;" onclick="openNewPurchaseModal()">📥 Restock Purchase</button>
    </div>

    <!-- Entity Cards List -->
    ${state.people.length === 0 ? '<div class="empty-state"><div class="empty-state-icon">👥</div><p>No entity records found.</p></div>' :
      state.people.map(p => {
        const isSupplier = p.category === 'Supplier';
        const dueVal = parseFloat(p.due_amount || 0);

        return `
          <div class="person-card">
            <div class="person-avatar ${p.category.toLowerCase()}">
              ${p.category === 'Customer' ? '📱' : p.category === 'Party' ? '🏢' : '🚚'}
            </div>
            <div class="person-details">
              <div class="person-title">${p.name} ${p.business_name ? `<span style="font-size:13px;font-weight:600;color:var(--text-secondary);">(${p.business_name})</span>` : ''}</div>
              <div class="person-subtitle">
                📞 ${p.mobile || 'No Mobile'} · ${p.city || p.state || 'Local'} ${p.gstin ? '· GST: ' + p.gstin : ''}
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                ${isSupplier ? `Total Restock Purchases: ${state.shop.currency}${fmtNum(p.total_purchases, 2)}` : `Total Sales: ${state.shop.currency}${fmtNum(p.total_sales, 2)}`}
              </div>
            </div>

            <div class="person-due-container">
              <div class="due-label">${isSupplier ? 'Payable Due' : 'Receivable Due'}</div>
              <div class="due-value ${dueVal > 0 ? (isSupplier ? 'payable' : 'receivable') : 'zero'}">
                ${state.shop.currency}${fmtNum(Math.abs(dueVal), 2)}
              </div>
              <div style="display:flex;gap:4px;margin-top:6px;justify-content:flex-end;">
                <button class="btn-sm btn-secondary" onclick="openLedgerModal('${p.id}')">📘 Ledger</button>
                <button class="btn-sm btn-primary" onclick="openRecordPaymentModal('${p.id}')">💳 Pay</button>
                <button class="btn-sm btn-danger" onclick="deletePersonSubmit('${p.id}')">🗑</button>
              </div>
            </div>
          </div>
        `;
      }).join('')
    }
  </div>`;
}

// Add/Edit Person Modal
function openAddPersonModal(defaultCategory = 'Customer') {
  showModal(`Add New ${defaultCategory}`, `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Category *</label>
        <select id="pCategory">
          <option ${defaultCategory === 'Customer' ? 'selected' : ''}>Customer</option>
          <option ${defaultCategory === 'Party' ? 'selected' : ''}>Party</option>
          <option ${defaultCategory === 'Supplier' ? 'selected' : ''}>Supplier</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input type="text" id="pName" placeholder="e.g. Acme Enterprises / Rahul Sharma" required>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Business Name (Optional)</label>
        <input type="text" id="pBusiness" placeholder="Trade / Firm Name">
      </div>
      <div class="form-group">
        <label class="form-label">Mobile Number *</label>
        <input type="tel" id="pMobile" placeholder="10-digit Mobile">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">GSTIN (Optional)</label>
        <input type="text" id="pGstin" placeholder="22AAAAA0000A1Z5">
      </div>
      <div class="form-group">
        <label class="form-label">PAN (Optional)</label>
        <input type="text" id="pPan" placeholder="ABCDE1234F">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Opening Balance (${state.shop.currency})</label>
        <input type="number" id="pOpeningBal" placeholder="0.00" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">Credit Limit (${state.shop.currency})</label>
        <input type="number" id="pCreditLimit" placeholder="50000" step="0.01">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Address & City</label>
      <input type="text" id="pAddress" placeholder="Street Address, City, State, Pincode">
    </div>

    <button class="btn-primary" style="width:100%;padding:14px;" onclick="savePersonSubmit()">✅ Save Entity Record</button>
  `);
}

async function savePersonSubmit() {
  const category = document.getElementById('pCategory').value;
  const name = document.getElementById('pName').value.trim();
  const business_name = document.getElementById('pBusiness').value.trim();
  const mobile = document.getElementById('pMobile').value.trim();
  const gstin = document.getElementById('pGstin').value.trim();
  const pan = document.getElementById('pPan').value.trim();
  const opening_balance = parseFloat(document.getElementById('pOpeningBal').value) || 0;
  const credit_limit = parseFloat(document.getElementById('pCreditLimit').value) || 0;
  const address = document.getElementById('pAddress').value.trim();

  if (!name) { alert('Name is required'); return; }

  try {
    const res = await apiFetch('/people', {
      method: 'POST',
      body: JSON.stringify({ category, name, business_name, mobile, gstin, pan, opening_balance, credit_limit, address })
    });

    if (res.success) {
      closeModal();
      toast(`✅ ${category} record created`);
      renderPeopleSection(document.getElementById('mainContent'));
    }
  } catch (err) {
    alert(err.message || 'Failed to create record');
  }
}

async function deletePersonSubmit(id) {
  if (!confirm('Are you sure you want to delete this record?')) return;
  try {
    const res = await apiFetch(`/people/${id}`, { method: 'DELETE' });
    if (res.success) {
      toast('🗑 Record deleted');
      renderPeopleSection(document.getElementById('mainContent'));
    }
  } catch (err) {
    alert(err.message);
  }
}

// ─── 3. Ledger System Modal ────────────────────────────────────────────────────
async function openLedgerModal(personId) {
  showModal('📘 Party / Customer Account Ledger', `<div style="text-align:center;padding:30px;">⏳ Loading Ledger...</div>`);

  try {
    const res = await apiFetch(`/ledgers/${personId}`);
    if (!res.success || !res.data) throw new Error(res.message);

    const { person, current_due, entries } = res.data;

    const ledgerHtml = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;background:rgba(0,122,255,0.06);padding:12px;border-radius:14px;border:1px solid rgba(0,122,255,0.15);">
        <div>
          <div style="font-size:16px;font-weight:800;">${person.name} (${person.category})</div>
          <div style="font-size:12px;color:var(--text-muted);">${person.business_name ? person.business_name + ' · ' : ''}📞 ${person.mobile || 'N/A'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;">Net Outstanding Due</div>
          <div style="font-size:20px;font-weight:800;color:${current_due > 0 ? (person.category === 'Supplier' ? 'var(--ios-red)' : 'var(--ios-green)') : 'var(--text-primary)'};">
            ${state.shop.currency}${fmtNum(Math.abs(current_due), 2)}
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn-sm btn-secondary" onclick="window.open('${API_URL}/ledgers/${personId}/export/excel?token=${localStorage.getItem('sms_token')}')">📗 Excel</button>
        <button class="btn-sm btn-accent" onclick="window.open('${API_URL}/ledgers/${personId}/export/pdf?token=${localStorage.getItem('sms_token')}')">📕 PDF Statement</button>
        <button class="btn-sm btn-primary" onclick="openRecordPaymentModal('${personId}')" style="margin-left:auto;">💳 Record Payment</button>
      </div>

      <div style="max-height:360px;overflow-y:auto;">
        <table class="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry Type</th>
              <th>Debit (Dr)</th>
              <th>Credit (Cr)</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            ${entries.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">No ledger transaction entries yet</td></tr>' :
        entries.map(e => `
                <tr>
                  <td>${formatDate(e.created_at)}</td>
                  <td><strong>${e.entry_type}</strong><br><span style="font-size:10px;color:var(--text-muted);">${e.notes || ''}</span></td>
                  <td class="text-debit">${e.debit > 0 ? state.shop.currency + fmtNum(e.debit, 2) : '-'}</td>
                  <td class="text-credit">${e.credit > 0 ? state.shop.currency + fmtNum(e.credit, 2) : '-'}</td>
                  <td class="text-balance">${state.shop.currency}${fmtNum(e.running_balance, 2)}</td>
                </tr>
              `).join('')
      }
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('modalBody').innerHTML = ledgerHtml;
  } catch (err) {
    document.getElementById('modalBody').innerHTML = `<div class="alert alert-warn">${err.message}</div>`;
  }
}

// ─── 4. Payment Management Module ─────────────────────────────────────────────
async function openRecordPaymentModal(personId) {
  let person = state.people.find(p => p.id === personId);
  if (!person) {
    try {
      const res = await apiFetch(`/people/${personId}`);
      if (res.success) person = res.data;
    } catch (e) { }
  }

  showModal('💳 Record Financial Payment / Collection', `
    <div style="background:rgba(0,122,255,0.06);padding:12px;border-radius:12px;margin-bottom:14px;">
      <div style="font-size:15px;font-weight:800;">${person ? person.name : 'Selected Party'}</div>
      <div style="font-size:12px;color:var(--text-muted);">Category: ${person ? person.category : 'Entity'}</div>
    </div>

    <div class="form-group">
      <label class="form-label">Payment Amount (${state.shop.currency}) *</label>
      <input type="number" id="payAmount" placeholder="0.00" min="0.01" step="0.01" required style="font-size:18px;font-weight:800;">
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Payment Mode *</label>
        <select id="payMode">
          <option>Cash</option>
          <option>UPI</option>
          <option>Bank Transfer</option>
          <option>Card</option>
          <option>Cheque</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Reference No / Txn ID</label>
        <input type="text" id="payRef" placeholder="UPI Txn / Cheque No">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Notes / Remarks</label>
      <input type="text" id="payNotes" placeholder="Payment received against invoice">
    </div>

    <button class="btn-success" style="width:100%;padding:14px;font-size:16px;" onclick="savePaymentSubmit('${personId}')">✅ Confirm & Save Payment</button>
  `);
}

async function savePaymentSubmit(personId) {
  const amount = parseFloat(document.getElementById('payAmount').value);
  const payment_mode = document.getElementById('payMode').value;
  const reference_no = document.getElementById('payRef').value.trim();
  const notes = document.getElementById('payNotes').value.trim();

  if (isNaN(amount) || amount <= 0) {
    alert('Please enter a valid positive payment amount');
    return;
  }

  try {
    const res = await apiFetch('/payments', {
      method: 'POST',
      body: JSON.stringify({ personId, amount, payment_mode, reference_no, notes })
    });

    if (res.success) {
      closeModal();
      toast('💳 Payment recorded successfully');
      renderPeopleSection(document.getElementById('mainContent'));
    }
  } catch (err) {
    alert(err.message || 'Failed to record payment');
  }
}

// ─── 5. B2B Restock Purchase Invoice Modal ─────────────────────────────────────
function openNewPurchaseModal() {
  const suppliers = state.people.filter(p => p.category === 'Supplier');
  if (suppliers.length === 0) {
    alert('Please add at least one Supplier in the People section first.');
    openAddPersonModal('Supplier');
    return;
  }

  showModal('📥 New B2B Supplier Restock Purchase', `
    <div class="form-group">
      <label class="form-label">Select Supplier *</label>
      <select id="purSupplier">
        ${suppliers.map(s => `<option value="${s.id}">🚚 ${s.name} ${s.business_name ? '(' + s.business_name + ')' : ''}</option>`).join('')}
      </select>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Supplier Invoice No</label>
        <input type="text" id="purInvNo" placeholder="INV-2026-99">
      </div>
      <div class="form-group">
        <label class="form-label">Payment Mode</label>
        <select id="purPayMode">
          <option>Bank Transfer</option>
          <option>Cash</option>
          <option>UPI</option>
          <option>Cheque</option>
        </select>
      </div>
    </div>

    <div class="card" style="padding:12px;margin-bottom:12px;">
      <label class="form-label">Restock Inventory Item</label>
      <div class="form-row">
        <select id="purItemSelect">
          <option value="">Choose item...</option>
          ${state.items.map(i => `<option value="${i.id}">${i.name} (Buy: ${state.shop.currency}${i.buy_price || 0})</option>`).join('')}
        </select>
        <input type="number" id="purQty" placeholder="Qty" min="1" value="1">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Initial Paid Amount (${state.shop.currency})</label>
      <input type="number" id="purPaidAmt" placeholder="0.00" min="0" step="0.01">
    </div>

    <button class="btn-primary" style="width:100%;padding:14px;" onclick="savePurchaseSubmit()">✅ Confirm B2B Restock</button>
  `);
}

async function savePurchaseSubmit() {
  const supplierId = document.getElementById('purSupplier').value;
  const supplier_invoice_no = document.getElementById('purInvNo').value.trim();
  const itemId = document.getElementById('purItemSelect').value;
  const qty = parseFloat(document.getElementById('purQty').value) || 0;
  const paidAmount = parseFloat(document.getElementById('purPaidAmt').value) || 0;
  const paymentMode = document.getElementById('purPayMode').value;

  if (!supplierId || !itemId || qty <= 0) {
    alert('Please select a supplier, item, and valid quantity');
    return;
  }

  const selectedItem = state.items.find(i => i.id === itemId);
  const buy_price = selectedItem ? (selectedItem.buy_price || selectedItem.selling_price || 10) : 10;

  try {
    const res = await apiFetch('/purchases', {
      method: 'POST',
      body: JSON.stringify({
        supplierId,
        supplier_invoice_no,
        items: [{ itemId, name: selectedItem.name, buy_price, qty }],
        paidAmount,
        paymentMode
      })
    });

    if (res.success) {
      closeModal();
      toast('✅ Restock Purchase recorded');
      await loadInitialData();
      renderSection('stock');
    }
  } catch (err) {
    alert(err.message || 'Failed to record purchase');
  }
}

// ─── 6. Analytics Section ─────────────────────────────────────────────────────
async function renderAnalytics(c) {
  c.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">⏳ Loading Financial Analytics...</div>`;

  try {
    const res = await apiFetch('/analytics');
    if (!res.success || !res.data) throw new Error(res.message);

    const { topCustomers, topSuppliers, ageingBuckets } = res.data;

    c.innerHTML = `
    <div class="fade-in">
      <div class="card">
        <div class="card-header">
          <h3>📊 Accounts Ageing Breakdown (Days Outstanding)</h3>
        </div>
        <div class="aging-grid">
          <div class="aging-card">
            <div class="aging-val" style="color:var(--ios-green);">${state.shop.currency}${fmtNum(ageingBuckets.bucket0_30, 0)}</div>
            <div class="aging-lbl">0 - 30 Days</div>
          </div>
          <div class="aging-card">
            <div class="aging-val" style="color:var(--ios-blue);">${state.shop.currency}${fmtNum(ageingBuckets.bucket31_60, 0)}</div>
            <div class="aging-lbl">31 - 60 Days</div>
          </div>
          <div class="aging-card">
            <div class="aging-val" style="color:var(--ios-purple);">${state.shop.currency}${fmtNum(ageingBuckets.bucket61_90, 0)}</div>
            <div class="aging-lbl">61 - 90 Days</div>
          </div>
          <div class="aging-card">
            <div class="aging-val" style="color:var(--ios-red);">${state.shop.currency}${fmtNum(ageingBuckets.bucket90Plus, 0)}</div>
            <div class="aging-lbl">90+ Days Overdue</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>🏆 Top Revenue B2B / B2C Customers</h3></div>
        ${!topCustomers || topCustomers.length === 0 ? '<div class="empty-state" style="padding:16px;"><p>No sales records yet</p></div>' :
        topCustomers.map(tc => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-weight:700;">${tc.name}</div>
                <div style="font-size:11px;color:var(--text-muted);">${tc.bill_count} Sales Bills</div>
              </div>
              <div style="font-weight:800;color:var(--ios-green);">${state.shop.currency}${fmtNum(tc.total_revenue, 2)}</div>
            </div>
          `).join('')
      }
      </div>

      <div class="card">
        <div class="card-header"><h3>🚚 Top Restock Suppliers</h3></div>
        ${!topSuppliers || topSuppliers.length === 0 ? '<div class="empty-state" style="padding:16px;"><p>No restock purchases yet</p></div>' :
        topSuppliers.map(ts => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-weight:700;">${ts.name} (${ts.business_name || 'Supplier'})</div>
                <div style="font-size:11px;color:var(--text-muted);">${ts.purchase_count} Restock Invoices</div>
              </div>
              <div style="font-weight:800;color:var(--ios-purple);">${state.shop.currency}${parseFloat(ts.total_purchased || 0).toFixed(2)}</div>
            </div>
          `).join('')
      }
      </div>
    </div>`;
  } catch (err) {
    c.innerHTML = `<div class="alert alert-warn">${err.message}</div>`;
  }
}

// ─── 7. Billing Section ───────────────────────────────────────────────────────
let billingSubTab = 'dashboard'; // 'dashboard' or 'new'
let billingSearchQuery = '';
let billingStatusFilter = '';
let billingRangeFilter = '';
let billSearchQuery = '';
let billSelectedCat = 'All';

async function renderBill(c) {
  c.innerHTML = `
  <div class="fade-in">
    <div class="tabs" style="margin-bottom:14px;">
      <button class="tab ${billingSubTab === 'dashboard' ? 'active' : ''}" onclick="billingSubTab='dashboard';renderSection('bill')">📊 Billing Dashboard</button>
      <button class="tab ${billingSubTab === 'new' ? 'active' : ''}" onclick="billingSubTab='new';renderSection('bill')">🧾 New POS Bill</button>
    </div>
    <div id="billSubTabContent">⏳ Loading Billing Module...</div>
  </div>`;

  const container = document.getElementById('billSubTabContent');
  if (billingSubTab === 'dashboard') {
    await renderBillingDashboard(container);
  } else {
    await renderPOSBilling(container);
  }
}

async function renderBillingDashboard(container) {
  try {
    const [statsRes, billsRes] = await Promise.all([
      apiFetch('/bills/stats'),
      apiFetch(`/bills?search=${encodeURIComponent(billingSearchQuery)}&payment_status=${encodeURIComponent(billingStatusFilter)}&range=${encodeURIComponent(billingRangeFilter)}`)
    ]);

    const stats = statsRes.success && statsRes.data ? statsRes.data : {
      todaySales: 0, totalBills: 0, paidBills: 0, creditBills: 0, cancelledBills: 0, draftBills: 0, totalRevenue: 0, avgBillValue: 0
    };
    const bills = billsRes.success && billsRes.data ? billsRes.data : [];

    container.innerHTML = `
      <!-- Billing Metrics Cards -->
      <div class="stats-grid" style="grid-template-columns:repeat(4, 1fr);gap:10px;margin-bottom:16px;">
        <div class="stat-card">
          <div class="stat-value" style="color:var(--ios-green);">${state.shop.currency}${fmtNum(stats.todaySales, 0)}</div>
          <div class="stat-label">Today's Sales</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--ios-blue);">${stats.totalBills}</div>
          <div class="stat-label">Total Bills</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--ios-indigo);">${stats.paidBills}</div>
          <div class="stat-label">Paid Invoices</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--ios-red);">${stats.creditBills}</div>
          <div class="stat-label">Credit / Unpaid</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--ios-orange, #ff9500);">${stats.draftBills}</div>
          <div class="stat-label">Draft Bills</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--text-muted);">${stats.cancelledBills}</div>
          <div class="stat-label">Cancelled Bills</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--ios-purple);">${state.shop.currency}${fmtNum(stats.avgBillValue, 2)}</div>
          <div class="stat-label">Avg Bill Value</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--ios-green);">${state.shop.currency}${fmtNum(stats.totalRevenue, 0)}</div>
          <div class="stat-label">Total Revenue</div>
        </div>
      </div>

      <!-- Search & Filters Bar -->
      <div class="card" style="padding:12px;margin-bottom:14px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <div class="search-box" style="flex:2;margin-bottom:0;min-width:200px;">
            <span class="search-icon">🔍</span>
            <input type="text" placeholder="Search Invoice #, Name, Mobile..." value="${billingSearchQuery}" oninput="billingSearchQuery=this.value;renderSection('bill')">
          </div>

          <select style="flex:1;min-width:120px;padding:8px 12px;font-size:12px;border-radius:10px;" onchange="billingStatusFilter=this.value;renderSection('bill')">
            <option value="" ${billingStatusFilter === '' ? 'selected' : ''}>All Statuses</option>
            <option value="Paid" ${billingStatusFilter === 'Paid' ? 'selected' : ''}>Paid</option>
            <option value="Unpaid" ${billingStatusFilter === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
            <option value="Partially Paid" ${billingStatusFilter === 'Partially Paid' ? 'selected' : ''}>Partially Paid</option>
          </select>

          <select style="flex:1;min-width:120px;padding:8px 12px;font-size:12px;border-radius:10px;" onchange="billingRangeFilter=this.value;renderSection('bill')">
            <option value="" ${billingRangeFilter === '' ? 'selected' : ''}>All Time</option>
            <option value="today" ${billingRangeFilter === 'today' ? 'selected' : ''}>Today</option>
            <option value="yesterday" ${billingRangeFilter === 'yesterday' ? 'selected' : ''}>Yesterday</option>
            <option value="7days" ${billingRangeFilter === '7days' ? 'selected' : ''}>Last 7 Days</option>
            <option value="30days" ${billingRangeFilter === '30days' ? 'selected' : ''}>Last 30 Days</option>
          </select>

          <button class="btn-primary" onclick="billingSubTab='new';renderSection('bill')" style="padding:10px 16px;font-size:13px;">➕ New Bill</button>
        </div>
      </div>

      <!-- Invoices List -->
      <div class="card">
        <div class="card-header">
          <h3>Recent Sales Invoices (${bills.length})</h3>
        </div>

        ${bills.length === 0 ? '<div class="empty-state" style="padding:30px;"><p>No billing invoices found</p></div>' :
        bills.map(b => `
            <div class="card" style="margin-bottom:10px;padding:12px;border:1px solid var(--border-light);${b.status === 'Cancelled' ? 'opacity:0.6;' : ''}">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                <div>
                  <div style="font-weight:800;font-size:15px;">
                    #${b.bill_number || b.billNo}
                    <span class="badge ${b.status === 'Cancelled' ? 'badge-cancelled' : b.due_amount > 0 ? 'badge-partial' : 'badge-paid'}">${b.status === 'Cancelled' ? 'CANCELLED' : b.payment_status || 'Paid'}</span>
                  </div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                    ${b.customer_name || 'Walk-in Customer'} ${b.customer_phone ? '· 📞 ' + b.customer_phone : ''}
                  </div>
                  <div style="font-size:11px;color:var(--text-light);margin-top:2px;">
                    ${formatDateFull(b.created_at || b.date)} · Mode: <strong>${b.payment_mode || 'Cash'}</strong>
                    ${b.cancellation_reason ? `<br><span style="color:var(--ios-red);">Cancelled: ${b.cancellation_reason}</span>` : ''}
                  </div>
                </div>

                <div style="text-align:right;">
                  <div style="font-size:18px;font-weight:800;color:var(--brown);">${state.shop.currency}${fmtNum(b.total, 2)}</div>
                  <div style="font-size:11px;color:var(--text-muted);">Paid: ${state.shop.currency}${fmtNum(b.paid_amount || b.total, 2)} ${b.due_amount > 0 ? `· <span style="color:var(--ios-red);">Due: ${state.shop.currency}${fmtNum(b.due_amount, 2)}</span>` : ''}</div>
                </div>
              </div>

              <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;border-top:1px solid var(--border-light);padding-top:8px;">
                <button class="btn-sm btn-secondary" onclick="viewBill('${b.id}')">👁 View</button>
                ${b.status !== 'Cancelled' && b.due_amount > 0 ? `<button class="btn-sm btn-primary" onclick="openPayDueModal('${b.id}')">💳 Clear Due</button>` : ''}
                <button class="btn-sm btn-accent" onclick="openA4InvoicePrint('${b.id}')">📄 A4 Print</button>
                <button class="btn-sm btn-success" style="background:#25D366;color:#fff;border:none;" onclick="shareBillWhatsApp('${b.id}')">📱 WhatsApp</button>
                <button class="btn-sm btn-secondary" onclick="duplicateBill('${b.id}')">📋 Duplicate</button>
                ${b.status !== 'Cancelled' ? `<button class="btn-sm btn-danger" onclick="cancelBillSubmit('${b.id}')">❌ Cancel</button>` : ''}
              </div>
            </div>
          `).join('')
      }
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warn">Failed to load billing dashboard: ${err.message}</div>`;
  }
}

async function renderPOSBilling(c) {
  try {
    const res = await apiFetch('/items');
    if (res.success) state.items = res.data || [];
  } catch (e) { }

  const filteredItems = state.items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(billSearchQuery.toLowerCase());
    const matchCat = billSelectedCat === 'All' || i.category === billSelectedCat;
    return matchSearch && matchCat;
  });

  const subtotal = billCart.reduce((s, item) => s + item.qty * item.price, 0);
  let discountAmt = 0;
  if (billDiscountType === 'percent') {
    discountAmt = (subtotal * Math.min(100, Math.max(0, parseFloat(billDiscount) || 0))) / 100;
  } else {
    discountAmt = Math.min(subtotal, Math.max(0, parseFloat(billDiscount) || 0));
  }
  const taxableSubtotal = Math.max(0, subtotal - discountAmt);
  const taxAmt = taxableSubtotal * (state.shop.taxRate || 0) / 100;
  const grandTotal = taxableSubtotal + taxAmt;
  const actualPaid = (billPaidAmount !== null && billPaidAmount !== undefined && billPaidAmount !== '') ? Math.min(grandTotal, Math.max(0, parseFloat(billPaidAmount))) : grandTotal;
  const dueAmt = Math.max(0, grandTotal - actualPaid);

  const b2bEntities = state.people.filter(p => p.category === 'Customer' || p.category === 'Party');

  c.innerHTML = `
  <div class="fade-in">
    <!-- Customer / Party Info Selection -->
    <div class="card" style="padding:12px 14px;margin-bottom:10px;">
      <div class="form-group" style="margin-bottom:8px;">
        <label class="form-label">Link Customer / B2B Party</label>
        <select id="billPartySelect" onchange="handleBillPartySelect(this.value)">
          <option value="">Walk-in Customer (Retail B2C Cash)</option>
          ${b2bEntities.map(p => `<option value="${p.id}" ${billCustomer.personId === p.id ? 'selected' : ''}>[${p.category}] ${p.name} ${p.business_name ? '(' + p.business_name + ')' : ''} · 📞 ${p.mobile || 'N/A'}</option>`).join('')}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Customer / Party Name *</label>
          <input type="text" id="billCustName" placeholder="Walk-in Customer" value="${billCustomer.name}" oninput="billCustomer.name=this.value">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Customer Mobile (10 digits)</label>
          <input type="tel" id="billCustPhone" placeholder="10 Digit Mobile #" value="${billCustomer.phone}" oninput="billCustomer.phone=this.value">
        </div>
      </div>
    </div>

    <!-- Search & Filter -->
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input type="text" id="billSearchInput" placeholder="Search items by name..." value="${billSearchQuery}" oninput="billSearchQuery=this.value;filterPOSItemsDOM();">
    </div>

    <!-- Items Grid List -->
    <div class="card" style="padding:12px;">
      <div class="card-header" style="margin-bottom:8px;">
        <h3>Select Items</h3>
        <span style="font-size:12px;color:var(--text-muted);">${filteredItems.length} items found</span>
      </div>

      <div style="max-height:320px;overflow-y:auto;padding-right:2px;" id="posItemsList">
        ${filteredItems.length === 0 ? '<div style="text-align:center;padding:30px;color:var(--text-muted);">No items found in inventory.</div>' :
      filteredItems.map(i => {
        const inCart = billCart.find(c => c.itemId === i.id);
        const cartQty = inCart ? inCart.qty : 0;
        return `
              <div class="bill-item-card ${cartQty > 0 ? 'selected' : ''}">
                <div class="stock-icon">📦</div>
                <div class="bill-item-info">
                  <div class="bill-item-name">${i.name}</div>
                  <div class="bill-item-meta">${state.shop.currency}${fmtNum(i.selling_price || i.price, 2)} / ${i.unit} · Stock: ${i.stock}</div>
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

    <!-- Cart Checkout -->
    ${billCart.length > 0 ? `
    <div class="card fade-in" style="margin-top:12px;">
      <div class="card-header">
        <h3>Current Order (${billCart.length} item${billCart.length > 1 ? 's' : ''})</h3>
        <button class="btn-sm btn-secondary" onclick="billCart=[];billDiscount=0;billPaidAmount=null;renderSection('bill')">Clear Cart</button>
      </div>

      <div style="max-height:160px;overflow-y:auto;margin-bottom:10px;">
        ${billCart.map(item => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border);font-size:13px;">
            <div>
              <span style="font-weight:600;">${item.name}</span>
              <span style="font-size:11px;color:var(--text-muted);"> (${item.qty} x ${state.shop.currency}${fmtNum(item.price, 2)})</span>
            </div>
            <div style="font-weight:700;">${state.shop.currency}${fmtNum(item.qty * item.price, 2)}</div>
          </div>
        `).join('')}
      </div>

      <div class="bill-summary" style="background:rgba(0,122,255,0.03);padding:14px;border-radius:14px;border:1px solid rgba(0,122,255,0.15);">
        <div class="summary-row"><span>Subtotal</span><span>${state.shop.currency}${fmtNum(subtotal, 2)}</span></div>

        <!-- Discount Section (% OR Rupees) -->
        <div class="summary-row" style="align-items:center;margin:6px 0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-weight:600;color:var(--ios-green);">Discount</span>
            <div style="display:inline-flex;background:rgba(52,199,89,0.12);border:1px solid var(--ios-green);border-radius:8px;padding:2px;gap:2px;">
              <button type="button" id="btnDiscountRupees" style="padding:2px 10px;font-size:11px;font-weight:800;border:none;border-radius:6px;cursor:pointer;${billDiscountType === 'rupees' ? 'background:var(--ios-green);color:#fff;' : 'background:transparent;color:var(--ios-green);'}" onclick="setBillDiscountType('rupees')">₹</button>
              <button type="button" id="btnDiscountPercent" style="padding:2px 10px;font-size:11px;font-weight:800;border:none;border-radius:6px;cursor:pointer;${billDiscountType === 'percent' ? 'background:var(--ios-green);color:#fff;' : 'background:transparent;color:var(--ios-green);'}" onclick="setBillDiscountType('percent')">%</button>
            </div>
          </div>
          <input type="number" id="posDiscountInput" min="0" max="${billDiscountType === 'percent' ? 100 : subtotal}" step="any" value="${billDiscount || ''}" placeholder="${billDiscountType === 'percent' ? '0%' : '₹0'}" 
            oninput="billDiscount=parseFloat(this.value)||0;updatePOSCalculationsDOM();" 
            style="width:110px;padding:4px 8px;font-size:13px;text-align:right;border-radius:8px;border:1px solid var(--ios-green);font-weight:700;">
        </div>

        <div class="summary-row" id="posTaxableRow" style="font-size:12px;color:var(--text-muted);display:${discountAmt > 0 ? 'flex' : 'none'};">
          <span>Taxable Subtotal</span>
          <span id="posTaxableVal">${state.shop.currency}${fmtNum(taxableSubtotal, 2)}</span>
        </div>

        ${state.shop.taxRate > 0 ? `<div class="summary-row"><span>Tax (${state.shop.taxRate}%)</span><span id="posTaxVal">${state.shop.currency}${fmtNum(taxAmt, 2)}</span></div>` : ''}

        <div class="summary-row summary-total" style="border-top:1px solid var(--border-light);padding-top:8px;margin-top:6px;">
          <span>Grand Total</span>
          <span id="posGrandVal" style="color:var(--ios-blue);font-size:20px;font-weight:800;">${state.shop.currency}${fmtNum(grandTotal, 2)}</span>
        </div>

        <!-- Payment Mode Select -->
        <div class="form-group" style="margin-top:12px;margin-bottom:8px;">
          <label class="form-label" style="font-weight:700;">Payment Mode</label>
          <select id="billPayModeSelect" onchange="billPaymentMode=this.value;renderSection('bill');" style="padding:10px;border-radius:10px;font-weight:600;">
            <option value="Cash" ${billPaymentMode === 'Cash' ? 'selected' : ''}>💵 Cash</option>
            <option value="UPI" ${billPaymentMode === 'UPI' ? 'selected' : ''}>📱 UPI / QR Code</option>
            <option value="Net Banking" ${billPaymentMode === 'Net Banking' ? 'selected' : ''}>🏦 Net Banking</option>
            <option value="Debit Card" ${billPaymentMode === 'Debit Card' ? 'selected' : ''}>💳 Debit Card</option>
            <option value="Credit Card" ${billPaymentMode === 'Credit Card' ? 'selected' : ''}>💳 Credit Card</option>
            <option value="Cheque" ${billPaymentMode === 'Cheque' ? 'selected' : ''}>📄 Cheque</option>
            <option value="Split Payment" ${billPaymentMode === 'Split Payment' ? 'selected' : ''}>🔀 Split Payment (Multiple Modes)</option>
          </select>
        </div>

        <!-- Split Payments Builder -->
        ${billPaymentMode === 'Split Payment' ? `
          <div style="background:#fff;padding:12px;border-radius:12px;border:1px dashed var(--ios-blue);margin-bottom:12px;">
            <div style="font-size:12px;font-weight:700;color:var(--ios-blue);margin-bottom:8px;">🔀 Multiple Payment Modes Breakdown</div>
            ${billSplitPayments.map((sp, idx) => `
              <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
                <select style="flex:1;padding:6px;font-size:12px;border-radius:8px;" onchange="billSplitPayments[${idx}].mode=this.value;">
                  ${['Cash', 'UPI', 'Net Banking', 'Debit Card', 'Credit Card', 'Cheque'].map(m => `<option value="${m}" ${sp.mode === m ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                <input type="number" placeholder="Amount (₹)" value="${sp.amount || ''}" oninput="billSplitPayments[${idx}].amount=parseFloat(this.value)||0;" style="width:100px;padding:6px;font-size:12px;border-radius:8px;">
                <button class="btn-sm btn-danger" onclick="billSplitPayments.splice(${idx},1);renderSection('bill')">✕</button>
              </div>
            `).join('')}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
              <button class="btn-sm btn-secondary" onclick="billSplitPayments.push({mode:'UPI',amount:0});renderSection('bill')">➕ Add Mode</button>
              <button class="btn-sm btn-accent" onclick="autoFillSplitBalance(${actualPaid})">⚡ Auto-Fill Balance</button>
            </div>
          </div>
        ` : ''}

        <!-- Paid & Due Row -->
        <div class="form-row" style="margin-top:10px;">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Amount Paid (₹)</label>
            <input type="number" id="posPaidInput" min="0" max="${grandTotal}" step="1" value="${billPaidAmount !== null ? billPaidAmount : ''}" 
              placeholder="${fmtNum(grandTotal, 2)}" oninput="billPaidAmount=this.value!==''?parseFloat(this.value):null;updatePOSCalculationsDOM();" 
              style="font-weight:700;color:var(--ios-green);">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Balance Due (₹)</label>
            <input type="text" id="posDueInput" readonly value="${state.shop.currency}${fmtNum(dueAmt, 2)}" 
              style="font-weight:800;color:${dueAmt > 0 ? 'var(--ios-red)' : 'var(--ios-green)'};background:rgba(0,0,0,0.03);">
          </div>
        </div>
      </div>

      <button class="btn-primary" style="width:100%;margin-top:14px;padding:14px;font-size:16px;" onclick="generateBillSubmit()">🧾 Complete & Print Bill</button>
    </div>` : ''}
  </div>`;
}

function setBillDiscountType(type) {
  billDiscountType = type;
  const input = document.getElementById('posDiscountInput');
  if (input) {
    input.placeholder = type === 'percent' ? '0%' : '₹0';
  }
  const btnRupees = document.getElementById('btnDiscountRupees');
  const btnPercent = document.getElementById('btnDiscountPercent');
  if (btnRupees && btnPercent) {
    if (type === 'rupees') {
      btnRupees.style.background = 'var(--ios-green)';
      btnRupees.style.color = '#fff';
      btnPercent.style.background = 'transparent';
      btnPercent.style.color = 'var(--ios-green)';
    } else {
      btnPercent.style.background = 'var(--ios-green)';
      btnPercent.style.color = '#fff';
      btnRupees.style.background = 'transparent';
      btnRupees.style.color = 'var(--ios-green)';
    }
  }
  updatePOSCalculationsDOM();
}

function updatePOSCalculationsDOM() {
  const subtotal = billCart.reduce((s, item) => s + item.qty * item.price, 0);
  let discountAmt = 0;
  if (billDiscountType === 'percent') {
    discountAmt = (subtotal * Math.min(100, Math.max(0, parseFloat(billDiscount) || 0))) / 100;
  } else {
    discountAmt = Math.min(subtotal, Math.max(0, parseFloat(billDiscount) || 0));
  }
  const taxableSubtotal = Math.max(0, subtotal - discountAmt);
  const taxAmt = taxableSubtotal * (state.shop.taxRate || 0) / 100;
  const grandTotal = taxableSubtotal + taxAmt;
  const actualPaid = (billPaidAmount !== null && billPaidAmount !== undefined && billPaidAmount !== '') ? Math.min(grandTotal, Math.max(0, parseFloat(billPaidAmount))) : grandTotal;
  const dueAmt = Math.max(0, grandTotal - actualPaid);

  const taxableRow = document.getElementById('posTaxableRow');
  const taxableVal = document.getElementById('posTaxableVal');
  const taxVal = document.getElementById('posTaxVal');
  const grandVal = document.getElementById('posGrandVal');
  const dueInput = document.getElementById('posDueInput');
  const paidInput = document.getElementById('posPaidInput');

  if (taxableRow) taxableRow.style.display = discountAmt > 0 ? 'flex' : 'none';
  if (taxableVal) taxableVal.textContent = state.shop.currency + fmtNum(taxableSubtotal, 2);
  if (taxVal) taxVal.textContent = state.shop.currency + fmtNum(taxAmt, 2);
  if (grandVal) grandVal.textContent = state.shop.currency + fmtNum(grandTotal, 2);
  if (paidInput && (billPaidAmount === null || billPaidAmount === undefined)) {
    paidInput.placeholder = fmtNum(grandTotal, 2);
  }
  if (dueInput) {
    dueInput.value = state.shop.currency + fmtNum(dueAmt, 2);
    dueInput.style.color = dueAmt > 0 ? 'var(--ios-red)' : 'var(--ios-green)';
  }
}

function filterPOSItemsDOM() {
  const query = (billSearchQuery || '').toLowerCase();
  const itemCards = document.querySelectorAll('.bill-item-card');
  itemCards.forEach(card => {
    const itemName = (card.querySelector('.bill-item-name')?.textContent || '').toLowerCase();
    if (itemName.includes(query)) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

function refreshPOSUI() {
  const container = document.getElementById('billSubTabContent');
  if (!container || billingSubTab !== 'new') return;

  // 1. Update items list steppers & selected state in-place
  const itemCards = document.querySelectorAll('.bill-item-card');
  itemCards.forEach(card => {
    const plusBtn = card.querySelector('.qty-btn.plus');
    if (!plusBtn) return;
    const match = plusBtn.getAttribute('onclick')?.match(/['"]([^'"]+)['"]/);
    if (!match) return;
    const itemId = match[1];
    const inCart = billCart.find(c => c.itemId === itemId);
    const cartQty = inCart ? inCart.qty : 0;

    const stepper = card.querySelector('.qty-stepper');
    if (cartQty > 0) {
      card.classList.add('selected');
      if (stepper) {
        stepper.innerHTML = `
          <button class="qty-btn" onclick="decrementCartItem('${itemId}')"> - </button>
          <span class="qty-val">${cartQty}</span>
          <button class="qty-btn plus" onclick="incrementCartItem('${itemId}')"> + </button>
        `;
      }
    } else {
      card.classList.remove('selected');
      if (stepper) {
        stepper.innerHTML = `
          <button class="qty-btn plus" onclick="incrementCartItem('${itemId}')"> + </button>
        `;
      }
    }
  });

  // 2. Update or render cart checkout box in-place
  let cartContainer = document.getElementById('posCartContainer');
  if (billCart.length === 0) {
    if (cartContainer) cartContainer.remove();
    return;
  }

  const subtotal = billCart.reduce((s, item) => s + item.qty * item.price, 0);
  let discountAmt = 0;
  if (billDiscountType === 'percent') {
    discountAmt = (subtotal * Math.min(100, Math.max(0, parseFloat(billDiscount) || 0))) / 100;
  } else {
    discountAmt = Math.min(subtotal, Math.max(0, parseFloat(billDiscount) || 0));
  }
  const taxableSubtotal = Math.max(0, subtotal - discountAmt);
  const taxAmt = taxableSubtotal * (state.shop.taxRate || 0) / 100;
  const grandTotal = taxableSubtotal + taxAmt;
  const actualPaid = (billPaidAmount !== null && billPaidAmount !== undefined && billPaidAmount !== '') ? Math.min(grandTotal, Math.max(0, parseFloat(billPaidAmount))) : grandTotal;
  const dueAmt = Math.max(0, grandTotal - actualPaid);

  const cartHtml = `
    <div class="card fade-in" style="margin-top:12px;" id="posCartContainer">
      <div class="card-header">
        <h3>Current Order (${billCart.length} item${billCart.length > 1 ? 's' : ''})</h3>
        <button class="btn-sm btn-secondary" onclick="billCart=[];billDiscount=0;billPaidAmount=null;refreshPOSUI()">Clear Cart</button>
      </div>

      <div style="max-height:160px;overflow-y:auto;margin-bottom:10px;">
        ${billCart.map(item => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border);font-size:13px;">
            <div>
              <span style="font-weight:600;">${item.name}</span>
              <span style="font-size:11px;color:var(--text-muted);"> (${item.qty} x ${state.shop.currency}${fmtNum(item.price, 2)})</span>
            </div>
            <div style="font-weight:700;">${state.shop.currency}${fmtNum(item.qty * item.price, 2)}</div>
          </div>
        `).join('')}
      </div>

      <div class="bill-summary" style="background:rgba(0,122,255,0.03);padding:14px;border-radius:14px;border:1px solid rgba(0,122,255,0.15);">
        <div class="summary-row"><span>Subtotal</span><span>${state.shop.currency}${fmtNum(subtotal, 2)}</span></div>

        <!-- Discount Section (% OR Rupees) -->
        <div class="summary-row" style="align-items:center;margin:6px 0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-weight:600;color:var(--ios-green);">Discount</span>
            <div style="display:inline-flex;background:rgba(52,199,89,0.12);border:1px solid var(--ios-green);border-radius:8px;padding:2px;gap:2px;">
              <button type="button" id="btnDiscountRupees" style="padding:2px 10px;font-size:11px;font-weight:800;border:none;border-radius:6px;cursor:pointer;${billDiscountType === 'rupees' ? 'background:var(--ios-green);color:#fff;' : 'background:transparent;color:var(--ios-green);'}" onclick="setBillDiscountType('rupees')">₹</button>
              <button type="button" id="btnDiscountPercent" style="padding:2px 10px;font-size:11px;font-weight:800;border:none;border-radius:6px;cursor:pointer;${billDiscountType === 'percent' ? 'background:var(--ios-green);color:#fff;' : 'background:transparent;color:var(--ios-green);'}" onclick="setBillDiscountType('percent')">%</button>
            </div>
          </div>
          <input type="number" id="posDiscountInput" min="0" max="${billDiscountType === 'percent' ? 100 : subtotal}" step="any" value="${billDiscount || ''}" placeholder="${billDiscountType === 'percent' ? '0%' : '₹0'}" 
            oninput="billDiscount=parseFloat(this.value)||0;updatePOSCalculationsDOM();" 
            style="width:110px;padding:4px 8px;font-size:13px;text-align:right;border-radius:8px;border:1px solid var(--ios-green);font-weight:700;">
        </div>

        <div class="summary-row" id="posTaxableRow" style="font-size:12px;color:var(--text-muted);display:${discountAmt > 0 ? 'flex' : 'none'};">
          <span>Taxable Subtotal</span>
          <span id="posTaxableVal">${state.shop.currency}${fmtNum(taxableSubtotal, 2)}</span>
        </div>

        ${state.shop.taxRate > 0 ? `<div class="summary-row"><span>Tax (${state.shop.taxRate}%)</span><span id="posTaxVal">${state.shop.currency}${fmtNum(taxAmt, 2)}</span></div>` : ''}

        <div class="summary-row summary-total" style="border-top:1px solid var(--border-light);padding-top:8px;margin-top:6px;">
          <span>Grand Total</span>
          <span id="posGrandVal" style="color:var(--ios-blue);font-size:20px;font-weight:800;">${state.shop.currency}${fmtNum(grandTotal, 2)}</span>
        </div>

        <!-- Payment Mode Select -->
        <div class="form-group" style="margin-top:12px;margin-bottom:8px;">
          <label class="form-label" style="font-weight:700;">Payment Mode</label>
          <select id="billPayModeSelect" onchange="billPaymentMode=this.value;refreshPOSUI();" style="padding:10px;border-radius:10px;font-weight:600;">
            <option value="Cash" ${billPaymentMode === 'Cash' ? 'selected' : ''}>💵 Cash</option>
            <option value="UPI" ${billPaymentMode === 'UPI' ? 'selected' : ''}>📱 UPI / QR Code</option>
            <option value="Net Banking" ${billPaymentMode === 'Net Banking' ? 'selected' : ''}>🏦 Net Banking</option>
            <option value="Debit Card" ${billPaymentMode === 'Debit Card' ? 'selected' : ''}>💳 Debit Card</option>
            <option value="Credit Card" ${billPaymentMode === 'Credit Card' ? 'selected' : ''}>💳 Credit Card</option>
            <option value="Cheque" ${billPaymentMode === 'Cheque' ? 'selected' : ''}>📄 Cheque</option>
            <option value="Split Payment" ${billPaymentMode === 'Split Payment' ? 'selected' : ''}>🔀 Split Payment (Multiple Modes)</option>
          </select>
        </div>

        <!-- Split Payments Builder -->
        ${billPaymentMode === 'Split Payment' ? `
          <div style="background:#fff;padding:12px;border-radius:12px;border:1px dashed var(--ios-blue);margin-bottom:12px;">
            <div style="font-size:12px;font-weight:700;color:var(--ios-blue);margin-bottom:8px;">🔀 Multiple Payment Modes Breakdown</div>
            ${billSplitPayments.map((sp, idx) => `
              <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
                <select style="flex:1;padding:6px;font-size:12px;border-radius:8px;" onchange="billSplitPayments[${idx}].mode=this.value;">
                  ${['Cash', 'UPI', 'Net Banking', 'Debit Card', 'Credit Card', 'Cheque'].map(m => `<option value="${m}" ${sp.mode === m ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                <input type="number" placeholder="Amount (₹)" value="${sp.amount || ''}" oninput="billSplitPayments[${idx}].amount=parseFloat(this.value)||0;" style="width:100px;padding:6px;font-size:12px;border-radius:8px;">
                <button class="btn-sm btn-danger" onclick="billSplitPayments.splice(${idx},1);refreshPOSUI()">✕</button>
              </div>
            `).join('')}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
              <button class="btn-sm btn-secondary" onclick="billSplitPayments.push({mode:'UPI',amount:0});refreshPOSUI()">➕ Add Mode</button>
              <button class="btn-sm btn-accent" onclick="autoFillSplitBalance(${actualPaid})">⚡ Auto-Fill Balance</button>
            </div>
          </div>
        ` : ''}

        <!-- Paid & Due Row -->
        <div class="form-row" style="margin-top:10px;">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Amount Paid (₹)</label>
            <input type="number" id="posPaidInput" min="0" max="${grandTotal}" step="1" value="${billPaidAmount !== null ? billPaidAmount : ''}" 
              placeholder="${fmtNum(grandTotal, 2)}" oninput="billPaidAmount=this.value!==''?parseFloat(this.value):null;updatePOSCalculationsDOM();" 
              style="font-weight:700;color:var(--ios-green);">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Balance Due (₹)</label>
            <input type="text" id="posDueInput" readonly value="${state.shop.currency}${fmtNum(dueAmt, 2)}" 
              style="font-weight:800;color:${dueAmt > 0 ? 'var(--ios-red)' : 'var(--ios-green)'};background:rgba(0,0,0,0.03);">
          </div>
        </div>
      </div>

      <button class="btn-primary" style="width:100%;margin-top:14px;padding:14px;font-size:16px;" onclick="generateBillSubmit()">🧾 Complete & Print Bill</button>
    </div>
  `;

  if (cartContainer) {
    cartContainer.outerHTML = cartHtml;
  } else {
    container.insertAdjacentHTML('beforeend', cartHtml);
  }
}

async function openA4InvoicePrint(id) {
  try {
    const res = await apiFetch(`/bills/${id}`);
    if (!res.success || !res.data) { alert('Invoice details not found'); return; }

    const b = res.data;
    const s = state.shop;
    const dt = new Date(b.created_at || Date.now());
    const dateStr = dt.toLocaleDateString('en-IN');
    const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const items = b.items || [];

    const a4Html = `
      <div class="a4-invoice">
        <div class="a4-header">
          <div class="a4-brand">
            <h1>${s.name.toUpperCase()}</h1>
            <p style="font-weight:600;color:#475569;">Quality & Freshness Guaranteed</p>
            <p>${s.address || 'Main Commercial Street'}</p>
            <p>Phone: ${s.phone || 'N/A'} | Email: support@${s.name.toLowerCase().replace(/\s+/g, '')}.com</p>
            ${s.gst ? `<p><strong>GSTIN: ${s.gst}</strong></p>` : ''}
          </div>
          <div class="a4-meta">
            <h2>TAX INVOICE</h2>
            <p><strong>Invoice No:</strong> #${b.bill_number}</p>
            <p><strong>Date:</strong> ${dateStr} ${timeStr}</p>
            ${b.split_modes && b.split_modes.length > 0 ? `<p><strong>Payment Modes:</strong> ${b.split_modes.map(sm => `${sm.mode}: ${s.currency}${fmtNum(sm.amount, 2)}`).join(', ')}</p>` : `<p><strong>Payment Mode:</strong> ${b.payment_mode || 'Cash'}</p>`}
            <p><strong>Cashier:</strong> ${b.cashier_name || 'Staff'}</p>
          </div>
        </div>

        <div class="a4-info-grid">
          <div>
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">BILLED TO:</div>
            <div style="font-size:15px;font-weight:800;color:#0f172a;margin-top:2px;">${b.customer_name || 'Walk-in Customer'}</div>
            <div style="color:#475569;">📞 Mobile: ${b.customer_phone || 'N/A'}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">INVOICE STATUS:</div>
            <div style="font-size:16px;font-weight:800;color:${b.status === 'Cancelled' ? '#94a3b8' : b.due_amount > 0 ? '#ef4444' : '#10b981'};margin-top:2px;">
              ${b.status === 'Cancelled' ? 'CANCELLED' : b.payment_status || 'PAID'}
            </div>
          </div>
        </div>

        <table class="a4-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>Product Description</th>
              <th style="text-align:center;">Qty</th>
              <th style="text-align:right;">Rate (${s.currency})</th>
              <th style="text-align:right;">Total (${s.currency})</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((i, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${i.item_name}</strong></td>
                <td style="text-align:center;">${i.qty}</td>
                <td style="text-align:right;">${fmtNum(i.price, 2)}</td>
                <td style="text-align:right;font-weight:700;">${fmtNum(i.total, 2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="a4-summary">
          <div style="max-width:300px;font-size:11px;color:#64748b;">
            <strong>Terms & Conditions:</strong><br>
            1. Goods once sold cannot be returned or exchanged.<br>
            2. All disputes subject to local jurisdiction.<br>
            3. Computer generated invoice — no signature required.
          </div>

          <div class="a4-total-box">
            <div class="a4-total-row"><span>Subtotal</span><span>${s.currency}${fmtNum(b.subtotal, 2)}</span></div>
            ${b.tax > 0 ? `<div class="a4-total-row"><span>Tax</span><span>${s.currency}${fmtNum(b.tax, 2)}</span></div>` : ''}
            ${b.discount > 0 ? `<div class="a4-total-row"><span>Discount</span><span>-${s.currency}${fmtNum(b.discount, 2)}</span></div>` : ''}
            <div class="a4-total-row grand"><span>Grand Total</span><span>${s.currency}${fmtNum(b.total, 2)}</span></div>
            <div class="a4-total-row"><span>Amount Paid</span><span>${s.currency}${fmtNum(b.paid_amount || b.total, 2)}</span></div>
            ${b.due_amount > 0 ? `<div class="a4-total-row" style="color:#ef4444;font-weight:700;"><span>Balance Due</span><span>${s.currency}${fmtNum(b.due_amount, 2)}</span></div>` : ''}
          </div>
        </div>

        <div class="a4-footer">
          <div>Customer Signature</div>
          <div>Authorized Signatory (${s.name})</div>
        </div>
      </div>
    `;

    const pa = document.getElementById('printArea');
    pa.innerHTML = a4Html;
    pa.style.display = 'block';
    window.print();
    pa.style.display = 'none';
  } catch (e) {
    alert(e.message || 'Failed to generate A4 invoice print');
  }
}

async function shareBillWhatsApp(id) {
  try {
    const res = await apiFetch(`/bills/${id}`);
    if (!res.success || !res.data) { alert('Bill details not found'); return; }

    const b = res.data;
    const s = state.shop;
    const items = b.items || [];
    const phone = (b.customer_phone || '').replace(/\D/g, '');

    const text = `🧾 *TAX INVOICE - ${s.name.toUpperCase()}*\nBranch: ${s.name}\nInvoice #: ${b.bill_number}\nCustomer: ${b.customer_name || 'Walk-in'}\nDate: ${formatDateFull(b.created_at)}\n-------------------\n${items.map((i, idx) => `${idx + 1}. ${i.item_name} (x${i.qty}): ${s.currency}${fmtNum(i.total, 2)}`).join('\n')}\n-------------------\nSubtotal: ${s.currency}${fmtNum(b.subtotal, 2)}\n*Grand Total: ${s.currency}${fmtNum(b.total, 2)}*\nAmount Paid: ${s.currency}${fmtNum(b.paid_amount || b.total, 2)}\nStatus: ${b.payment_status || 'Paid'}\n\nThank you for shopping with us! 🙏`;

    const targetUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(targetUrl, '_blank');
  } catch (e) {
    alert(e.message);
  }
}

async function cancelBillSubmit(id) {
  const reason = prompt("Please enter a reason for cancelling this bill:", "Customer Cancellation");
  if (reason === null) return;

  try {
    const res = await apiFetch(`/bills/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.trim() || 'Customer Cancellation' })
    });

    if (res.success) {
      toast('❌ Bill cancelled and stock restored');
      renderSection('bill');
    }
  } catch (err) {
    alert(err.message || 'Failed to cancel bill');
  }
}

async function duplicateBill(id) {
  try {
    const res = await apiFetch(`/bills/${id}`);
    if (!res.success || !res.data) return;

    const b = res.data;
    billCart = (b.items || []).map(i => ({
      itemId: i.item_id,
      name: i.item_name,
      price: parseFloat(i.price),
      qty: parseFloat(i.qty),
      stock: 999,
      unit: 'Pcs'
    }));

    billCustomer = { personId: b.person_id || null, name: b.customer_name || '', phone: b.customer_phone || '' };
    billingSubTab = 'new';
    renderSection('bill');
    toast('📋 Bill items duplicated to new order');
  } catch (e) {
    alert(e.message);
  }
}

function handleBillPartySelect(personId) {
  if (!personId) {
    billCustomer = { personId: null, name: '', phone: '' };
  } else {
    const p = state.people.find(x => x.id === personId);
    if (p) {
      billCustomer = { personId: p.id, name: p.name, phone: p.mobile || '' };
    }
  }
  renderSection('bill');
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

  refreshPOSUI();
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
  refreshPOSUI();
}

function autoFillSplitBalance(totalPaid) {
  const currentSum = billSplitPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const remaining = Math.max(0, totalPaid - currentSum);
  if (billSplitPayments.length > 0) {
    billSplitPayments[billSplitPayments.length - 1].amount = remaining;
    refreshPOSUI();
  }
}

async function generateBillSubmit() {
  if (billCart.length === 0) {
    alert('Please add at least one item to the bill');
    return;
  }

  for (const item of billCart) {
    if (!item.qty || item.qty <= 0) {
      alert(`Quantity for item '${item.name}' must be greater than zero`);
      return;
    }
  }

  const custName = (billCustomer.name || '').trim() || 'Walk-in Customer';
  const custPhone = (billCustomer.phone || '').trim().replace(/\D/g, '');

  if (billCustomer.phone && custPhone.length !== 10) {
    alert('Customer mobile number must be exactly 10 numeric digits');
    return;
  }

  const subtotal = billCart.reduce((s, i) => s + i.qty * i.price, 0);
  let discountAmt = 0;
  if (billDiscountType === 'percent') {
    discountAmt = (subtotal * Math.min(100, Math.max(0, parseFloat(billDiscount) || 0))) / 100;
  } else {
    discountAmt = Math.min(subtotal, Math.max(0, parseFloat(billDiscount) || 0));
  }
  const taxableSubtotal = Math.max(0, subtotal - discountAmt);
  const taxAmt = taxableSubtotal * (state.shop.taxRate || 0) / 100;
  const grandTotal = taxableSubtotal + taxAmt;

  if (discountAmt > subtotal) {
    alert('Discount cannot exceed the subtotal');
    return;
  }

  const paidAmount = (billPaidAmount !== null && billPaidAmount !== undefined && billPaidAmount !== '') ? Math.max(0, parseFloat(billPaidAmount)) : grandTotal;

  if (paidAmount > grandTotal) {
    alert(`Paid amount (₹${paidAmount}) cannot exceed grand total (₹${grandTotal})`);
    return;
  }

  let splitPayload = [];
  if (billPaymentMode === 'Split Payment') {
    splitPayload = billSplitPayments.filter(sp => parseFloat(sp.amount) > 0);
    const splitSum = splitPayload.reduce((s, sp) => s + parseFloat(sp.amount), 0);
    if (Math.abs(splitSum - paidAmount) > 0.01) {
      alert(`Split payment breakdown total (₹${splitSum}) must equal the Paid Amount (₹${paidAmount})!`);
      return;
    }
  }

  const payload = {
    personId: billCustomer.personId || null,
    customerName: custName,
    customerPhone: custPhone,
    items: billCart,
    subtotal,
    discount: discountAmt,
    tax: taxAmt,
    total: grandTotal,
    paidAmount,
    paymentMode: billPaymentMode,
    splitPayments: splitPayload
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
      billCustomer = { personId: null, name: '', phone: '' };
      billDiscount = 0;
      billPaidAmount = null;
      billPaymentMode = 'Cash';

      showBillReceipt(generatedBill);
      await loadInitialData();
    }
  } catch (err) {
    alert(err.message || 'Failed to generate bill');
  }
}

// Clear / Pay Outstanding Due Modal for Existing Invoices
async function openPayDueModal(billId) {
  try {
    const res = await apiFetch(`/bills/${billId}`);
    if (!res.success || !res.data) {
      alert('Bill details not found');
      return;
    }

    const bill = res.data;
    const currentDue = parseFloat(bill.due_amount || 0);

    showModal(`💳 Clear Outstanding Due — Bill #${bill.bill_number}`, `
      <div class="fade-in">
        <div style="background:rgba(255,59,48,0.06);padding:14px;border-radius:12px;border:1px solid rgba(255,59,48,0.2);margin-bottom:16px;">
          <div style="font-size:12px;color:var(--text-muted);">Customer / B2B Party</div>
          <div style="font-weight:800;font-size:16px;color:#0f172a;">${bill.customer_name || 'Walk-in Customer'}</div>
          ${bill.customer_phone ? `<div style="font-size:12px;color:var(--text-secondary);">📞 Mobile: ${bill.customer_phone}</div>` : ''}

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;text-align:center;">
            <div style="background:#fff;padding:8px;border-radius:8px;">
              <div style="font-size:10px;color:var(--text-muted);">GRAND TOTAL</div>
              <div style="font-weight:700;">${state.shop.currency}${fmtNum(bill.total, 2)}</div>
            </div>
            <div style="background:#fff;padding:8px;border-radius:8px;">
              <div style="font-size:10px;color:var(--text-muted);">TOTAL PAID</div>
              <div style="font-weight:700;color:var(--ios-green);">${state.shop.currency}${fmtNum(bill.paid_amount, 2)}</div>
            </div>
            <div style="background:#fff;padding:8px;border-radius:8px;">
              <div style="font-size:10px;color:var(--text-muted);">CURRENT DUE</div>
              <div style="font-weight:800;color:var(--ios-red);">${state.shop.currency}${fmtNum(currentDue, 2)}</div>
            </div>
          </div>
        </div>

        <form id="payDueForm" onsubmit="handlePayDueSubmit(event, '${bill.id}', ${currentDue})">
          <div class="form-group">
            <label class="form-label">Payment Amount (₹) *</label>
            <div style="display:flex;gap:8px;">
              <input type="number" id="payDueAmount" min="1" max="${currentDue}" step="0.01" value="${currentDue}" required style="font-size:18px;font-weight:800;color:var(--ios-green);">
              <button type="button" class="btn-secondary" style="padding:0 12px;white-space:nowrap;font-size:12px;" onclick="document.getElementById('payDueAmount').value=${currentDue}">Full Due</button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Payment Method *</label>
            <select id="payDueMode" style="padding:10px;font-weight:600;">
              <option value="Cash">💵 Cash</option>
              <option value="UPI">📱 UPI / QR Code</option>
              <option value="Net Banking">🏦 Net Banking</option>
              <option value="Debit Card">💳 Debit Card</option>
              <option value="Credit Card">💳 Credit Card</option>
              <option value="Cheque">📄 Cheque</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Transaction Reference # (Optional)</label>
            <input type="text" id="payDueRef" placeholder="e.g. UTR / Cheque / Txn ID">
          </div>

          <div class="form-group">
            <label class="form-label">Notes (Optional)</label>
            <textarea id="payDueNotes" rows="2" placeholder="e.g. Settlement for bill #${bill.bill_number}"></textarea>
          </div>

          <button type="submit" class="btn-primary" style="width:100%;padding:14px;font-size:16px;">💰 Record Payment & Update Invoice</button>
        </form>
      </div>
    `);
  } catch (e) {
    alert(e.message);
  }
}

async function handlePayDueSubmit(event, billId, maxDue) {
  event.preventDefault();
  const amt = parseFloat(document.getElementById('payDueAmount').value) || 0;
  const mode = document.getElementById('payDueMode').value;
  const ref = document.getElementById('payDueRef').value.trim();
  const notes = document.getElementById('payDueNotes').value.trim();

  if (amt <= 0 || amt > maxDue) {
    alert(`Payment amount must be between ₹1 and ₹${maxDue}`);
    return;
  }

  try {
    const res = await apiFetch(`/bills/${billId}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount: amt, payment_mode: mode, reference_no: ref, notes })
    });

    if (res.success) {
      closeModal();
      toast(`✅ Payment of ${state.shop.currency}${fmtNum(amt, 2)} recorded!`);
      await loadInitialData();
      renderSection(currentSection);
    }
  } catch (err) {
    alert(err.message || 'Failed to record payment');
  }
}

// Dashboard Drilldown Modal for Total Receivables
async function openReceivableDrilldownModal(type = 'all') {
  try {
    const res = await apiFetch('/bills');
    if (!res.success) return;

    let bills = (res.data || []).filter(b => b.status !== 'Cancelled' && parseFloat(b.due_amount || 0) > 0);

    if (type === 'customer') {
      bills = bills.filter(b => !b.person_id || state.people.some(p => p.id === b.person_id && p.category === 'Customer'));
    } else if (type === 'party') {
      bills = bills.filter(b => b.person_id && state.people.some(p => p.id === b.person_id && p.category === 'Party'));
    } else if (type === 'overdue') {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      bills = bills.filter(b => new Date(b.created_at || b.date).getTime() < thirtyDaysAgo);
    }

    const totalDueSum = bills.reduce((sum, b) => sum + parseFloat(b.due_amount || 0), 0);
    const title = type === 'customer' ? 'Customer Outstanding Receivables' :
      type === 'party' ? 'B2B Party Outstanding Receivables' :
        type === 'overdue' ? 'Overdue Invoices (>30 Days)' : 'Total Outstanding Receivables';

    showModal(`📈 ${title} (${bills.length})`, `
      <div class="fade-in">
        <div style="background:linear-gradient(135deg, rgba(255,59,48,0.1), rgba(255,149,0,0.1));padding:12px;border-radius:12px;border:1px solid rgba(255,59,48,0.2);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);">TOTAL UNPAID RECEIVABLES</div>
            <div style="font-size:20px;font-weight:800;color:var(--ios-red);">${state.shop.currency}${fmtNum(totalDueSum, 2)}</div>
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--ios-blue);">${bills.length} Outstanding Bills</div>
        </div>

        <div style="max-height:360px;overflow-y:auto;">
          ${bills.length === 0 ? '<div style="text-align:center;padding:30px;color:var(--text-muted);">No outstanding invoices found! 🎉</div>' :
        bills.map(b => `
              <div class="card" style="margin-bottom:8px;padding:10px;border:1px solid var(--border-light);">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                  <div>
                    <div style="font-weight:800;">#${b.bill_number} · <span style="font-size:13px;color:var(--ios-blue);">${b.customer_name || 'Walk-in'}</span></div>
                    <div style="font-size:11px;color:var(--text-muted);">📞 ${b.customer_phone || 'N/A'} · ${formatDateFull(b.created_at)}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:800;color:var(--ios-red);">${state.shop.currency}${fmtNum(b.due_amount, 2)} due</div>
                    <div style="font-size:10px;color:var(--text-muted);">Total: ${state.shop.currency}${fmtNum(b.total, 2)}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">
                  <button class="btn-sm btn-secondary" onclick="viewBill('${b.id}')">👁 Details</button>
                  <button class="btn-sm btn-primary" onclick="closeModal();openPayDueModal('${b.id}')">💳 Clear Due</button>
                </div>
              </div>
            `).join('')
      }
        </div>
      </div>
    `);
  } catch (e) {
    alert(e.message);
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
  const discountVal = parseFloat(bill.discount) || 0;
  const paidVal = parseFloat(bill.paid_amount !== undefined ? bill.paid_amount : bill.total) || 0;
  const dueVal = parseFloat(bill.due_amount) || 0;

  let splitModes = [];
  try {
    if (bill.payment_modes_split) {
      splitModes = JSON.parse(bill.payment_modes_split);
    } else if (bill.split_payments) {
      splitModes = bill.split_payments;
    }
  } catch (e) { }

  return `
    <div class="receipt">
      <div class="receipt-center">
        ${b.logo ? `<img src="${b.logo}" class="receipt-logo" alt="logo">` : `<div class="receipt-logo-placeholder">${b.name.substring(0, 3).toUpperCase()}</div>`}
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
          <div>${bi.name || bi.item_name}</div>
          <div class="receipt-row"><span></span><span>${bi.qty} x ${b.currency}${fmtNum(bi.price, 2)} = ${b.currency}${fmtNum(bi.total || (bi.qty * bi.price), 2)}</span></div>
        </div>
      `).join('')}
      <div class="receipt-divider"></div>
      <div class="receipt-row"><span>Subtotal</span><span>${b.currency}${fmtNum(bill.subtotal, 2)}</span></div>
      ${discountVal > 0 ? `<div class="receipt-row"><span>Discount (₹)</span><span>-${b.currency}${fmtNum(discountVal, 2)}</span></div>` : ''}
      ${(parseFloat(bill.tax) || 0) > 0 ? `<div class="receipt-row"><span>Tax (${b.tax_rate || b.taxRate || 0}%)</span><span>${b.currency}${fmtNum(bill.tax, 2)}</span></div>` : ''}
      <div class="receipt-divider"></div>
      <div class="receipt-row" style="font-weight:800;font-size:14px;"><span>GRAND TOTAL</span><span>${b.currency}${fmtNum(bill.total, 2)}</span></div>
      <div class="receipt-divider"></div>

      ${splitModes && splitModes.length > 0 ? `
        <div style="font-size:10px;font-weight:700;margin-bottom:4px;">Payment Modes (Split):</div>
        ${splitModes.map(sm => `<div class="receipt-row"><span>· ${sm.mode}:</span><span>${b.currency}${fmtNum(sm.amount, 2)}</span></div>`).join('')}
      ` : `<div class="receipt-row"><span>Payment Mode:</span><span>${bill.payment_mode || 'Cash'}</span></div>`}

      <div class="receipt-row"><span>Amount Paid:</span><span>${b.currency}${fmtNum(paidVal, 2)}</span></div>
      ${dueVal > 0 ? `<div class="receipt-row" style="font-weight:700;color:#d9534f;"><span>Balance Due:</span><span>${b.currency}${fmtNum(dueVal, 2)}</span></div>` : ''}

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

// ─── Stock Section ─────────────────────────────────────────────────────────────
let stockTab = 'all';
let stockSearch = '';

async function renderStock(c) {
  try {
    const res = await apiFetch(`/items?search=${encodeURIComponent(stockSearch)}`);
    if (res.success) state.items = res.data || [];

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
  } catch (err) {
    c.innerHTML = `<div class="alert alert-warn">Failed to load stock section: ${err.message}</div>`;
  }
}

function setStockTab(t) { stockTab = t; renderSection('stock'); }

function renderAllStock() {
  return `
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input type="text" placeholder="Search inventory..." value="${stockSearch}" oninput="stockSearch=this.value;renderSection('stock')">
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <button class="btn-primary" style="flex:2;" onclick="openAddItem()">➕ Add New Item</button>
      <button class="btn-secondary" style="flex:1;" onclick="setStockTab('in')">📥 Restock</button>
      <button class="btn-secondary" style="flex:1;" onclick="setStockTab('out')">📤 Issue</button>
    </div>

    ${state.items.length === 0 ? `<div class="empty-state"><div class="empty-state-icon">📦</div><p>No items found in inventory.</p></div>` :
      state.items.map(item => `
        <div class="stock-item ${item.stock <= state.shop.lowStockAlert ? 'low-stock' : 'ok-stock'}">
          <div class="stock-icon">📦</div>
          <div class="stock-info">
            <div class="stock-name">${item.name}</div>
            <div class="stock-meta">Sell: ${state.shop.currency}${fmtNum(item.selling_price || item.price, 2)} · ${item.category || 'General'}</div>
          </div>
          <div class="stock-qty">
            <div class="qty-num">${item.stock || item.qty || 0}</div>
            <div class="qty-unit">${item.unit || 'Pcs'}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            <button class="btn-sm btn-success" title="Add Stock" onclick="openQuickStockIn('${item.id}')">➕</button>
            <button class="btn-sm btn-warn" title="Remove Stock" style="background:var(--ios-orange, #ff9500);color:#fff;border:none;" onclick="openQuickStockOut('${item.id}')">➖</button>
            <button class="btn-sm btn-secondary" title="Edit Item" onclick="openEditItem('${item.id}')">✏</button>
            <button class="btn-sm btn-danger" title="Delete Item" onclick="deleteItem('${item.id}')">🗑</button>
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
  const itemId = document.getElementById('soItem').value;
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

function openQuickStockIn(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  showModal(`📥 Quick Add Stock - ${item.name}`, `
    <div class="form-group">
      <label class="form-label">Current Available: <strong>${item.stock || 0} ${item.unit || 'Pcs'}</strong></label>
    </div>
    <div class="form-group">
      <label class="form-label">Quantity to Add *</label>
      <input type="number" id="quickSiQty" placeholder="e.g. 10" min="0.01" step="0.01" autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">Supplier (Optional)</label>
      <input type="text" id="quickSiSupplier" placeholder="e.g. Acme Wholesalers">
    </div>
    <div class="form-group">
      <label class="form-label">Notes (Optional)</label>
      <input type="text" id="quickSiNotes" placeholder="e.g. Restock">
    </div>
    <button class="btn-success" style="width:100%;margin-top:10px;" onclick="submitQuickStockIn('${item.id}')">✅ Confirm Add Stock</button>
  `);
}

async function submitQuickStockIn(itemId) {
  const qty = parseFloat(document.getElementById('quickSiQty').value);
  if (isNaN(qty) || qty <= 0) { alert('Please enter a valid positive quantity'); return; }
  const supplier = document.getElementById('quickSiSupplier').value;
  const notes = document.getElementById('quickSiNotes').value;

  try {
    const res = await apiFetch('/stock/in', {
      method: 'POST',
      body: JSON.stringify({ itemId, qty, supplier, notes })
    });
    if (res.success) {
      closeModal();
      toast('✅ Stock added successfully');
      renderSection('stock');
    }
  } catch (err) {
    alert(err.message || 'Failed to add stock');
  }
}

function openQuickStockOut(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  showModal(`📤 Quick Remove Stock - ${item.name}`, `
    <div class="form-group">
      <label class="form-label">Current Available: <strong>${item.stock || 0} ${item.unit || 'Pcs'}</strong></label>
    </div>
    <div class="form-group">
      <label class="form-label">Quantity to Remove *</label>
      <input type="number" id="quickSoQty" placeholder="e.g. 5" min="0.01" step="0.01" autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">Reason</label>
      <select id="quickSoReason">
        <option>Sold</option>
        <option>Damaged</option>
        <option>Expired</option>
        <option>Other</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Notes (Optional)</label>
      <input type="text" id="quickSoNotes" placeholder="e.g. Manual Adjustment">
    </div>
    <button class="btn-danger" style="width:100%;margin-top:10px;" onclick="submitQuickStockOut('${item.id}')">📤 Confirm Remove Stock</button>
  `);
}

async function submitQuickStockOut(itemId) {
  const qty = parseFloat(document.getElementById('quickSoQty').value);
  if (isNaN(qty) || qty <= 0) { alert('Please enter a valid positive quantity'); return; }
  const reason = document.getElementById('quickSoReason').value;
  const notes = document.getElementById('quickSoNotes').value;

  try {
    const res = await apiFetch('/stock/out', {
      method: 'POST',
      body: JSON.stringify({ itemId, qty, reason, notes })
    });
    if (res.success) {
      closeModal();
      toast('📤 Stock removed successfully');
      renderSection('stock');
    }
  } catch (err) {
    alert(err.message || 'Failed to remove stock');
  }
}

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

// ─── 8. History Section ───────────────────────────────────────────────────────
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
            <div style="font-weight:700;font-size:15px;">#${b.bill_number || b.billNo} <span class="badge ${b.due_amount > 0 ? 'badge-partial' : 'badge-paid'}">${b.payment_status || 'Paid'}</span></div>
            <div style="font-size:12px;color:var(--text-muted);">${b.customer_name || 'Walk-in'} ${b.customer_phone ? '· ' + b.customer_phone : ''}</div>
            <div style="font-size:11px;color:var(--text-light);">${formatDateFull(b.created_at || b.date)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:17px;font-weight:800;color:var(--brown);">${state.shop.currency}${fmtNum(b.total, 2)}</div>
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

// ─── 9. Settings Section ──────────────────────────────────────────────────────
async function renderSettings(c) {
  c.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">⏳ Loading Settings...</div>`;

  const role = currentUser ? currentUser.role : 'Staff';

  // -------------------------------------------------------------
  // 1. PLATFORM SETTINGS (Platform Admin Scope)
  // -------------------------------------------------------------
  if (role === 'Admin') {
    try {
      const res = await apiFetch('/settings/platform');
      const ps = res.data || {};

      c.innerHTML = `
      <div class="fade-in">
        <div class="card" style="background:linear-gradient(135deg, rgba(0,122,255,0.06), rgba(88,86,214,0.06));border:1px solid rgba(0,122,255,0.2);">
          <h3 style="margin-bottom:6px;color:var(--ios-blue);">🌐 STORE MANAGEMENT SYSTEMS — Platform Settings</h3>
          <div style="font-size:13px;color:var(--text-muted);">Configure global multi-tenant SaaS platform parameters, support contacts, and subscription pricing.</div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px;">🛠 General SaaS Platform Configuration</h3>
          <div class="form-group">
            <label class="form-label">Platform Name *</label>
            <input type="text" id="psPlatformName" value="${ps.platform_name || 'STORE MANAGEMENT SYSTEMS'}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Support Email</label>
              <input type="email" id="psSupportEmail" value="${ps.support_email || 'support@storemanagementsystems.com'}">
            </div>
            <div class="form-group">
              <label class="form-label">Support Phone</label>
              <input type="tel" id="psSupportPhone" value="${ps.support_phone || '+1-800-SMS-SaaS'}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Default SaaS Currency</label>
              <select id="psDefaultCurrency">
                ${['₹', '$', '€', '£', '¥', '₵'].map(curr => `<option ${(ps.default_currency || '₹') === curr ? 'selected' : ''}>${curr}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Default Price Per Branch / Month</label>
              <input type="number" id="psDefaultPricePerBranch" value="${ps.default_price_per_branch || 999}" min="0" step="1">
            </div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px;">🔒 Security, Session & Approval Rules</h3>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Session Inactivity Timeout (Minutes)</label>
              <input type="number" id="psSessionTimeout" value="${ps.session_timeout_minutes || 15}" min="1" max="1440">
            </div>
            <div class="form-group">
              <label class="form-label">Auto-Approval Expiry (Hours)</label>
              <input type="number" id="psAutoApprovalHours" value="${ps.auto_approval_hours || 8}" min="1" max="72">
            </div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px;">ℹ Platform System Status & Build</h3>
          <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:12px;font-size:13px;">
            <div>System Engine Status: <span class="badge badge-success">${ps.system_status || 'Operational'}</span></div>
            <div>Build Version: <strong>${ps.version || 'v2.5.0 SaaS Enterprise'}</strong></div>
          </div>
        </div>

        <div class="card" style="border:1px solid rgba(255, 59, 48, 0.3);background:rgba(255, 59, 48, 0.03);">
          <h3 style="color:var(--ios-red);margin-bottom:12px;">🚨 System Backups & Disaster Recovery</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button class="btn-secondary" style="padding:12px;" onclick="downloadBackup()">💾 Backup Database</button>
            <button class="btn-secondary" style="padding:12px;" onclick="openRestoreModal()">📥 Restore Database</button>
          </div>
        </div>

        <button class="btn-primary" style="width:100%;padding:14px;font-size:16px;" onclick="submitPlatformSettings()">💾 Save Platform Settings</button>
      </div>`;
      return;
    } catch (err) {
      c.innerHTML = `<div class="alert alert-warn">Failed to load Platform Settings: ${err.message}</div>`;
      return;
    }
  }

  // -------------------------------------------------------------
  // 2. ORGANIZATION SETTINGS (Organization Owner Scope)
  // -------------------------------------------------------------
  if (role === 'Owner') {
    try {
      const res = await apiFetch('/settings/organization');
      const org = res.data || {};

      c.innerHTML = `
      <div class="fade-in">
        <div class="card" style="background:linear-gradient(135deg, rgba(52,199,89,0.06), rgba(0,122,255,0.06));border:1px solid rgba(52,199,89,0.2);">
          <h3 style="margin-bottom:6px;color:var(--ios-green);">🏢 ${org.name || 'Organization Profile & Settings'}</h3>
          <div style="font-size:13px;color:var(--text-muted);">Manage your Organization defaults, contact details, and branch management.</div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px;">🏢 Organization Details</h3>
          <div class="form-group">
            <label class="form-label">Organization Name *</label>
            <input type="text" id="osOrgName" value="${org.name || ''}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Contact Email</label>
              <input type="email" id="osOrgEmail" value="${org.email || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Contact Mobile</label>
              <input type="tel" id="osOrgPhone" value="${org.phone || ''}">
            </div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px;">💳 Subscription Summary</h3>
          <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:10px;font-size:13px;">
            <div>Plan: <strong>${org.subscription_plan || 'Standard'}</strong></div>
            <div>Status: <span class="badge badge-success">${org.subscription_status || 'Active'}</span></div>
            <div>Active Branches: <strong>${org.active_branch_count || 1} Branch(es)</strong></div>
            <div>Price Per Branch: <strong>${state.shop.currency}${org.price_per_branch || 999}</strong></div>
            <div style="grid-column:span 2;font-size:15px;font-weight:800;color:var(--ios-green);">Total Subscription Amount: ${state.shop.currency}${fmtNum(org.subscription_amount, 0)}</div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:12px;">🏢 Organization Administration</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button class="btn-secondary" style="padding:12px;" onclick="openCreateBranchModal()">📍 Create New Branch</button>
            <button class="btn-secondary" style="padding:12px;" onclick="openStaffManagerModal()">👥 Manage Staff Users</button>
            <button class="btn-secondary" style="padding:12px;grid-column:span 2;" onclick="openRoleManagerModal()">🔑 Roles & Permissions Matrix</button>
          </div>
        </div>

        <button class="btn-primary" style="width:100%;padding:14px;font-size:16px;" onclick="submitOrganizationSettings()">💾 Save Organization Settings</button>
      </div>`;
      return;
    } catch (err) {
      c.innerHTML = `<div class="alert alert-warn">Failed to load Organization Settings: ${err.message}</div>`;
      return;
    }
  }

  // -------------------------------------------------------------
  // 3. BRANCH SETTINGS (Branch Manager / Staff Scope)
  // -------------------------------------------------------------
  c.innerHTML = `
  <div class="fade-in">
    <div class="card">
      <h3 style="margin-bottom:14px;">📍 Branch Location & Profile Settings</h3>

      <div class="form-group" style="text-align:center;">
        <label class="form-label">Branch Logo</label>
        <div class="logo-upload" onclick="document.getElementById('logoFile').click()">
          ${state.shop.logo ? `<img src="${state.shop.logo}" class="logo-preview" alt="logo">` : `<div style="font-size:36px;">SMS</div>`}
          <div style="font-size:12px;color:var(--text-muted);">Tap to upload branch logo</div>
        </div>
        <input type="file" id="logoFile" accept="image/*" style="display:none;" onchange="uploadLogo(this)">
      </div>

      <div class="form-group">
        <label class="form-label">Branch Name *</label>
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
      <h3 style="margin-bottom:14px;">⚙ Branch Operational Defaults</h3>
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

    <button class="btn-primary" style="width:100%;padding:14px;font-size:16px;" onclick="saveSettingsSubmit()">💾 Save Branch Settings</button>
  </div>`;
}

async function submitPlatformSettings() {
  const platform_name = document.getElementById('psPlatformName').value.trim();
  const support_email = document.getElementById('psSupportEmail').value.trim();
  const support_phone = document.getElementById('psSupportPhone').value.trim();
  const default_currency = document.getElementById('psDefaultCurrency').value;
  const default_price_per_branch = parseFloat(document.getElementById('psDefaultPricePerBranch').value) || 999;
  const session_timeout_minutes = parseInt(document.getElementById('psSessionTimeout').value) || 15;
  const auto_approval_hours = parseInt(document.getElementById('psAutoApprovalHours').value) || 8;

  try {
    const res = await apiFetch('/settings/platform', {
      method: 'PUT',
      body: JSON.stringify({
        platform_name, support_email, support_phone, default_currency, default_price_per_branch, session_timeout_minutes, auto_approval_hours
      })
    });
    if (res.success) {
      toast('✅ SaaS Platform Settings updated successfully');
    }
  } catch (e) { alert(e.message || 'Failed to update platform settings'); }
}

async function submitOrganizationSettings() {
  const name = document.getElementById('osOrgName').value.trim();
  const email = document.getElementById('osOrgEmail').value.trim();
  const phone = document.getElementById('osOrgPhone').value.trim();

  try {
    const res = await apiFetch('/settings/organization', {
      method: 'PUT',
      body: JSON.stringify({ name, email, phone })
    });
    if (res.success) {
      toast('✅ Organization Settings updated successfully');
    }
  } catch (e) { alert(e.message || 'Failed to update organization settings'); }
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

// ─── 10. Reports Modal & Export ───────────────────────────────────────────────
function openReportsModal() {
  const today = new Date().toISOString().split('T')[0];

  showModal('📊 Export Reports', `
    <div class="form-group">
      <label class="form-label">Report Type</label>
      <select id="repType">
        <option value="Billing">Billing & Sales Report</option>
        <option value="Outstanding">B2B & B2C Outstanding Report</option>
        <option value="Purchases">Supplier Purchase Restock Report</option>
        <option value="Inventory">Inventory Stock Value Report</option>
        <option value="Low Stock">Low Stock Report</option>
        <option value="Stock Logs">Stock Activity Log</option>
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

// ─── 11. Approval Requests & User Management Modals ─────────────────────────
let approvalTab = 'pending';

async function updateApprovalBadge() {
  if (!currentUser || currentUser.role !== 'Admin') return;
  try {
    const res = await apiFetch('/approvals');
    if (res.success && res.data) {
      const pendingCount = res.data.filter(a => a.status === 'pending').length;
      const btn = document.getElementById('btnTopApprovals');
      if (btn) {
        if (pendingCount > 0) {
          btn.innerHTML = `🛡 Approvals (${pendingCount} Pending)`;
          btn.style.background = '#ff9500';
        } else {
          btn.innerHTML = `🛡 Approvals`;
          btn.style.background = 'rgba(255,149,0,0.3)';
        }
      }
    }
  } catch (e) { }
}

async function openApprovalsModal(tab = 'pending') {
  approvalTab = tab;
  try {
    const res = await apiFetch('/approvals');
    if (!res.success) throw new Error(res.message || 'Failed to load approvals');

    const allApprovals = res.data || [];
    const isSuperAdmin = currentUser && currentUser.role === 'Admin';

    const pendingList = allApprovals.filter(a => a.status === 'pending');
    const approvedList = allApprovals.filter(a => a.status === 'approved');
    const rejectedList = allApprovals.filter(a => a.status === 'rejected');

    const currentList = approvalTab === 'approved' ? approvedList : approvalTab === 'rejected' ? rejectedList : pendingList;

    const approvalsHtml = `
      <div style="padding:4px;">
        <div style="display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid var(--border-light);padding-bottom:8px;">
          <button class="btn-sm ${approvalTab === 'pending' ? 'btn-primary' : 'btn-secondary'}" onclick="openApprovalsModal('pending')">⏳ In Process (${pendingList.length})</button>
          <button class="btn-sm ${approvalTab === 'approved' ? 'btn-success' : 'btn-secondary'}" onclick="openApprovalsModal('approved')">✅ Accepted (${approvedList.length})</button>
          <button class="btn-sm ${approvalTab === 'rejected' ? 'btn-danger' : 'btn-secondary'}" onclick="openApprovalsModal('rejected')">❌ Declined (${rejectedList.length})</button>
        </div>

        <div style="margin-bottom:12px;font-size:12px;color:var(--text-muted);">
          Strict Rule: All requests submitted by Branch Owners appear here for Superadmin review. If not manually acted upon, requests <strong>auto-approve after 8 hours</strong>.
        </div>

        <div style="max-height:380px;overflow-y:auto;">
          ${currentList.length === 0 ? `<div class="empty-state" style="padding:24px;"><p>No ${approvalTab === 'pending' ? 'In Process' : approvalTab} requests found</p></div>` :
        currentList.map(app => {
          const autoTime = new Date(app.auto_approve_at);
          const now = new Date();
          const diffMs = autoTime - now;
          let timeStr = 'Auto-approved';
          if (app.status === 'pending') {
            if (diffMs > 0) {
              const hours = Math.floor(diffMs / (1000 * 60 * 60));
              const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
              timeStr = `Auto-approves in ${hours}h ${mins}m`;
            } else {
              timeStr = 'Auto-approval due';
            }
          }

          return `
                <div class="card" style="margin-bottom:10px;padding:12px;border:1px solid var(--border-light);background:#fff;">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                    <div>
                      <div style="font-weight:700;font-size:14px;color:var(--text-primary);">${app.title}</div>
                      <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Requested by: <strong>${app.requester_name || 'Owner'}</strong> · ${formatDateFull(app.created_at)}</div>
                      <div style="font-size:11px;color:var(--ios-blue);margin-top:2px;font-weight:600;">⏳ ${timeStr}</div>
                    </div>
                    <span class="badge ${app.status === 'approved' ? 'badge-paid' : app.status === 'rejected' ? 'badge-cancelled' : 'badge-partial'}">${app.status === 'pending' ? 'IN PROCESS' : app.status.toUpperCase()}</span>
                  </div>

                  ${app.status === 'pending' && isSuperAdmin ? `
                    <div style="display:flex;gap:8px;margin-top:10px;border-top:1px solid var(--border-light);padding-top:8px;">
                      <button class="btn-sm btn-primary" style="flex:1;" onclick="handleApproveRequest('${app.id}')">✅ Accept (Approve)</button>
                      <button class="btn-sm btn-danger" style="flex:1;" onclick="handleRejectRequest('${app.id}')">❌ Decline (Reject)</button>
                    </div>
                  ` : ''}
                </div>
              `;
        }).join('')
      }
        </div>
      </div>
    `;

    showModal('🛡 Superadmin Approval Management', approvalsHtml);
  } catch (err) {
    alert(err.message || 'Failed to fetch approval requests');
  }
}

async function handleApproveRequest(id) {
  try {
    const res = await apiFetch(`/approvals/${id}/approve`, { method: 'POST' });
    if (res.success) {
      toast('✅ Approval request accepted and executed');
      openApprovalsModal('pending');
      updateApprovalBadge();
      loadInitialData();
    }
  } catch (e) { alert(e.message); }
}

async function handleRejectRequest(id) {
  try {
    const res = await apiFetch(`/approvals/${id}/reject`, { method: 'POST' });
    if (res.success) {
      toast('❌ Request declined and rejected');
      openApprovalsModal('pending');
      updateApprovalBadge();
      loadInitialData();
    }
  } catch (e) { alert(e.message); }
}

// ─── Organizations Management Modals ───────────────────────────────────────
async function openOrganizationsModal() {
  try {
    const res = await apiFetch('/organizations');
    if (!res.success) throw new Error(res.message || 'Failed to load organizations');

    const orgs = res.data || [];

    const orgsHtml = `
      <button class="btn-primary" style="width:100%;margin-bottom:14px;" onclick="openCreateOrganizationModal()">➕ Create New Organization</button>
      <div style="max-height:360px;overflow-y:auto;">
        ${orgs.length === 0 ? '<div class="empty-state" style="padding:20px;"><p>No organizations created yet</p></div>' :
        orgs.map(o => `
            <div style="padding:12px;border:1px solid var(--border-light);border-radius:10px;margin-bottom:10px;background:#ffffff;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                  <div style="font-weight:700;font-size:15px;color:var(--text-primary);">${o.name} (${o.code})</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Owner: <strong>${o.owner_name || 'N/A'}</strong> ${o.email ? '· ' + o.email : ''} ${o.phone ? '· 📞 ' + o.phone : ''}</div>
                </div>
                <span class="badge badge-success">${o.status.toUpperCase()}</span>
              </div>
              <div style="margin-top:8px;font-size:11px;color:var(--text-light);">
                Owner has full authority to create branches and add users within this Organization.
              </div>
            </div>
          `).join('')
      }
      </div>
    `;

    showModal('🏢 Organizations Management', orgsHtml);
  } catch (err) {
    alert(err.message || 'Failed to fetch organizations');
  }
}

function openCreateOrganizationModal() {
  showModal('🏢 Create New Organization', `
    <div class="form-group">
      <label class="form-label">Organization Name *</label>
      <input type="text" id="orgName" placeholder="e.g. Bakers Theory Group">
    </div>
    <div class="form-group">
      <label class="form-label">Organization Code *</label>
      <input type="text" id="orgCode" placeholder="e.g. BTG-01">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Subscription Plan</label>
        <select id="orgSubPlan" class="form-control">
          <option value="Standard" selected>Standard Plan</option>
          <option value="Pro">Pro Plan</option>
          <option value="Enterprise">Enterprise Plan</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Subscription Expiry Date</label>
        <input type="date" id="orgSubExpiry" value="${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}">
      </div>
    </div>

    <div style="background:rgba(0,122,255,0.04);padding:12px;border-radius:10px;margin:12px 0;border:1px solid rgba(0,122,255,0.15);">
      <div style="font-weight:700;font-size:13px;color:var(--ios-blue);margin-bottom:8px;">👤 Appoint Organization Owner</div>
      <div class="form-group">
        <label class="form-label">Owner Full Name</label>
        <input type="text" id="orgOwnerName" placeholder="e.g. John Doe">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Owner Username *</label>
          <input type="text" id="orgOwnerUsername" placeholder="e.g. btg_owner">
        </div>
        <div class="form-group">
          <label class="form-label">Owner Password *</label>
          <input type="password" id="orgOwnerPassword" placeholder="••••••••">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Owner Email</label>
          <input type="email" id="orgOwnerEmail" placeholder="owner@btg.com">
        </div>
        <div class="form-group">
          <label class="form-label">Owner Mobile</label>
          <input type="tel" id="orgOwnerPhone" placeholder="10 Digit Mobile">
        </div>
      </div>
    </div>

    <button class="btn-primary" style="width:100%;padding:12px;" onclick="submitCreateOrganization()">🏢 Create Organization & Assign Owner</button>
  `);
}

async function submitCreateOrganization() {
  const name = document.getElementById('orgName').value.trim();
  const code = document.getElementById('orgCode').value.trim();
  const subscription_plan = document.getElementById('orgSubPlan').value;
  const subscription_expiry = document.getElementById('orgSubExpiry').value;
  const owner_name = document.getElementById('orgOwnerName').value.trim();
  const owner_username = document.getElementById('orgOwnerUsername').value.trim();
  const owner_password = document.getElementById('orgOwnerPassword').value;
  const email = document.getElementById('orgOwnerEmail').value.trim();
  const phone = document.getElementById('orgOwnerPhone').value.trim();

  if (!name || !code || !owner_username || !owner_password) {
    alert('Please fill in Organization Name, Code, Owner Username, and Owner Password');
    return;
  }

  try {
    const res = await apiFetch('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name, code, subscription_plan, subscription_expiry, owner_name, owner_username, owner_password, email, phone })
    });

    if (res.success) {
      toast('✅ Organization & Owner account created successfully');
      closeModal();
      showSection('dashboard');
    }
  } catch (err) {
    alert(err.message || 'Failed to create organization');
  }
}

async function openEditOrganizationModal(id) {
  try {
    const res = await apiFetch(`/organizations/${id}`);
    if (!res.success) throw new Error(res.message);
    const org = res.data;

    showModal('✏ Edit Organization & Owner', `
      <div class="form-group">
        <label class="form-label">Organization Name *</label>
        <input type="text" id="editOrgName" value="${org.name || ''}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" id="editOrgEmail" value="${org.email || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input type="tel" id="editOrgPhone" value="${org.phone || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Subscription Plan</label>
          <select id="editOrgPlan" class="form-control">
            <option value="Standard" ${org.subscription_plan === 'Standard' ? 'selected' : ''}>Standard Plan</option>
            <option value="Pro" ${org.subscription_plan === 'Pro' ? 'selected' : ''}>Pro Plan</option>
            <option value="Enterprise" ${org.subscription_plan === 'Enterprise' ? 'selected' : ''}>Enterprise Plan</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Subscription Status</label>
          <select id="editOrgSubStatus" class="form-control">
            <option value="Active" ${org.subscription_status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="Expiring Soon" ${org.subscription_status === 'Expiring Soon' ? 'selected' : ''}>Expiring Soon</option>
            <option value="Expired" ${org.subscription_status === 'Expired' ? 'selected' : ''}>Expired</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Subscription Expiry Date</label>
        <input type="date" id="editOrgExpiry" value="${org.subscription_expiry ? org.subscription_expiry.split('T')[0] : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Organization Status</label>
        <select id="editOrgStatus" class="form-control">
          <option value="active" ${org.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${org.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>

      <button class="btn-primary" style="width:100%;margin-top:10px;" onclick="submitEditOrganization('${id}')">💾 Save Organization Changes</button>
    `);
  } catch (e) {
    alert(e.message || 'Failed to load organization details');
  }
}

async function submitEditOrganization(id) {
  const name = document.getElementById('editOrgName').value.trim();
  const email = document.getElementById('editOrgEmail').value.trim();
  const phone = document.getElementById('editOrgPhone').value.trim();
  const subscription_plan = document.getElementById('editOrgPlan').value;
  const subscription_status = document.getElementById('editOrgSubStatus').value;
  const subscription_expiry = document.getElementById('editOrgExpiry').value;
  const status = document.getElementById('editOrgStatus').value;

  try {
    const res = await apiFetch(`/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, email, phone, subscription_plan, subscription_status, subscription_expiry, status })
    });
    if (res.success) {
      toast('✅ Organization details updated');
      closeModal();
      showSection('dashboard');
    }
  } catch (e) { alert(e.message); }
}

async function openOrganizationDetailsModal(id) {
  try {
    const res = await apiFetch(`/organizations/${id}`);
    if (!res.success) throw new Error(res.message);
    const org = res.data;

    const breakdown = org.branches_breakdown || [];
    const activeCount = org.active_branches_count !== undefined ? org.active_branches_count : breakdown.filter(b => b.status === 'active').length;
    const pricePerBranch = org.price_per_branch || 999;
    const subTotal = activeCount * pricePerBranch;

    showModal(`🏢 Organization & Subscription Details: ${org.name}`, `
      <div style="background:rgba(0,122,255,0.04);padding:14px;border-radius:12px;margin-bottom:16px;border:1px solid rgba(0,122,255,0.2);">
        <div style="font-size:16px;font-weight:800;color:var(--text-primary);">${org.name} (Code: ${org.code})</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:2px;">Owner: <strong>${org.owner ? org.owner.name : (org.owner_name || 'Unassigned')}</strong> ${org.email ? '· Email: ' + org.email : ''}</div>
      </div>

      <div class="card" style="background:#fff;border:1px solid var(--border-light);padding:14px;margin-bottom:16px;">
        <div style="font-weight:800;font-size:14px;color:var(--ios-blue);margin-bottom:8px;">💰 SUBSCRIPTION BREAKDOWN</div>
        <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:10px;font-size:13px;">
          <div>Plan: <strong>${org.subscription_plan || 'Standard'}</strong></div>
          <div>Status: <span class="badge ${org.subscription_status === 'Expired' ? 'badge-danger' : 'badge-success'}">${org.subscription_status || 'Active'}</span></div>
          <div>Active Billable Branches: <strong style="color:var(--ios-blue);">${activeCount} Branch${activeCount !== 1 ? 'es' : ''}</strong></div>
          <div>Price Per Branch: <strong>${state.shop.currency}${pricePerBranch}</strong></div>
          <div>Expiry Date: <strong>${org.subscription_expiry ? formatDate(org.subscription_expiry) : 'Lifetime'}</strong></div>
          <div style="font-size:15px;font-weight:800;color:var(--ios-green);">Total Subscription: ${state.shop.currency}${fmtNum(subTotal, 0)}</div>
        </div>
      </div>

      <div style="font-weight:800;font-size:14px;margin-bottom:8px;">📍 Branch Billability List</div>
      <div style="max-height:220px;overflow-y:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Branch Name</th>
              <th>Code</th>
              <th>Status</th>
              <th>Billable Status</th>
            </tr>
          </thead>
          <tbody>
            ${breakdown.length === 0 ? '<tr><td colspan="4" style="text-align:center;">No branches registered</td></tr>' :
        breakdown.map(b => `
                <tr>
                  <td style="font-weight:700;">${b.name}</td>
                  <td><code>${b.code}</code></td>
                  <td><span class="badge ${b.status === 'active' ? 'badge-success' : 'badge-warning'}">${b.status.toUpperCase()}</span></td>
                  <td>
                    ${b.is_billable ?
            `<span class="badge badge-success">✓ Active (Billable)</span>` :
            `<span class="badge badge-secondary">✗ Inactive/Deleted (Non-Billable)</span>`
          }
                  </td>
                </tr>
              `).join('')
      }
          </tbody>
        </table>
      </div>
    `);
  } catch (e) {
    alert(e.message || 'Failed to load organization details');
  }
}

async function confirmDeleteOrganizationModal(id, name) {
  try {
    const res = await apiFetch(`/organizations/${id}`);
    const org = res.data || {};
    const branches = org.branches || [];

    showModal('⚠ HIGH-IMPACT ACTION: Delete Organization', `
      <div style="background:rgba(255,59,48,0.06);padding:14px;border-radius:12px;border:1px solid rgba(255,59,48,0.25);margin-bottom:16px;">
        <div style="font-weight:800;font-size:15px;color:var(--ios-red);margin-bottom:6px;">⚠ Delete Organization: ${name}?</div>
        <div style="font-size:13px;color:var(--text-primary);line-height:1.4;">
          Deleting this organization will also delete/deactivate all branches associated with it and may affect organization-related data. Access for all assigned owners and branch staff will be immediately revoked. This action cannot be undone.
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px;">📍 Affected Branches (${branches.length}):</div>
        <div style="max-height:120px;overflow-y:auto;background:#f9f9f9;padding:10px;border-radius:8px;border:1px solid var(--border-light);">
          ${branches.length === 0 ? '<div style="font-size:12px;color:var(--text-muted);">No active branches</div>' :
        branches.map(b => `<div style="font-size:12px;font-weight:600;padding:2px 0;">• ${b.shop_name || b.name} (${b.shop_code})</div>`).join('')
      }
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight:700;">Type "DELETE" to confirm *</label>
        <input type="text" id="confirmDeleteOrgText" placeholder="Type DELETE here">
      </div>

      <button class="btn-danger" style="width:100%;padding:12px;" onclick="submitDeleteOrganization('${id}')">🚨 Confirm & Delete Organization</button>
    `);
  } catch (e) {
    alert(e.message || 'Failed to fetch organization info');
  }
}

async function submitDeleteOrganization(id) {
  const confirmText = document.getElementById('confirmDeleteOrgText').value.trim();
  if (confirmText !== 'DELETE') {
    alert('Please type "DELETE" exactly to confirm organization deletion.');
    return;
  }

  try {
    const res = await apiFetch(`/organizations/${id}`, { method: 'DELETE' });
    if (res.success) {
      toast('✅ Organization and associated branches safely deleted');
      closeModal();
      showSection('dashboard');
    }
  } catch (e) { alert(e.message || 'Failed to delete organization'); }
}

function confirmDeleteBranchModal(id, name) {
  showModal('🗑 Confirm Branch Deletion', `
    <div style="background:rgba(255,59,48,0.06);padding:14px;border-radius:12px;border:1px solid rgba(255,59,48,0.2);margin-bottom:16px;">
      <div style="font-weight:800;font-size:15px;color:var(--ios-red);margin-bottom:4px;">Deactivate / Delete Branch: ${name}?</div>
      <div style="font-size:13px;color:var(--text-primary);line-height:1.4;">
        Deleting this branch will remove it from active application access and reduce your active billable branch count. Historical sales and invoices for this branch will remain preserved.
      </div>
    </div>

    <button class="btn-danger" style="width:100%;padding:12px;" onclick="submitDeleteBranch('${id}')">🗑 Confirm Delete Branch</button>
  `);
}

async function submitDeleteBranch(id) {
  try {
    const res = await apiFetch(`/shops/${id}`, { method: 'DELETE' });
    if (res.success) {
      toast('✅ Branch deleted and subscription updated');
      closeModal();
      showSection('dashboard');
    }
  } catch (e) { alert(e.message || 'Failed to delete branch'); }
}

function openCreateBranchModal() {
  showModal('📍 Create New Branch', `
    <div class="form-group">
      <label class="form-label">Branch Name *</label>
      <input type="text" id="branchName" placeholder="e.g. Jharsuguda Branch">
    </div>
    <div class="form-group">
      <label class="form-label">Branch Code *</label>
      <input type="text" id="branchCode" placeholder="e.g. BTG-JHS">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Phone Number</label>
        <input type="tel" id="branchPhone" placeholder="10 Digit Phone">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" id="branchEmail" placeholder="branch@company.com">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Address</label>
      <textarea id="branchAddress" rows="2" placeholder="Full branch address..."></textarea>
    </div>

    <button class="btn-primary" style="width:100%;margin-top:10px;" onclick="submitCreateBranch()">📍 Create Branch</button>
  `);
}

async function submitCreateBranch() {
  const shop_name = document.getElementById('branchName').value.trim();
  const shop_code = document.getElementById('branchCode').value.trim();
  const phone = document.getElementById('branchPhone').value.trim();
  const email = document.getElementById('branchEmail').value.trim();
  const address = document.getElementById('branchAddress').value.trim();

  if (!shop_name || !shop_code) {
    alert('Please enter Branch Name and Branch Code');
    return;
  }

  try {
    const res = await apiFetch('/shops', {
      method: 'POST',
      body: JSON.stringify({ shop_name, shop_code, phone, email, address })
    });
    if (res.success || res.status === 201 || res.status === 202) {
      toast('✅ New branch created successfully');
      closeModal();
      showSection('dashboard');
    }
  } catch (e) {
    alert(e.message || 'Failed to create branch');
  }
}

async function handleSwitchBranch(shopId) {
  activeShopId = shopId;
  localStorage.setItem('active_shop_id', shopId);
  toast('🔄 Switched active branch view');
  loadInitialData();
}

async function deleteUserSubmit(id, username) {
  if (!confirm(`Are you sure you want to permanently delete user account '@${username}'?`)) return;
  try {
    const res = await apiFetch(`/users/${id}`, { method: 'DELETE' });
    if (res.success || res.status === 202) {
      toast(res.message || 'User deleted successfully');
      openUsersModal();
    }
  } catch (e) {
    alert(e.message || 'Failed to delete user');
  }
}
async function openUsersModal() {
  try {
    const [usersRes, permsRes] = await Promise.all([
      apiFetch('/users'),
      apiFetch('/roles/permissions')
    ]);

    const users = usersRes.data || [];
    const allPerms = permsRes.data || [];

    showModal('👥 Manage Users & Staff Accounts', `
      <button class="btn-primary" style="width:100%;margin-bottom:14px;" onclick="openCreateUserModal('${allPerms.join(',')}')">➕ Add New User / Staff</button>
      <div style="max-height:360px;overflow-y:auto;">
        ${users.length === 0 ? '<p style="text-align:center;padding:20px;">No user accounts found</p>' :
        users.map(u => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid var(--border-light);border-radius:10px;margin-bottom:10px;background:#ffffff;">
              <div>
                <div style="font-weight:700;font-size:14px;color:var(--text-primary);">${u.name} (@${u.username})</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                  Role: <strong style="color:var(--ios-blue);">${u.role}</strong> ${u.shop_name ? `· Branch: ${u.shop_name}` : ''} ${u.phone ? `· 📞 ${u.phone}` : ''}
                </div>
              </div>

              <div style="display:flex;align-items:center;gap:6px;">
                <span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">${u.status}</span>
                <button class="btn-sm btn-secondary" onclick="openEditUserModal('${u.id}', '${allPerms.join(',')}')" title="Edit User">✏ Edit</button>
                <button class="btn-sm btn-accent" onclick="openResetPasswordModal('${u.id}', '${u.username}')" title="Reset Password">🔑 Password</button>
                ${u.id !== currentUser.id && u.username !== 'admin' ? `
                  <button class="btn-sm btn-danger" onclick="deleteUserSubmit('${u.id}', '${u.username}')" title="Disable User Account">🗑</button>
                ` : ''}
              </div>
            </div>
          `).join('')
      }
      </div>
    `);
  } catch (e) {
    alert('Failed to load users: ' + e.message);
  }
}

async function openEditUserModal(id, permsCsv) {
  try {
    const res = await apiFetch(`/users/${id}`);
    if (!res.success || !res.data) { alert('User details not found'); return; }

    const u = res.data;
    const allPerms = permsCsv ? permsCsv.split(',') : [];
    const userPerms = Array.isArray(u.permissions) ? u.permissions : [];

    showModal(`Edit User: ${u.name} (@${u.username})`, `
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input type="text" id="editUName" value="${u.name || ''}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input type="tel" id="editUPhone" value="${u.phone || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" id="editUEmail" value="${u.email || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Role</label>
          <select id="editURole">
            ${['Owner', 'Manager', 'Cashier', 'Purchase Staff', 'Accountant', 'Staff'].map(r => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Account Status</label>
          <select id="editUStatus">
            <option value="active" ${u.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="disabled" ${u.status === 'disabled' ? 'selected' : ''}>Disabled</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Role Permissions (RBAC Checkboxes)</label>
        <div class="perm-grid">
          ${allPerms.map(p => `
            <label class="perm-item">
              <input type="checkbox" name="editUPerm" value="${p}" ${userPerms.includes(p) ? 'checked' : ''}> ${p}
            </label>
          `).join('')}
        </div>
      </div>

      <button class="btn-primary" style="width:100%;margin-top:14px;" onclick="updateUserSubmit('${id}')">💾 Save Changes</button>
    `);
  } catch (err) {
    alert(err.message || 'Failed to load user details');
  }
}

async function updateUserSubmit(id) {
  const name = document.getElementById('editUName').value.trim();
  const phone = document.getElementById('editUPhone').value.trim();
  const email = document.getElementById('editUEmail').value.trim();
  const role = document.getElementById('editURole').value;
  const status = document.getElementById('editUStatus').value;

  const checkboxes = document.querySelectorAll('input[name="editUPerm"]:checked');
  const permissions = Array.from(checkboxes).map(c => c.value);

  if (!name) { alert('Name is required'); return; }

  try {
    const res = await apiFetch(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, phone, email, role, status, permissions })
    });

    if (res.success) {
      toast('✅ User details updated');
      openUsersModal();
    }
  } catch (err) {
    alert(err.message || 'Failed to update user');
  }
}

function openResetPasswordModal(id, username) {
  showModal(`🔑 Reset Password: @${username}`, `
    <div class="form-group">
      <label class="form-label">New Password *</label>
      <input type="password" id="resetNewPassword" placeholder="Minimum 4 characters">
    </div>
    <button class="btn-primary" style="width:100%;margin-top:10px;" onclick="resetPasswordSubmit('${id}')">🔐 Confirm Password Reset</button>
  `);
}

async function resetPasswordSubmit(id) {
  const newPassword = document.getElementById('resetNewPassword').value;
  if (!newPassword || newPassword.length < 4) {
    alert('Password must be at least 4 characters long');
    return;
  }

  try {
    const res = await apiFetch(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword })
    });

    if (res.success) {
      toast('🔑 Password reset successfully');
      openUsersModal();
    }
  } catch (err) {
    alert(err.message || 'Failed to reset password');
  }
}

async function deleteUserSubmit(id, username) {
  if (!confirm(`Are you sure you want to disable account @${username}?`)) return;

  try {
    const res = await apiFetch(`/users/${id}`, { method: 'DELETE' });
    if (res.success) {
      toast(`User @${username} disabled`);
      openUsersModal();
    }
  } catch (err) {
    alert(err.message || 'Failed to disable user');
  }
}

async function openCreateUserModal(permsCsv) {
  const perms = permsCsv.split(',');
  let orgs = [];
  let shops = [];
  if (currentUser && currentUser.role === 'Admin') {
    try {
      const [orgRes, shopRes] = await Promise.all([
        apiFetch('/organizations'),
        apiFetch('/shops')
      ]);
      orgs = orgRes.data || [];
      shops = shopRes.data || [];
    } catch (e) { }
  }

  showModal('Create User Account', `
    ${currentUser && currentUser.role === 'Admin' ? `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Organization</label>
        <select id="uOrgId">
          <option value="">Headquarters / Main</option>
          ${orgs.map(o => `<option value="${o.id}">${o.name} (${o.code})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Assigned Branch</label>
        <select id="uShopId">
          ${shops.map(s => `<option value="${s.id}">${s.shop_name}</option>`).join('')}
        </select>
      </div>
    </div>` : ''}

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
        <option>Purchase Staff</option>
        <option>Accountant</option>
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
  const orgEl = document.getElementById('uOrgId');
  const shopEl = document.getElementById('uShopId');

  const organization_id = orgEl ? orgEl.value : null;
  const shop_id = shopEl ? shopEl.value : null;

  const checkboxes = document.querySelectorAll('input[name="uPerm"]:checked');
  const permissions = Array.from(checkboxes).map(c => c.value);

  if (!name || !username || !password) {
    alert('Name, username, and password are required');
    return;
  }

  try {
    const res = await apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify({ name, username, password, role, permissions, organization_id, shop_id })
    });

    if (res.success) {
      toast('✅ User created successfully');
      openUsersModal();
    }
  } catch (err) {
    alert(err.message || 'Failed to create user');
  }
}

// ─── 12. Admin Multi-Shop Modal ───────────────────────────────────────────────
async function openShopsModal() {
  try {
    const res = await apiFetch('/shops');
    const shops = res.data || [];

    showModal('🏪 Multi-Shop Architecture', `
      <button class="btn-primary" style="width:100%;margin-bottom:14px;" onclick="openCreateShopModal()">➕ Add New Shop Branch</button>
      <div style="max-height:320px;overflow-y:auto;">
        ${shops.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:#fff;">
            <div>
              <div style="font-weight:700;font-size:14px;">${s.shop_name} <span style="font-size:12px;color:var(--text-muted);">(${s.shop_code})</span></div>
              <div style="font-size:11px;color:var(--text-muted);">${s.address || 'Main Branch'} · Currency: ${s.currency}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}" onclick="toggleShopStatusSubmit('${s.id}')" style="cursor:pointer;" title="Click to toggle status">${s.status}</span>
              ${s.id !== 'shop_default_hq' ? `<button class="btn-sm btn-danger" style="padding:4px 8px;" onclick="deleteShopSubmit('${s.id}')" title="Delete Shop">🗑</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `);
  } catch (e) {
    alert(e.message);
  }
}

async function deleteShopSubmit(id) {
  if (id === 'shop_default_hq') {
    alert('The default main headquarters shop cannot be deleted.');
    return;
  }
  if (!confirm('Are you sure you want to delete this shop branch?')) return;

  try {
    const res = await apiFetch(`/shops/${id}`, { method: 'DELETE' });
    if (res.success) {
      toast('🗑 Shop deleted');
      await loadAdminShops();
      openShopsModal();
    }
  } catch (err) {
    alert(err.message || 'Failed to delete shop');
  }
}

async function toggleShopStatusSubmit(id) {
  try {
    const res = await apiFetch(`/shops/${id}/status`, { method: 'PATCH' });
    if (res.success) {
      toast('Shop status updated');
      await loadAdminShops();
      openShopsModal();
    }
  } catch (err) {
    alert(err.message || 'Failed to update status');
  }
}

async function openCreateShopModal() {
  let orgs = [];
  if (currentUser && currentUser.role === 'Admin') {
    try {
      const res = await apiFetch('/organizations');
      orgs = res.data || [];
    } catch (e) { }
  }

  showModal('Add New Shop Branch', `
    ${currentUser && currentUser.role === 'Admin' ? `
    <div class="form-group">
      <label class="form-label">Assign to Organization</label>
      <select id="sOrgId">
        <option value="">Headquarters / Independent</option>
        ${orgs.map(o => `<option value="${o.id}">${o.name} (${o.code})</option>`).join('')}
      </select>
    </div>` : ''}

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

    <button class="btn-primary" style="width:100%;" onclick="createShopSubmit()">✅ Create Shop Branch</button>
  `);
}

async function createShopSubmit() {
  const shop_name = document.getElementById('sName').value.trim();
  const shop_code = document.getElementById('sCode').value.trim();
  const currency = document.getElementById('sCurrency').value.trim() || '₹';
  const owner_username = document.getElementById('sOwnerUsername').value.trim();
  const owner_password = document.getElementById('sOwnerPassword').value;
  const orgEl = document.getElementById('sOrgId');
  const organization_id = orgEl ? orgEl.value : null;

  if (!shop_name || !shop_code) {
    alert('Shop name and shop code are required');
    return;
  }

  try {
    const res = await apiFetch('/shops', {
      method: 'POST',
      body: JSON.stringify({ shop_name, shop_code, currency, owner_username, owner_password, organization_id })
    });

    if (res.success) {
      toast('✅ Shop branch created successfully');
      await loadAdminShops();
      openShopsModal();
    }
  } catch (err) {
    alert(err.message || 'Failed to create shop');
  }
}

// ─── Super Admin Controls & Danger Zone ────────────────────────────────────────
async function downloadBackup() {
  try {
    const res = await apiFetch('/admin/backup');
    if (res.success && res.data) {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `SMS_Backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast('💾 Database backup downloaded successfully');
    }
  } catch (err) {
    alert('Failed to generate backup: ' + err.message);
  }
}

function openRestoreModal() {
  showModal('📥 Restore Database Backup', `
    <div class="form-group">
      <label class="form-label">Select JSON Backup File</label>
      <input type="file" id="restoreFile" accept=".json">
    </div>
    <div class="alert alert-warn" style="margin-top:10px;">
      ⚠️ Warning: Restoring database will replace all current inventory, customer, bill, and transaction records!
    </div>
    <button class="btn-primary" style="width:100%;margin-top:10px;" onclick="executeRestoreSubmit()">📥 Confirm Restore</button>
  `);
}

async function executeRestoreSubmit() {
  const fileInput = document.getElementById('restoreFile');
  if (!fileInput.files || !fileInput.files[0]) { alert('Please select a backup JSON file'); return; }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const backupJson = JSON.parse(e.target.result);
      const res = await apiFetch('/admin/restore', {
        method: 'POST',
        body: JSON.stringify({ backup: backupJson })
      });
      if (res.success) {
        closeModal();
        toast('✅ Database restored successfully');
        await loadInitialData();
        renderSection('dashboard');
      }
    } catch (err) {
      alert('Restore failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

async function openAuditLogsModal() {
  try {
    const res = await apiFetch('/admin/audit-logs');
    if (!res.success || !res.data) return;

    const logs = res.data;
    showModal('📋 System Audit Logs', `
      <div style="max-height:380px;overflow-y:auto;">
        ${logs.length === 0 ? '<p style="text-align:center;padding:20px;">No audit logs recorded yet</p>' :
        logs.map(l => `
            <div class="log-entry" style="font-size:12px;margin-bottom:8px;">
              <div style="font-weight:700;color:var(--text-primary);">${l.action} <span style="font-weight:400;color:var(--text-muted);">by ${l.user_name || l.username || 'System'}</span></div>
              <div style="color:var(--text-secondary);margin-top:2px;">${l.details || ''}</div>
              <div style="font-size:10px;color:var(--text-light);margin-top:2px;">${formatDateFull(l.created_at)}</div>
            </div>
          `).join('')
      }
      </div>
    `);
  } catch (e) {
    alert(e.message);
  }
}

// ─── 3-Step Password Guarded Delete All Data ─────────────────────────────────
let delPass1 = '', delPass2 = '', delPass3 = '';

function openDeleteAllDataModal() {
  delPass1 = ''; delPass2 = ''; delPass3 = '';
  showModal('🚨 Delete All Data — Step 1 of 4 (Password Pass 1)', `
    <div class="alert alert-warn">
      ⚠️ CRITICAL WARNING: You are about to initiate complete deletion of all store invoices, inventory, stock logs, customers, suppliers, and accounting ledgers!
    </div>
    <div class="form-group">
      <label class="form-label">Enter Super Admin Password (Pass 1/3) *</label>
      <input type="password" id="delPassInput1" placeholder="••••••••" autofocus>
    </div>
    <button class="btn-danger" style="width:100%;margin-top:10px;" onclick="submitDeleteAllDataPass1()">Proceed to Pass 2 ➔</button>
  `);
}

function submitDeleteAllDataPass1() {
  const p = document.getElementById('delPassInput1').value;
  if (!p) { alert('Password is required'); return; }
  delPass1 = p;

  showModal('🚨 Delete All Data — Step 2 of 4 (Password Pass 2)', `
    <div class="alert alert-warn">
      ⚠️ SECOND CONFIRMATION: Are you 100% sure? All transactions, sales bills, and customer due balances will be wiped out permanently!
    </div>
    <div class="form-group">
      <label class="form-label">Re-enter Super Admin Password (Pass 2/3) *</label>
      <input type="password" id="delPassInput2" placeholder="••••••••" autofocus>
    </div>
    <button class="btn-danger" style="width:100%;margin-top:10px;" onclick="submitDeleteAllDataPass2()">Proceed to Pass 3 ➔</button>
  `);
}

function submitDeleteAllDataPass2() {
  const p = document.getElementById('delPassInput2').value;
  if (!p) { alert('Password is required'); return; }
  delPass2 = p;

  showModal('🚨 Delete All Data — Step 3 of 4 (Password Pass 3)', `
    <div class="alert alert-warn">
      ⚠️ FINAL PASSWORD CHECK: Enter your password a third time to verify authorization.
    </div>
    <div class="form-group">
      <label class="form-label">Re-enter Super Admin Password (Pass 3/3) *</label>
      <input type="password" id="delPassInput3" placeholder="••••••••" autofocus>
    </div>
    <button class="btn-danger" style="width:100%;margin-top:10px;" onclick="submitDeleteAllDataPass3()">Proceed to Phrase Check ➔</button>
  `);
}

function submitDeleteAllDataPass3() {
  const p = document.getElementById('delPassInput3').value;
  if (!p) { alert('Password is required'); return; }
  delPass3 = p;

  showModal('🚨 Delete All Data — Step 4 of 4 (Confirmation Phrase)', `
    <div class="alert alert-warn">
      FINAL SAFETY GUARD: To execute the full data reset, type the phrase <strong style="color:var(--ios-red);">DELETE ALL DATA</strong> below.
    </div>
    <div class="form-group">
      <label class="form-label">Type phrase exactly: <strong>DELETE ALL DATA</strong></label>
      <input type="text" id="delPhraseInput" placeholder="DELETE ALL DATA" autofocus>
    </div>
    <button class="btn-danger" style="width:100%;margin-top:10px;" onclick="executeDeleteAllDataFinal()">🔥 PERMANENTLY DELETE ALL DATA</button>
  `);
}

async function executeDeleteAllDataFinal() {
  const phrase = document.getElementById('delPhraseInput').value.trim();
  if (phrase !== 'DELETE ALL DATA') {
    alert("Phrase mismatch! You must type 'DELETE ALL DATA' exactly.");
    return;
  }

  try {
    const res = await apiFetch('/admin/delete-all-data', {
      method: 'POST',
      body: JSON.stringify({
        passwordCheck1: delPass1,
        passwordCheck2: delPass2,
        passwordCheck3: delPass3,
        confirmPhrase: phrase
      })
    });

    if (res.success) {
      closeModal();
      alert(res.message || 'Data reset completed successfully.');
      await loadInitialData();
      showSection('dashboard');
    }
  } catch (err) {
    alert('Data deletion rejected: ' + err.message);
  }
}

function openBranchManagerModal() { openShopsModal(); }
function openRoleManagerModal() { openUsersModal(); }
function openStaffManagerModal() { openUsersModal(); }

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

// ─── Modern Theme Engine, Toast Notifications & UI Utilities ─────────────────
function initTheme() {
  const savedTheme = localStorage.getItem('sms_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setAppTheme(savedTheme);
}

function setAppTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sms_theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    btn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

function toggleAppTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  setAppTheme(next);
  showToast('Theme Updated', `Switched to ${next === 'dark' ? 'Dark' : 'Light'} Mode`, 'info');
}

function toggleSidebar() {
  const sb = document.getElementById('appSidebar');
  if (sb) {
    sb.classList.toggle('collapsed');
  }
}

function toggleMobileMenu() {
  const sb = document.getElementById('appSidebar');
  if (sb) {
    sb.classList.toggle('mobile-open');
  }
}

function filterSidebarMenu(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(q) ? 'flex' : 'none';
  });
}

function handleGlobalSearchKey(e) {
  if (e.key === 'Enter') {
    const query = e.target.value.trim();
    if (!query) return;
    showToast('Search Triggered', `Searching for "${query}" across inventory & records...`, 'info');
    showSection('stock');
    const stockSearchInput = document.getElementById('stockSearch');
    if (stockSearchInput) {
      stockSearchInput.value = query;
      stockSearchInput.dispatchEvent(new Event('input'));
    }
  }
}

function showToast(title, message = '', type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toastEl = document.createElement('div');
  toastEl.className = `toast ${type}`;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  toastEl.innerHTML = `
    <span style="font-size:18px;">${icons[type] || 'ℹ️'}</span>
    <div style="flex:1;">
      <div style="font-weight:700;font-size:13px;color:var(--text-primary);">${title}</div>
      ${message ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${message}</div>` : ''}
    </div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;font-weight:700;">✕</button>
  `;

  container.appendChild(toastEl);

  setTimeout(() => {
    if (toastEl.parentElement) {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateX(100%)';
      toastEl.style.transition = 'all 0.3s ease';
      setTimeout(() => toastEl.remove(), 300);
    }
  }, duration);
}

let toastTimer;
function toast(msg) {
  showToast('Notification', msg, 'info');
}

function openStockIn() { showSection('stock'); stockTab = 'in'; renderSection('stock'); }
function openStockOut() { showSection('stock'); stockTab = 'out'; renderSection('stock'); }
function openCustomersModal() { showSection('people'); }

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const searchInput = document.getElementById('globalSearchInput');
    if (searchInput) searchInput.focus();
  } else if (e.key === 'Escape') {
    closeModal();
  }
});

// ─── App Initialize ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAuth();
});