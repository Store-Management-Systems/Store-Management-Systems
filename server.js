const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('./db');
const path = require('path');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_shop_key_2026';

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // Disabled CSP for inline scripts on old frontend
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

// ─── AUTH & RBAC MIDDLEWARE ──────────────────────────────────────────
const authenticate = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Session expired. Please login again.' });
        req.user = decoded;
        next();
    });
};

const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        if (req.user.role === 'Admin' || req.user.role === 'Owner') return next();
        try {
            const perms = JSON.parse(req.user.permissions || '[]');
            if (perms.includes(requiredPermission)) return next();
            return res.status(403).json({ error: 'Permission denied for this action.' });
        } catch(e) {
            return res.status(403).json({ error: 'Permission denied.' });
        }
    };
};

const logAudit = (shop_id, user_id, action, details) => {
    db.run(`INSERT INTO logs (id, shop_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)`,
        ['LOG_' + Date.now(), shop_id, user_id, action, details]);
};

// ─── AUTHENTICATION APIs ──────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND status = 'active'`, [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, role: user.role, shop_id: user.shop_id, permissions: user.permissions }, JWT_SECRET, { expiresIn: '12h' });
        
        logAudit(user.shop_id, user.id, 'Login', 'User successfully logged in');
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
        res.json({ message: 'Success', user: { name: user.name, role: user.role, permissions: JSON.parse(user.permissions || '[]') } });
    });
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
    db.get(`SELECT name, role, permissions, shop_id FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'User not found' });
        res.json({ ...user, permissions: JSON.parse(user.permissions || '[]') });
    });
});

// ─── DATA SYNC API (For Backwards Compatibility with Frontend State) ────
app.get('/api/sync', authenticate, (req, res) => {
    const shop_id = req.user.role === 'Admin' ? (req.query.shop_id || req.user.shop_id) : req.user.shop_id;
    
    db.serialize(() => {
        const state = { shop: {}, items: [], bills: [], logs: [], categories: ['Others'], units: ['Box'] };
        
        db.get(`SELECT * FROM shops WHERE id = ?`, [shop_id], (err, shop) => {
            if (shop) state.shop = { ...shop, name: shop.shop_name, taxRate: shop.tax_rate };
            
            db.all(`SELECT * FROM items WHERE shop_id = ? AND status = 'active'`, [shop_id], (err, items) => {
                if(items) state.items = items;
                
                db.all(`SELECT * FROM bills WHERE shop_id = ? ORDER BY date DESC LIMIT 50`, [shop_id], (err, bills) => {
                    if(bills) {
                        state.bills = bills;
                        // Fetch bill items separately for simplicity in this format
                        let pending = bills.length;
                        if(pending === 0) completeSync();
                        bills.forEach(b => {
                            db.all(`SELECT * FROM bill_items WHERE bill_id = ?`, [b.id], (err, bi) => {
                                b.items = bi || [];
                                pending--;
                                if(pending === 0) completeSync();
                            });
                        });
                    } else completeSync();
                    
                    function completeSync() {
                        res.json(state);
                    }
                });
            });
        });
    });
});

// ─── BILLING & CUSTOMERS ──────────────────────────────────────────────
app.post('/api/bills', authenticate, checkPermission('Billing'), (req, res) => {
    const { billNo, customerName, customerPhone, items, subtotal, tax, total, taxRate, date } = req.body;
    const shop_id = req.user.shop_id;
    const billId = 'BIL_' + Date.now();

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        db.run(`INSERT INTO bills (id, shop_id, user_id, bill_no, customer_name, customer_phone, subtotal, tax, total, tax_rate, date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [billId, shop_id, req.user.id, billNo, customerName, customerPhone, subtotal, tax, total, taxRate, date]);

        // Auto Create Customer
        if (customerPhone) {
            db.run(`INSERT OR IGNORE INTO customers (id, shop_id, name, phone) VALUES (?, ?, ?, ?)`,
                   ['CUS_' + customerPhone, shop_id, customerName, customerPhone]);
        }

        items.forEach(i => {
            db.run(`INSERT INTO bill_items (id, bill_id, item_id, name, qty, price) VALUES (?, ?, ?, ?, ?, ?)`,
                   ['BI_' + Math.random().toString(36).substr(2,9), billId, i.itemId, i.name, i.qty, i.price]);
            // Deduct Stock
            db.run(`UPDATE items SET qty = MAX(0, qty - ?) WHERE id = ? AND shop_id = ?`, [i.qty, i.itemId, shop_id]);
        });

        logAudit(shop_id, req.user.id, 'Generate Bill', `Generated Bill #${billNo} for ₹${total}`);
        db.run('COMMIT');
        res.json({ message: 'Bill generated successfully', id: billId });
    });
});

