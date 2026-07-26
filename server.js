require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const exceljs = require('exceljs');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // This allows onclick="" to work
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"], // This allows your logo uploads to work
      connectSrc: ["'self'"]
    }
  }
}));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('common'));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 800, message: { success: false, message: 'Too many requests' } }));

// --- Database & Schema ---
const db = new Database('./database.db', { verbose: null });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, tagline TEXT, address TEXT, phone TEXT, gst TEXT, currency TEXT DEFAULT '₹', tax_rate REAL DEFAULT 0, logo TEXT, low_stock_alert INTEGER DEFAULT 5, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, mobile TEXT, email TEXT, role TEXT NOT NULL, shop_id TEXT, permissions TEXT, force_password_change INTEGER DEFAULT 1, FOREIGN KEY(shop_id) REFERENCES shops(id)
  );
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, name TEXT NOT NULL, mobile TEXT, visit_count INTEGER DEFAULT 0, total_purchases REAL DEFAULT 0, last_purchase DATETIME, FOREIGN KEY(shop_id) REFERENCES shops(id)
  );
  CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT, unit TEXT, buy_price REAL DEFAULT 0, selling_price REAL DEFAULT 0, stock REAL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(shop_id) REFERENCES shops(id)
  );
  CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, bill_number TEXT NOT NULL, customer_id TEXT, customer_name TEXT, subtotal REAL, tax REAL, total REAL, payment_mode TEXT DEFAULT 'Cash', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(shop_id) REFERENCES shops(id)
  );
  CREATE TABLE IF NOT EXISTS bill_items (
    id TEXT PRIMARY KEY, bill_id TEXT NOT NULL, item_id TEXT NOT NULL, name TEXT, qty REAL, price REAL, total REAL, FOREIGN KEY(bill_id) REFERENCES bills(id)
  );
  CREATE TABLE IF NOT EXISTS stock_logs (
    id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, item_id TEXT NOT NULL, type TEXT, quantity REAL, reason TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Init Super Admin
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  db.prepare('INSERT INTO users (id, username, password_hash, name, role, permissions, force_password_change) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    uuidv4(), 'admin', bcrypt.hashSync('admin123', 10), 'Super Admin', 'admin', JSON.stringify(['ALL']), 1
  );
}

// --- Middleware ---
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error();
    req.user = jwt.verify(token, JWT_SECRET);
    
    // Determine active shop (Admin can override via X-Shop-ID)
    req.shopId = req.user.role === 'admin' ? (req.headers['x-shop-id'] || null) : req.user.shop_id;
    next();
  } catch { res.status(401).json({ success: false, message: 'Unauthorized' }); }
};

const checkPerm = (perm) => (req, res, next) => {
  if (req.user.role === 'admin') return next();
  const perms = JSON.parse(req.user.permissions || '[]');
  if (perms.includes(perm)) next();
  else res.status(403).json({ success: false, message: 'Forbidden: Missing permission ' + perm });
};

// --- Auth Routes ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  
  const token = jwt.sign({ id: user.id, role: user.role, shop_id: user.shop_id, permissions: user.permissions }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role, name: user.name, force_password_change: user.force_password_change } });
});

// --- Shop Management (Admin Only) ---
app.get('/api/shops', auth, checkPerm('ALL'), (req, res) => {
  res.json({ success: true, data: db.prepare('SELECT * FROM shops').all() });
});
app.post('/api/shops', auth, checkPerm('ALL'), (req, res) => {
  const id = uuidv4();
  db.prepare('INSERT INTO shops (id, name, address, phone) VALUES (?, ?, ?, ?)').run(id, req.body.name, req.body.address || '', req.body.phone || '');
  res.json({ success: true, data: { id } });
});

// --- Staff Management ---
app.get('/api/staff', auth, checkPerm('Staff Management'), (req, res) => {
  const query = req.user.role === 'admin' ? 'SELECT id, username, name, mobile, email, role, shop_id, permissions FROM users WHERE role != "admin"' : 'SELECT id, username, name, mobile, email, role, shop_id, permissions FROM users WHERE shop_id = ?';
  res.json({ success: true, data: db.prepare(query).all(req.shopId) });
});
app.post('/api/staff', auth, checkPerm('Staff Management'), (req, res) => {
  const { username, password, name, mobile, permissions, shop_id } = req.body;
  try {
    db.prepare('INSERT INTO users (id, username, password_hash, name, mobile, role, shop_id, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      uuidv4(), username, bcrypt.hashSync(password, 10), name, mobile, 'staff', req.user.role==='admin'?shop_id:req.shopId, JSON.stringify(permissions)
    );
    res.json({ success: true, message: 'Staff created' });
  } catch (e) { res.status(400).json({ success: false, message: 'Username may exist' }); }
});

