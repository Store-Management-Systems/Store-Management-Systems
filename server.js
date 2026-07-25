require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================
// Security & Middleware
// ==========================
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(compression());
app.use(express.json({ limit: '10mb' })); // Increased for potential base64 logo uploads
app.use(morgan('common'));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 500, 
    message: { success: false, message: 'Too many requests' }
});
app.use('/api/', apiLimiter);

// ==========================
// Database Initialization
// ==========================
const dbPath = process.env.DB_PATH || './database.db';
const db = new Database(dbPath, { verbose: null });
db.pragma('journal_mode = WAL'); // Better performance

// Auto-init schema if empty
const schemaPath = path.join(__dirname, 'database', 'schema.sql');
if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
    
    // Insert defaults if empty
    const settingsCheck = db.prepare('SELECT id FROM settings LIMIT 1').get();
    if (!settingsCheck) {
        db.prepare(`INSERT INTO settings (id, shop_name) VALUES (?, ?)`).run(uuidv4(), 'My Shop');
        db.prepare(`INSERT INTO categories (id, name) VALUES (?, ?)`).run(uuidv4(), 'General');
        db.prepare(`INSERT INTO units (id, name) VALUES (?, ?)`).run(uuidv4(), 'pcs');
    }
}

// ==========================
// Utility: Response Formatter
// ==========================
const sendSuccess = (res, message, data = null) => res.json({ success: true, message, data });
const sendError = (res, message, status = 400) => res.status(status).json({ success: false, message });

// ==========================
// API Routes: Settings
// ==========================
app.get('/api/settings', (req, res) => {
    const settings = db.prepare('SELECT * FROM settings LIMIT 1').get();
    sendSuccess(res, 'Settings fetched', settings);
});

