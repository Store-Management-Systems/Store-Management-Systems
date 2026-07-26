const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const getBills = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        const bills = await db.prepare(`
            SELECT * FROM bills 
            WHERE shop_id = ? 
            ORDER BY created_at DESC
        `).all(targetShop);

        return success(res, 'Bills retrieved successfully', bills);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const getBillById = async (req, res) => {
    const { id } = req.params;
    try {
        const bill = await db.prepare(`SELECT * FROM bills WHERE id = ?`).get(id);
        if (!bill) {
            return error(res, 'Bill not found', 404);
        }

        const items = await db.prepare(`SELECT * FROM bill_items WHERE bill_id = ?`).all(id);
        return success(res, 'Bill details retrieved', { ...bill, items });
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const createBill = async (req, res) => {
    const { customerName = 'Walk-in Customer', customerPhone = '', items = [], subtotal, tax = 0, discount = 0, total, paymentMode = 'Cash' } = req.body;
    const activeShop = req.user.active_shop_id;

    if (!items || items.length === 0) {
        return error(res, 'Bill must contain at least one item', 400);
    }

    try {
        // Generate Sequential Bill Number
        const countRes = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ?`).get(activeShop);
        const nextNum = (countRes ? parseInt(countRes.count || 0) : 0) + 1;
        const billNumber = 'BT-' + String(nextNum).padStart(6, '0');

        const billId = 'bil_' + uuidv4().substring(0, 8);

        // Insert Bill Header
        await db.prepare(`
            INSERT INTO bills (id, shop_id, user_id, bill_number, customer_name, customer_phone, subtotal, tax, discount, total, payment_mode, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            billId, activeShop, req.user.id, billNumber, customerName, customerPhone, subtotal, tax, discount, total, paymentMode, 'Completed'
        );

        // Insert Bill Items & Deduct Stock
        for (const item of items) {
            const biId = 'bi_' + uuidv4().substring(0, 8);
            const qty = parseFloat(item.qty) || 1;
            const price = parseFloat(item.price) || 0;
            const itemTotal = qty * price;

            await db.prepare(`
                INSERT INTO bill_items (id, bill_id, item_id, item_name, price, qty, total)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(biId, billId, item.itemId, item.name, price, qty, itemTotal);

            // Deduct Stock
            if (item.itemId) {
                await db.prepare(`
                    UPDATE items SET 
                        stock = GREATEST(0, stock - ?),
                        qty = GREATEST(0, qty - ?),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND shop_id = ?
                `).run(qty, qty, item.itemId, activeShop);

                // Stock Log Entry
                await db.prepare(`
                    INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, qty, reason, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    'log_' + uuidv4().substring(0, 8), activeShop, req.user.id, item.itemId, item.name, 'out', qty, qty, 'Sold (Bill)', `Bill #${billNumber}`
                );
            }
        }

        // Auto Save / Update Customer
        if (customerPhone) {
            const existingCust = await db.prepare(`SELECT id FROM customers WHERE phone = ? AND shop_id = ?`).get(customerPhone, activeShop);
            if (!existingCust) {
                await db.prepare(`
                    INSERT INTO customers (id, shop_id, name, phone) VALUES (?, ?, ?, ?)
                `).run('cust_' + uuidv4().substring(0, 8), activeShop, customerName, customerPhone);
            }
        }

        await logAudit(activeShop, req.user.id, 'Generate Bill', `Generated Bill #${billNumber} for total ${total}`);

        return success(res, 'Bill generated successfully', {
            id: billId,
            bill_number: billNumber,
            billNo: billNumber,
            customerName,
            customerPhone,
            items,
            subtotal,
            tax,
            discount,
            total,
            paymentMode,
            created_at: new Date().toISOString()
        }, 201);
    } catch (err) {
        return error(res, err.message || 'Failed to generate bill', 500);
    }
};

module.exports = {
    getBills,
    getBillById,
    createBill
};
