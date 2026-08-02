"use strict";
const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../../notifications/services/auditService');
const getPurchases = async (req, res) => {
    const activeShop = req.user.active_shop_id;
    try {
        const purchases = await db.prepare(`
            SELECT pur.*, p.name as supplier_name, p.business_name as supplier_business
            FROM purchases pur
            LEFT JOIN people p ON pur.supplier_id = p.id
            WHERE pur.shop_id = ?
            ORDER BY pur.created_at DESC
        `).all(activeShop);
        return success(res, 'Purchases retrieved', purchases);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const getPurchaseById = async (req, res) => {
    const { id } = req.params;
    const activeShop = req.user.active_shop_id;
    try {
        const purchase = await db.prepare(`
            SELECT pur.*, p.name as supplier_name, p.business_name, p.mobile, p.gstin
            FROM purchases pur
            LEFT JOIN people p ON pur.supplier_id = p.id
            WHERE pur.id = ? AND pur.shop_id = ?
        `).get(id, activeShop);
        if (!purchase)
            return error(res, 'Purchase record not found', 404);
        const items = await db.prepare(`SELECT * FROM purchase_items WHERE purchase_id = ?`).all(id);
        return success(res, 'Purchase details', { ...purchase, items });
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const createPurchase = async (req, res) => {
    const { supplierId, supplier_invoice_no, items = [], paidAmount = 0, paymentMode = 'Bank Transfer', notes } = req.body;
    if (!supplierId || !items || items.length === 0) {
        return error(res, 'Supplier ID and at least one item required', 400);
    }
    const activeShop = req.user.active_shop_id;
    try {
        const supplier = await db.prepare(`SELECT * FROM people WHERE id = ? AND shop_id = ? AND category = 'Supplier'`).get(supplierId, activeShop);
        if (!supplier) {
            return error(res, 'Selected supplier does not exist', 404);
        }
        let subtotal = 0;
        const lineItems = [];
        for (const item of items) {
            const qty = parseFloat(item.qty) || 0;
            const buyPrice = parseFloat(item.buy_price || item.buyPrice || item.price) || 0;
            if (qty <= 0 || buyPrice < 0)
                continue;
            const lineTotal = qty * buyPrice;
            subtotal += lineTotal;
            lineItems.push({
                item_id: item.itemId || item.item_id || item.id,
                item_name: item.name || item.item_name,
                buy_price: buyPrice,
                qty,
                total: lineTotal
            });
        }
        if (lineItems.length === 0) {
            return error(res, 'Invalid items or quantities provided', 400);
        }
        const total = subtotal;
        const paid = Math.min(parseFloat(paidAmount) || 0, total);
        const due = total - paid;
        let paymentStatus = 'Unpaid';
        if (due === 0)
            paymentStatus = 'Paid';
        else if (paid > 0)
            paymentStatus = 'Partially Paid';
        const countRes = await db.prepare(`SELECT COUNT(*) as cnt FROM purchases WHERE shop_id = ?`).get(activeShop);
        const seq = (parseInt(countRes?.cnt || 0) + 1).toString().padStart(5, '0');
        const purchaseNumber = `PUR-${seq}`;
        const purchaseId = 'pur_' + uuidv4().substring(0, 8);
        // 1. Save Purchase Header
        await db.prepare(`
            INSERT INTO purchases (id, shop_id, supplier_id, user_id, purchase_number, supplier_invoice_no, subtotal, tax, discount, total, paid_amount, due_amount, payment_status, payment_mode, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)
        `).run(purchaseId, activeShop, supplierId, req.user.id, purchaseNumber, supplier_invoice_no || null, subtotal, total, paid, due, paymentStatus, paymentMode, notes || 'B2B Restock Purchase');
        // 2. Save Line Items & Update Stock
        for (const li of lineItems) {
            const piId = 'pi_' + uuidv4().substring(0, 8);
            await db.prepare(`
                INSERT INTO purchase_items (id, purchase_id, item_id, item_name, buy_price, qty, total)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(piId, purchaseId, li.item_id, li.item_name, li.buy_price, li.qty, li.total);
            if (li.item_id) {
                await db.prepare(`
                    UPDATE items SET
                        stock = stock + ?,
                        qty = qty + ?,
                        buy_price = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND shop_id = ?
                `).run(li.qty, li.qty, li.buy_price, li.item_id, activeShop);
                // Stock Log
                const logId = 'log_' + uuidv4().substring(0, 8);
                await db.prepare(`
                    INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, qty, supplier, notes)
                    VALUES (?, ?, ?, ?, ?, 'in', ?, ?, ?, ?)
                `).run(logId, activeShop, req.user.id, li.item_id, li.item_name, li.qty, li.qty, supplier.name, `B2B Restock Inv #${purchaseNumber}`);
            }
        }
        // 3. Post to Supplier Ledger (Credit = Purchase Total increases Payable)
        const ledgerId = 'ldg_' + uuidv4().substring(0, 8);
        await db.prepare(`
            INSERT INTO ledgers (id, shop_id, person_id, entry_type, reference_id, debit, credit, notes)
            VALUES (?, ?, ?, 'Purchase Invoice', ?, 0, ?, ?)
        `).run(ledgerId, activeShop, supplierId, purchaseId, total, `Purchase Inv #${purchaseNumber}`);
        // 4. If initial payment made, record Payment & Debit Ledger Entry
        if (paid > 0) {
            const payId = 'pay_' + uuidv4().substring(0, 8);
            await db.prepare(`
                INSERT INTO payments (id, shop_id, person_id, user_id, type, payment_mode, amount, reference_no, notes)
                VALUES (?, ?, ?, ?, 'out', ?, ?, ?, ?)
            `).run(payId, activeShop, supplierId, req.user.id, paymentMode, paid, purchaseNumber, `Initial Payment for Inv #${purchaseNumber}`);
            const payLdgId = 'ldg_' + uuidv4().substring(0, 8);
            await db.prepare(`
                INSERT INTO ledgers (id, shop_id, person_id, entry_type, reference_id, debit, credit, notes)
                VALUES (?, ?, ?, 'Payment Made', ?, ?, 0, ?)
            `).run(payLdgId, activeShop, supplierId, payId, paid, `Payment for Purchase Inv #${purchaseNumber}`);
        }
        await logAudit(activeShop, req.user.id, 'Create Purchase', `Created Purchase Invoice ${purchaseNumber} for ${supplier.name} (Total: ₹${total})`);
        return success(res, 'Purchase recorded & inventory restocked successfully', {
            id: purchaseId,
            purchase_number: purchaseNumber,
            total,
            due
        }, 201);
    }
    catch (err) {
        return error(res, err.message || 'Failed to process purchase', 500);
    }
};
module.exports = {
    getPurchases,
    getPurchaseById,
    createPurchase
};
