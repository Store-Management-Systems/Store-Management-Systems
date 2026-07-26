const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const getBills = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        const { search, status, payment_status, range, startDate, endDate } = req.query;

        let sql = `SELECT * FROM bills WHERE shop_id = ?`;
        const params = [targetShop];

        if (search) {
            sql += ` AND (LOWER(bill_number) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_phone) LIKE ?)`;
            const s = `%${search.toLowerCase()}%`;
            params.push(s, s, s);
        }

        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }

        if (payment_status) {
            sql += ` AND payment_status = ?`;
            params.push(payment_status);
        }

        if (range === 'today') {
            sql += ` AND created_at >= CURRENT_DATE`;
        } else if (range === 'yesterday') {
            sql += ` AND created_at >= (CURRENT_DATE - INTERVAL '1 day') AND created_at < CURRENT_DATE`;
        } else if (range === '7days') {
            sql += ` AND created_at >= (CURRENT_DATE - INTERVAL '7 days')`;
        } else if (range === '30days') {
            sql += ` AND created_at >= (CURRENT_DATE - INTERVAL '30 days')`;
        } else if (startDate && endDate) {
            sql += ` AND created_at >= ? AND created_at <= ?`;
            params.push(startDate, endDate);
        }

        sql += ` ORDER BY created_at DESC LIMIT 200`;

        const bills = await db.prepare(sql).all(params);
        return success(res, 'Bills retrieved', bills);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const getBillById = async (req, res) => {
    const { id } = req.params;
    try {
        const bill = await db.prepare(`SELECT * FROM bills WHERE id = ? AND shop_id = ?`).get(id, req.user.active_shop_id);
        if (!bill) {
            return error(res, 'Bill not found', 404);
        }

        const items = await db.prepare(`SELECT * FROM bill_items WHERE bill_id = ?`).all(id);
        let cashier = null;
        if (bill.user_id) {
            cashier = await db.prepare(`SELECT name, username FROM users WHERE id = ?`).get(bill.user_id);
        }

        return success(res, 'Bill details retrieved', { ...bill, items, cashier_name: cashier ? cashier.name : 'Store Staff' });
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const getBillStats = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;

        const todaySalesRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ? AND status != 'Cancelled' AND created_at >= CURRENT_DATE`).get(targetShop);
        const totalBillsRes = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ?`).get(targetShop);
        const paidBillsRes = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ? AND payment_status = 'Paid' AND status != 'Cancelled'`).get(targetShop);
        const creditBillsRes = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ? AND (payment_status = 'Unpaid' OR payment_status = 'Partially Paid') AND status != 'Cancelled'`).get(targetShop);
        const cancelledBillsRes = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ? AND status = 'Cancelled'`).get(targetShop);
        const draftBillsRes = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ? AND status = 'Draft'`).get(targetShop);
        const totalRevenueRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ? AND status != 'Cancelled'`).get(targetShop);

        const totalRevenue = parseFloat(totalRevenueRes?.sum || 0);
        const validBillsCount = parseInt(totalBillsRes?.count || 0) - parseInt(cancelledBillsRes?.count || 0);
        const avgBillValue = validBillsCount > 0 ? (totalRevenue / validBillsCount) : 0;

        return success(res, 'Billing statistics retrieved', {
            todaySales: parseFloat(todaySalesRes?.sum || 0),
            totalBills: parseInt(totalBillsRes?.count || 0),
            paidBills: parseInt(paidBillsRes?.count || 0),
            creditBills: parseInt(creditBillsRes?.count || 0),
            cancelledBills: parseInt(cancelledBillsRes?.count || 0),
            draftBills: parseInt(draftBillsRes?.count || 0),
            totalRevenue,
            avgBillValue
        });
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const createBill = async (req, res) => {
    const {
        personId,
        customerName = 'Walk-in Customer',
        customerPhone = '',
        items = [],
        subtotal,
        tax = 0,
        discount = 0,
        total,
        paidAmount,
        paymentMode = 'Cash',
        notes
    } = req.body;

    if (!items || items.length === 0) {
        return error(res, 'At least one item is required to generate a bill', 400);
    }

    const activeShop = req.user.active_shop_id;
    const calcSubtotal = parseFloat(subtotal) || 0;
    const calcTax = parseFloat(tax) || 0;
    const calcDiscount = parseFloat(discount) || 0;
    const calcTotal = parseFloat(total) || (calcSubtotal + calcTax - calcDiscount);

    const paid = paidAmount !== undefined ? parseFloat(paidAmount) : calcTotal;
    const due = Math.max(0, calcTotal - paid);

    let paymentStatus = 'Paid';
    if (due === calcTotal && calcTotal > 0) paymentStatus = 'Unpaid';
    else if (due > 0) paymentStatus = 'Partially Paid';

    try {
        let selectedPerson = null;

        if (personId) {
            selectedPerson = await db.prepare(`SELECT * FROM people WHERE id = ? AND shop_id = ?`).get(personId, activeShop);
        } else if (customerPhone) {
            selectedPerson = await db.prepare(`SELECT * FROM people WHERE mobile = ? AND shop_id = ? AND status != 'Deleted'`).get(customerPhone, activeShop);
        }

        if (selectedPerson && selectedPerson.category === 'Party' && due > 0) {
            const creditLimit = parseFloat(selectedPerson.credit_limit || 0);
            if (creditLimit > 0) {
                const salesRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE person_id = ? AND status != 'Cancelled'`).get(selectedPerson.id);
                const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'in'`).get(selectedPerson.id);
                const currentDue = (parseFloat(salesRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + parseFloat(selectedPerson.opening_balance || 0);

                if (currentDue + due > creditLimit) {
                    return error(res, `Credit Limit Exceeded for '${selectedPerson.name}'! (Limit: ₹${creditLimit}, Current Due: ₹${currentDue}, New Due: ₹${due})`, 400);
                }
            }
        }

        for (const cartItem of items) {
            const itemId = cartItem.itemId || cartItem.item_id || cartItem.id;
            const requestedQty = parseFloat(cartItem.qty);

            if (itemId) {
                const dbItem = await db.prepare(`SELECT stock, name FROM items WHERE id = ? AND shop_id = ?`).get(itemId, activeShop);
                if (!dbItem) {
                    return error(res, `Item '${cartItem.name}' does not exist`, 400);
                }
                if (parseFloat(dbItem.stock) < requestedQty) {
                    return error(res, `Insufficient stock for '${dbItem.name}' (Available: ${dbItem.stock}, Requested: ${requestedQty})`, 400);
                }
            }
        }

        const countRes = await db.prepare(`SELECT COUNT(*) as cnt FROM bills WHERE shop_id = ?`).get(activeShop);
        const billNoSeq = (parseInt(countRes?.cnt || 0) + 1).toString().padStart(6, '0');
        const billId = 'bill_' + uuidv4().substring(0, 8);

        const targetPersonId = selectedPerson ? selectedPerson.id : null;
        const targetName = selectedPerson ? (selectedPerson.business_name || selectedPerson.name) : customerName;
        const targetPhone = selectedPerson ? selectedPerson.mobile : customerPhone;

        await db.prepare(`
            INSERT INTO bills (
                id, shop_id, user_id, person_id, bill_number, customer_name, customer_phone,
                subtotal, tax, discount, total, paid_amount, due_amount, payment_status, payment_mode, status, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?)
        `).run(
            billId, activeShop, req.user.id, targetPersonId, billNoSeq, targetName, targetPhone || null,
            calcSubtotal, calcTax, calcDiscount, calcTotal, paid, due, paymentStatus, paymentMode, notes || null
        );

        for (const cartItem of items) {
            const itemId = cartItem.itemId || cartItem.item_id || cartItem.id;
            const itemQty = parseFloat(cartItem.qty);
            const itemPrice = parseFloat(cartItem.price);
            const itemTotal = itemQty * itemPrice;
            const billItemId = 'bi_' + uuidv4().substring(0, 8);

            await db.prepare(`
                INSERT INTO bill_items (id, bill_id, item_id, item_name, price, qty, total)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(billItemId, billId, itemId || null, cartItem.name, itemPrice, itemQty, itemTotal);

            if (itemId) {
                await db.prepare(`
                    UPDATE items SET
                        stock = GREATEST(0, stock - ?),
                        qty = GREATEST(0, qty - ?),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND shop_id = ?
                `).run(itemQty, itemQty, itemId, activeShop);

                const logId = 'log_' + uuidv4().substring(0, 8);
                await db.prepare(`
                    INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, qty, reason, notes)
                    VALUES (?, ?, ?, ?, ?, 'out', ?, ?, 'Billing Sale', ?)
                `).run(logId, activeShop, req.user.id, itemId, cartItem.name, itemQty, itemQty, `Bill #${billNoSeq}`);
            }
        }

        if (targetPersonId) {
            const ledgerId = 'ldg_' + uuidv4().substring(0, 8);
            await db.prepare(`
                INSERT INTO ledgers (id, shop_id, person_id, entry_type, reference_id, debit, credit, notes)
                VALUES (?, ?, ?, 'Sales Invoice', ?, ?, 0, ?)
            `).run(ledgerId, activeShop, targetPersonId, billId, calcTotal, `Sales Bill #${billNoSeq}`);

            if (paid > 0) {
                const payId = 'pay_' + uuidv4().substring(0, 8);
                await db.prepare(`
                    INSERT INTO payments (id, shop_id, person_id, user_id, type, payment_mode, amount, reference_no, notes)
                    VALUES (?, ?, ?, ?, 'in', ?, ?, ?, ?)
                `).run(payId, activeShop, targetPersonId, req.user.id, paymentMode, paid, billNoSeq, `Bill #${billNoSeq} Payment`);

                const payLdgId = 'ldg_' + uuidv4().substring(0, 8);
                await db.prepare(`
                    INSERT INTO ledgers (id, shop_id, person_id, entry_type, reference_id, debit, credit, notes)
                    VALUES (?, ?, ?, 'Payment Received', ?, 0, ?, ?)
                `).run(payLdgId, activeShop, targetPersonId, payId, paid, `Payment for Bill #${billNoSeq}`);
            }
        }

        await logAudit(activeShop, req.user.id, 'Create Bill', `Generated Bill #${billNoSeq} for ₹${calcTotal} (${paymentStatus})`);

        return success(res, 'Bill generated successfully', {
            id: billId,
            bill_number: billNoSeq,
            customer_name: targetName,
            total: calcTotal,
            paid_amount: paid,
            due_amount: due,
            payment_status: paymentStatus,
            items
        }, 201);

    } catch (err) {
        return error(res, err.message || 'Failed to create bill', 500);
    }
};

