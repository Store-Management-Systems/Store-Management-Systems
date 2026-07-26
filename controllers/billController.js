const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const createBill = (req, res) => {
    const shopId = req.user.active_shop_id;
    const userId = req.user.id;

    const {
        customerName,
        customerPhone,
        customer_name,
        customer_phone,
        items,
        subtotal = 0,
        tax = 0,
        discount = 0,
        total = 0,
        paymentMode = 'Cash',
        payment_mode
    } = req.body;

    const finalCustName = customerName || customer_name || 'Walk-in Customer';
    const finalCustPhone = customerPhone || customer_phone || '';
    const finalPaymentMode = paymentMode || payment_mode || 'Cash';

    if (!items || !Array.isArray(items) || items.length === 0) {
        return error(res, 'Bill must contain at least one item', 400);
    }

    // Auto-generate sequential bill number
    const lastBill = db.prepare(`SELECT bill_number FROM bills WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1`).get(shopId);
    let nextNum = 1;
    if (lastBill && lastBill.bill_number) {
        const match = lastBill.bill_number.match(/\d+/);
        if (match) {
            nextNum = parseInt(match[0], 10) + 1;
        }
    }
    const billNumber = `BT-${String(nextNum).padStart(6, '0')}`;
    const billId = 'bil_' + uuidv4().substring(0, 8);

    // Calculate totals if not provided or verify correctness
    let calcSubtotal = 0;
    const processedItems = items.map(i => {
        const itemId = i.itemId || i.item_id || i.id;
        const itemObj = db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ?`).get(itemId, shopId);
        const name = i.name || (itemObj ? itemObj.name : 'Unknown Item');
        const qty = parseFloat(i.qty || i.quantity || 1);
        const price = parseFloat(i.price !== undefined ? i.price : (itemObj ? itemObj.selling_price : 0));
        const itemTotal = parseFloat((qty * price).toFixed(2));
        calcSubtotal += itemTotal;

        return {
            itemId,
            name,
            qty,
            price,
            total: itemTotal,
            stockAvailable: itemObj ? itemObj.stock : 0
        };
    });

    const finalSubtotal = subtotal > 0 ? parseFloat(subtotal) : parseFloat(calcSubtotal.toFixed(2));
    const finalTax = parseFloat(tax) || 0;
    const finalDiscount = parseFloat(discount) || 0;
    const finalTotal = total > 0 ? parseFloat(total) : parseFloat((finalSubtotal + finalTax - finalDiscount).toFixed(2));

    const billTx = db.transaction(() => {
        // 1. Save Bill
        db.prepare(`
            INSERT INTO bills (id, shop_id, user_id, bill_number, customer_name, customer_phone, subtotal, tax, discount, total, payment_mode, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            billId,
            shopId,
            userId,
            billNumber,
            finalCustName,
            finalCustPhone,
            finalSubtotal,
            finalTax,
            finalDiscount,
            finalTotal,
            finalPaymentMode,
            'Completed'
        );

        // 2. Save Bill Items, Deduct Stock & Generate Stock Logs
        const insertBillItem = db.prepare(`
            INSERT INTO bill_items (id, bill_id, item_id, name, qty, price, total)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const deductStock = db.prepare(`
            UPDATE items SET stock = MAX(0, stock - ?) WHERE id = ? AND shop_id = ?
        `);
        const insertStockLog = db.prepare(`
            INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, reason, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        processedItems.forEach(item => {
            const biId = 'bi_' + uuidv4().substring(0, 8);
            insertBillItem.run(biId, billId, item.itemId, item.name, item.qty, item.price, item.total);

            // Deduct Stock
            deductStock.run(item.qty, item.itemId, shopId);

            // Stock Log
            const logId = 'stk_' + uuidv4().substring(0, 8);
            insertStockLog.run(logId, shopId, userId, item.itemId, item.name, 'bill', item.qty, 'Bill Sale', `Bill #${billNumber}`);
        });

        // 3. Auto-Create/Update Customer if Phone is provided
        if (finalCustPhone && finalCustPhone.trim() !== '') {
            const existingCustomer = db.prepare(`SELECT id FROM customers WHERE shop_id = ? AND phone = ?`).get(shopId, finalCustPhone.trim());
            if (!existingCustomer) {
                db.prepare(`
                    INSERT INTO customers (id, shop_id, name, phone)
                    VALUES (?, ?, ?, ?)
                `).run('cus_' + uuidv4().substring(0, 8), shopId, finalCustName, finalCustPhone.trim());
            } else {
                db.prepare(`
                    UPDATE customers SET name = ? WHERE id = ?
                `).run(finalCustName, existingCustomer.id);
            }
        }
    });

    try {
        billTx();
        logAudit(shopId, userId, 'Generate Bill', `Generated Bill #${billNumber} for ₹${finalTotal}`);

        return success(res, 'Bill generated successfully', {
            id: billId,
            bill_number: billNumber,
            billNo: billNumber,
            customerName: finalCustName,
            customerPhone: finalCustPhone,
            items: processedItems,
            subtotal: finalSubtotal,
            tax: finalTax,
            discount: finalDiscount,
            total: finalTotal,
            paymentMode: finalPaymentMode,
            created_at: new Date().toISOString()
        }, 201);
    } catch (err) {
        return error(res, err.message || 'Failed to generate bill', 400);
    }
};

const getBills = (req, res) => {
    const shopId = req.user.active_shop_id;
    const { search, from, to, page = 1, limit = 50 } = req.query;

    let sql = `SELECT * FROM bills WHERE shop_id = ?`;
    const params = [shopId];

    if (search) {
        sql += ` AND (bill_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (from) {
        sql += ` AND date(created_at) >= date(?)`;
        params.push(from);
    }
    if (to) {
        sql += ` AND date(created_at) <= date(?)`;
        params.push(to);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const bills = db.prepare(sql).all(...params);

    // Attach items to each bill
    const getItems = db.prepare(`SELECT * FROM bill_items WHERE bill_id = ?`);
    bills.forEach(b => {
        b.items = getItems.all(b.id);
        b.billNo = b.bill_number;
        b.customerName = b.customer_name;
        b.customerPhone = b.customer_phone;
        b.date = b.created_at;
    });

    return success(res, 'Bills retrieved', bills);
};

const getBillById = (req, res) => {
    const { id } = req.params;
    const shopId = req.user.active_shop_id;

    const bill = db.prepare(`SELECT * FROM bills WHERE id = ? AND shop_id = ?`).get(id, shopId);
    if (!bill) {
        return error(res, 'Bill not found', 404);
    }

    bill.items = db.prepare(`SELECT * FROM bill_items WHERE bill_id = ?`).all(id);
    bill.billNo = bill.bill_number;
    bill.customerName = bill.customer_name;
    bill.customerPhone = bill.customer_phone;
    bill.date = bill.created_at;

    return success(res, 'Bill details retrieved', bill);
};

module.exports = {
    createBill,
    getBills,
    getBillById
};