// --- Core Data APIs (Tenant Isolated) ---
const requireShop = (req, res, next) => req.shopId ? next() : res.status(400).json({ success: false, message: 'Shop ID required' });

app.get('/api/data', auth, requireShop, (req, res) => {
  const items = db.prepare('SELECT * FROM items WHERE shop_id = ?').all(req.shopId);
  const categories = db.prepare('SELECT name FROM categories WHERE shop_id = ?').all(req.shopId).map(c=>c.name);
  const units = db.prepare('SELECT name FROM units WHERE shop_id = ?').all(req.shopId).map(u=>u.name);
  const settings = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shopId) || {};
  res.json({ success: true, data: { items, categories, units, settings } });
});

app.post('/api/items', auth, requireShop, checkPerm('Add Item'), (req, res) => {
  const { name, category, unit, buy_price, selling_price, stock } = req.body;
  const id = uuidv4();
  db.transaction(() => {
    db.prepare('INSERT INTO items (id, shop_id, name, category, unit, buy_price, selling_price, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.shopId, name, category, unit, buy_price, selling_price, stock);
    if(stock > 0) db.prepare('INSERT INTO stock_logs (id, shop_id, item_id, type, quantity, reason) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.shopId, id, 'in', stock, 'Initial');
  })();
  res.json({ success: true });
});

app.post('/api/bills', auth, requireShop, checkPerm('Billing'), (req, res) => {
  const { customer_name, customer_phone, items, subtotal, tax, total } = req.body;
  const billId = uuidv4();
  const bCount = db.prepare('SELECT COUNT(*) as c FROM bills WHERE shop_id = ?').get(req.shopId).c + 1;
  const bNum = `BT-${bCount.toString().padStart(5, '0')}`;
  
  db.transaction(() => {
    // Handle Customer
    let custId = null;
    if (customer_phone) {
      const c = db.prepare('SELECT id FROM customers WHERE shop_id = ? AND mobile = ?').get(req.shopId, customer_phone);
      if (c) { custId = c.id; db.prepare('UPDATE customers SET visit_count=visit_count+1, total_purchases=total_purchases+?, last_purchase=CURRENT_TIMESTAMP WHERE id=?').run(total, custId); }
      else { custId = uuidv4(); db.prepare('INSERT INTO customers (id, shop_id, name, mobile, visit_count, total_purchases, last_purchase) VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)').run(custId, req.shopId, customer_name, customer_phone, total); }
    }
    
    db.prepare('INSERT INTO bills (id, shop_id, bill_number, customer_id, customer_name, subtotal, tax, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(billId, req.shopId, bNum, custId, customer_name, subtotal, tax, total);
    
    items.forEach(i => {
      db.prepare('INSERT INTO bill_items (id, bill_id, item_id, name, qty, price, total) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uuidv4(), billId, i.id, i.name, i.qty, i.price, i.qty * i.price);
      db.prepare('UPDATE items SET stock = MAX(0, stock - ?) WHERE id = ?').run(i.qty, i.id);
      db.prepare('INSERT INTO stock_logs (id, shop_id, item_id, type, quantity, reason) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.shopId, i.id, 'out', i.qty, `Bill ${bNum}`);
    });
  })();
  res.json({ success: true, data: { bill_number: bNum } });
});

// --- Excel Export (Reporting) ---
app.get('/api/reports/export', auth, requireShop, checkPerm('Export Excel'), async (req, res) => {
  const { type, start, end } = req.query; // type: 'bills', 'inventory'
  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet(type.toUpperCase());
  
  if (type === 'inventory') {
    sheet.columns = [
      { header: 'Item Name', key: 'name', width: 25 }, { header: 'Category', key: 'category', width: 15 },
      { header: 'Stock', key: 'stock', width: 10 }, { header: 'Selling Price', key: 'price', width: 15 }
    ];
    const data = db.prepare('SELECT name, category, stock, selling_price as price FROM items WHERE shop_id = ?').all(req.shopId);
    sheet.addRows(data);
  } else if (type === 'bills') {
    sheet.columns = [
      { header: 'Bill No', key: 'bill_number', width: 15 }, { header: 'Date', key: 'created_at', width: 20 },
      { header: 'Customer', key: 'customer_name', width: 20 }, { header: 'Total', key: 'total', width: 15 }
    ];
    let query = 'SELECT bill_number, created_at, customer_name, total FROM bills WHERE shop_id = ?';
    const params = [req.shopId];
    if (start && end) { query += ' AND date(created_at) BETWEEN ? AND ?'; params.push(start, end); }
    sheet.addRows(db.prepare(query).all(...params));
  }
  
  sheet.getRow(1).font = { bold: true };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${type}-report.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

app.use(express.static('public')); // Serve frontend files from public folder
app.listen(PORT, () => console.log(`🚀 Production Server running on port ${PORT}`));