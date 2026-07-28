const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../../notifications/services/auditService');

const getPayments = async (req, res) => {
    const { personId } = req.query;
    const activeShop = req.user.active_shop_id;

    try {
        let sql = `
            SELECT pay.*, p.name as person_name, p.category as person_category, p.business_name
            FROM payments pay
            LEFT JOIN people p ON pay.person_id = p.id
            WHERE pay.shop_id = ?
        `;
        const params = [activeShop];

        if (personId) {
            sql += ` AND pay.person_id = ?`;
            params.push(personId);
        }

        sql += ` ORDER BY pay.created_at DESC LIMIT 100`;

        const payments = await db.prepare(sql).all(params);
        return success(res, 'Payments retrieved', payments);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const recordPayment = async (req, res) => {
    const { personId, amount, payment_mode = 'Cash', reference_no, notes, type } = req.body;

    if (!personId || !amount || parseFloat(amount) <= 0) {
        return error(res, 'Person ID and valid positive amount required', 400);
    }

    const activeShop = req.user.active_shop_id;
    const payAmt = parseFloat(amount);

    try {
        const person = await db.prepare(`SELECT * FROM people WHERE id = ? AND shop_id = ?`).get(personId, activeShop);
        if (!person) {
            return error(res, 'Party / Customer record not found', 404);
        }

        const payType = type || (person.category === 'Supplier' ? 'out' : 'in');

        const paymentId = 'pay_' + uuidv4().substring(0, 8);
        await db.prepare(`
            INSERT INTO payments (id, shop_id, person_id, user_id, type, payment_mode, amount, reference_no, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(paymentId, activeShop, personId, req.user.id, payType, payment_mode, payAmt, reference_no || null, notes || 'Payment Recorded');

        // Post to Ledger
        const ledgerId = 'ldg_' + uuidv4().substring(0, 8);
        const isSupplier = person.category === 'Supplier';

        const debit = payType === 'out' ? payAmt : 0;
        const credit = payType === 'in' ? payAmt : 0;
        const entryType = payType === 'in' ? 'Payment Received' : 'Payment Made';

        await db.prepare(`
            INSERT INTO ledgers (id, shop_id, person_id, entry_type, reference_id, debit, credit, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(ledgerId, activeShop, personId, entryType, paymentId, debit, credit, `Recorded via ${payment_mode} (Ref: ${reference_no || 'N/A'})`);

        let updatedDue = 0;
        const openBal = parseFloat(person.opening_balance || 0);

        if (isSupplier) {
            const purchRes = await db.prepare(`SELECT SUM(total) as sum FROM purchases WHERE supplier_id = ?`).get(personId);
            const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'out'`).get(personId);
            updatedDue = (parseFloat(purchRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
        } else {
            const salesRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE person_id = ? OR customer_phone = ?`).get(personId, person.mobile);
            const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'in'`).get(personId);
            updatedDue = (parseFloat(salesRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
        }

        await logAudit(activeShop, req.user.id, 'Record Payment', `${entryType} of ₹${payAmt} for ${person.name} via ${payment_mode}`);

        return success(res, `${entryType} recorded successfully`, {
            payment_id: paymentId,
            person_name: person.name,
            amount_paid: payAmt,
            remaining_due: updatedDue
        }, 201);
    } catch (err) {
        return error(res, err.message || 'Failed to record payment', 500);
    }
};

module.exports = {
    getPayments,
    recordPayment
};