app.put('/api/settings', (req, res) => {
    const { shop_name, tagline, address, phone, gst, currency, tax_rate, low_stock_alert, logo } = req.body;
    if (!shop_name) return sendError(res, 'Shop name is required');
    
    const stmt = db.prepare(`
        UPDATE settings SET 
        shop_name = ?, tagline = ?, address = ?, phone = ?, gst = ?, 
        currency = ?, tax_rate = ?, low_stock_alert = ?, logo = ?, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(shop_name, tagline || '', address || '', phone || '', gst || '', currency || '₹', tax_rate || 0, low_stock_alert || 5, logo || null);
    sendSuccess(res, 'Settings updated successfully');
});

// ==========================
// API Routes: Categories & Units
// ==========================
app.get('/api/categories', (req, res) => sendSuccess(res, 'Categories fetched', db.prepare('SELECT * FROM categories').all()));
app.post('/api/categories', (req, res) => {
    try {
        db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(uuidv4(), req.body.name);
        sendSuccess(res, 'Category added');
    } catch (err) { sendError(res, 'Category already exists'); }
});

app.get('/api/units', (req, res) => sendSuccess(res, 'Units fetched', db.prepare('SELECT * FROM units').all()));
app.post('/api/units', (req, res) => {
    try {
        db.prepare('INSERT INTO units (id, name) VALUES (?, ?)').run(uuidv4(), req.body.name);
        sendSuccess(res, 'Unit added');
    } catch (err) { sendError(res, 'Unit already exists'); }
});

// ==========================
// API Routes: Items
// ==========================
app.get('/api/items', (req, res) => sendSuccess(res, 'Items fetched', db.prepare('SELECT * FROM items ORDER BY created_at DESC').all()));

app.post('/api/items', (req, res) => {
    const { name, category, unit, buy_price, selling_price, stock } = req.body;
    if (!name || name.length > 150) return sendError(res, 'Valid Item Name required (max 150 chars)');
    if (stock < 0) return sendError(res, 'Stock cannot be negative');

    const id = uuidv4();
    const insertItem = db.prepare(`
        INSERT INTO items (id, name, category, unit, buy_price, selling_price, stock) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertLog = db.prepare(`INSERT INTO stock_logs (id, item_id, item_name, type, quantity, notes) VALUES (?, ?, ?, ?, ?, ?)`);

    const transaction = db.transaction(() => {
        insertItem.run(id, name, category, unit, buy_price, selling_price, stock);
        if (stock > 0) insertLog.run(uuidv4(), id, name, 'in', stock, 'Initial stock');
    });

    transaction();
    sendSuccess(res, 'Item created successfully');
});

app.put('/api/items/:id', (req, res) => {
    const { name, category, unit, buy_price, selling_price, stock } = req.body;
    if (stock < 0) return sendError(res, 'Stock cannot be negative');
    
    const oldItem = db.prepare('SELECT stock FROM items WHERE id = ?').get(req.params.id);
    if (!oldItem) return sendError(res, 'Item not found', 404);

    const updateItem = db.prepare(`
        UPDATE items SET name = ?, category = ?, unit = ?, buy_price = ?, selling_price = ?, stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
        updateItem.run(name, category, unit, buy_price, selling_price, stock, req.params.id);
        const diff = stock - oldItem.stock;
        if (diff !== 0) {
            const type = diff > 0 ? 'in' : 'out';
            db.prepare(`INSERT INTO stock_logs (id, item_id, item_name, type, quantity, notes) VALUES (?, ?, ?, ?, ?, ?)`)
              .run(uuidv4(), req.params.id, name, type, Math.abs(diff), 'Manual adjustment');
        }
    });

    transaction();
    sendSuccess(res, 'Item updated');
});

app.delete('/api/items/:id', (req, res) => {
    db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
    sendSuccess(res, 'Item deleted');
});

// ==========================
// API Routes: Stock Operations
// ==========================
app.post('/api/stock', (req, res) => {
    const { itemId, qty, type, supplier, reason, notes } = req.body; // type: 'in' or 'out'
    if (qty <= 0) return sendError(res, 'Invalid quantity');
    
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    if (!item) return sendError(res, 'Item not found', 404);
    if (type === 'out' && qty > item.stock) return sendError(res, 'Insufficient stock');

    const newStock = type === 'in' ? item.stock + qty : item.stock - qty;

    const transaction = db.transaction(() => {
        db.prepare('UPDATE items SET stock = ? WHERE id = ?').run(newStock, itemId);
        db.prepare(`INSERT INTO stock_logs (id, item_id, item_name, type, quantity, supplier, reason, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(uuidv4(), itemId, item.name, type, qty, supplier || null, reason || null, notes || null);
    });

    transaction();
    sendSuccess(res, `Stock updated successfully`);
});

// ==========================
// API Routes: Billing
// ==========================
app.post('/api/bills', (req, res) => {
    const { customer_name, customer_phone, items, subtotal, tax, total } = req.body;
    if (!items || items.length === 0) return sendError(res, 'No items in bill');

    // Auto-generate Bill Number (BT-000001 format)
    const count = db.prepare('SELECT COUNT(*) as count FROM bills').get().count + 1;
    const bill_number = `BT-${count.toString().padStart(6, '0')}`;
    const billId = uuidv4();

    const insertBill = db.prepare(`
        INSERT INTO bills (id, bill_number, customer_name, customer_phone, subtotal, tax, total) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBillItem = db.prepare(`INSERT INTO bill_items (id, bill_id, item_id, name, qty, price, total) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const updateStock = db.prepare(`UPDATE items SET stock = MAX(0, stock - ?) WHERE id = ?`);
    const insertLog = db.prepare(`INSERT INTO stock_logs (id, item_id, item_name, type, quantity, notes) VALUES (?, ?, ?, ?, ?, ?)`);

    const transaction = db.transaction(() => {
        insertBill.run(billId, bill_number, customer_name, customer_phone, subtotal, tax, total);
        
        for (const item of items) {
            insertBillItem.run(uuidv4(), billId, item.itemId, item.name, item.qty, item.price, item.qty * item.price);
            updateStock.run(item.qty, item.itemId);
            insertLog.run(uuidv4(), item.itemId, item.name, 'bill', item.qty, `Bill ${bill_number}`);
        }
    });

    transaction();
    sendSuccess(res, 'Bill generated', { bill_number });
});

app.get('/api/bills', (req, res) => {
    const bills = db.prepare('SELECT * FROM bills ORDER BY created_at DESC').all();
    const billsWithItems = bills.map(b => {
        b.items = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(b.id);
        return b;
    });
    sendSuccess(res, 'Bills fetched', billsWithItems);
});

// ==========================
// API Routes: Dashboard & History
// ==========================
app.get('/api/dashboard', (req, res) => {
    const totalItems = db.prepare('SELECT COUNT(*) as count FROM items').get().count;
    const lowStockAlert = db.prepare('SELECT low_stock_alert FROM settings LIMIT 1').get().low_stock_alert;
    const lowStockItems = db.prepare('SELECT COUNT(*) as count FROM items WHERE stock <= ?').get(lowStockAlert).count;
    
    const today = new Date().toISOString().split('T')[0];
    const todaysRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as sum FROM bills WHERE date(created_at) = ?").get(today).sum;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as sum FROM bills").get().sum;
    const todaysBills = db.prepare("SELECT COUNT(*) as count FROM bills WHERE date(created_at) = ?").get(today).count;

    sendSuccess(res, 'Dashboard data', { totalItems, lowStockItems, todaysRevenue, totalRevenue, todaysBills });
});

app.get('/api/history', (req, res) => {
    const logs = db.prepare('SELECT * FROM stock_logs ORDER BY created_at DESC').all();
    sendSuccess(res, 'Logs fetched', logs);
});

// ==========================
// Error Handling
// ==========================
app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint not found' }));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));