// ─── ITEMS & INVENTORY ────────────────────────────────────────────────
app.post('/api/items', authenticate, checkPermission('Create Item'), (req, res) => {
    const { name, category, unit, buyPrice, price, qty } = req.body;
    const id = 'ITM_' + Date.now();
    db.run(`INSERT INTO items (id, shop_id, name, category, unit, buy_price, price, qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user.shop_id, name, category, unit, buyPrice, price, qty], (err) => {
            if (err) return res.status(500).json({error: 'Failed to add item'});
            logAudit(req.user.shop_id, req.user.id, 'Add Item', `Added ${name}`);
            res.json({ message: 'Success', id });
    });
});

app.put('/api/items/:id', authenticate, checkPermission('Edit Item'), (req, res) => {
    const { name, category, unit, buyPrice, price, qty } = req.body;
    db.run(`UPDATE items SET name=?, category=?, unit=?, buy_price=?, price=?, qty=? WHERE id=? AND shop_id=?`,
        [name, category, unit, buyPrice, price, qty, req.params.id, req.user.shop_id], (err) => {
            logAudit(req.user.shop_id, req.user.id, 'Edit Item', `Updated item ID: ${req.params.id}`);
            res.json({ message: 'Updated successfully' });
    });
});

app.delete('/api/items/:id', authenticate, checkPermission('Delete Item'), (req, res) => {
    db.run(`UPDATE items SET status='deleted' WHERE id=? AND shop_id=?`, [req.params.id, req.user.shop_id], (err) => {
        logAudit(req.user.shop_id, req.user.id, 'Delete Item', `Deleted item ID: ${req.params.id}`);
        res.json({ message: 'Deleted successfully' });
    });
});

// ─── REPORTING (EXCEL) ────────────────────────────────────────────────
app.get('/api/reports/excel', authenticate, checkPermission('Reports'), async (req, res) => {
    const { type, from, to } = req.query;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(type || 'Report');

    // Title Row
    sheet.addRow(['SHOP MANAGEMENT SYSTEM - REPORT']);
    sheet.addRow([`Report Type: ${type}`]);
    sheet.addRow([`Generated: ${new Date().toLocaleString()}`]);
    sheet.addRow([]); // Blank line

    if (type === 'Inventory') {
        sheet.addRow(['Item Name', 'Category', 'Unit', 'Buy Price', 'Selling Price', 'Current Stock', 'Stock Value']);
        const items = await new Promise(r => db.all(`SELECT * FROM items WHERE shop_id=? AND status='active'`, [req.user.shop_id], (e, rows) => r(rows||[])));
        items.forEach(i => {
            sheet.addRow([i.name, i.category, i.unit, i.buy_price, i.price, i.qty, (i.buy_price * i.qty)]);
        });
    } else if (type === 'Billing') {
        sheet.addRow(['Bill No', 'Date', 'Customer', 'Phone', 'Tax', 'Total']);
        const bills = await new Promise(r => db.all(`SELECT * FROM bills WHERE shop_id=? ORDER BY date DESC`, [req.user.shop_id], (e, rows) => r(rows||[])));
        bills.forEach(b => {
            sheet.addRow([b.bill_no, new Date(b.date).toLocaleDateString(), b.customer_name, b.customer_phone, b.tax, b.total]);
        });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${type}-Report.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
    logAudit(req.user.shop_id, req.user.id, 'Download Report', `Downloaded ${type} Excel Report`);
});

// ─── START SERVER ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));