const cancelBill = async (req, res) => {
    const { id } = req.params;
    const { reason = 'Customer Cancellation' } = req.body;
    const activeShop = req.user.active_shop_id;

    try {
        const bill = await db.prepare(`SELECT * FROM bills WHERE id = ? AND shop_id = ?`).get(id, activeShop);
        if (!bill) return error(res, 'Bill not found', 404);

        if (bill.status === 'Cancelled') {
            return error(res, 'Bill is already cancelled', 400);
        }

        await db.prepare(`
            UPDATE bills SET
                status = 'Cancelled',
                cancelled_by = ?,
                cancellation_reason = ?,
                cancelled_at = CURRENT_TIMESTAMP
            WHERE id = ? AND shop_id = ?
        `).run(req.user.id, reason, id, activeShop);

        const billItems = await db.prepare(`SELECT * FROM bill_items WHERE bill_id = ?`).all(id);
        for (const item of billItems) {
            if (item.item_id) {
                await db.prepare(`
                    UPDATE items SET
                        stock = stock + ?,
                        qty = qty + ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND shop_id = ?
                `).run(parseFloat(item.qty), parseFloat(item.qty), item.item_id, activeShop);

                const logId = 'log_' + uuidv4().substring(0, 8);
                await db.prepare(`
                    INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, qty, reason, notes)
                    VALUES (?, ?, ?, ?, ?, 'in', ?, ?, 'Bill Cancellation', ?)
                `).run(logId, activeShop, req.user.id, item.item_id, item.item_name, parseFloat(item.qty), parseFloat(item.qty), `Restored from cancelled Bill #${bill.bill_number}`);
            }
        }

        if (bill.person_id) {
            const billTotal = parseFloat(bill.total || 0);
            const ledgerId = 'ldg_' + uuidv4().substring(0, 8);
            await db.prepare(`
                INSERT INTO ledgers (id, shop_id, person_id, entry_type, reference_id, debit, credit, notes)
                VALUES (?, ?, ?, 'Invoice Cancellation', ?, 0, ?, ?)
            `).run(ledgerId, activeShop, bill.person_id, id, billTotal, `Reversal of Cancelled Bill #${bill.bill_number}`);
        }

        await logAudit(activeShop, req.user.id, 'Cancel Bill', `Cancelled Bill #${bill.bill_number} (Reason: ${reason})`);
        return success(res, `Bill #${bill.bill_number} cancelled successfully and stock restored`);
    } catch (err) {
        return error(res, err.message || 'Failed to cancel bill', 500);
    }
};

module.exports = {
    getBills,
    getBillById,
    getBillStats,
    createBill,
    cancelBill
};
