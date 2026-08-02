"use strict";
const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../../notifications/services/auditService');
const getPeople = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        const category = req.query.category || '';
        const search = req.query.search || '';
        const status = req.query.status || '';
        const limit = parseInt(req.query.limit) || (req.query.all === 'true' ? 5000 : 100);
        const lastId = req.query.last_id || null;
        let sql = `SELECT id, shop_id, category, name, business_name, mobile, alt_mobile, email, gstin, address, opening_balance, credit_limit, status, created_at 
                   FROM people WHERE shop_id = ? AND status != 'Deleted'`;
        const params = [targetShop];
        if (category && category !== 'All') {
            sql += ` AND category = ?`;
            params.push(category);
        }
        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }
        if (search) {
            sql += ` AND (LOWER(name) LIKE ? OR LOWER(business_name) LIKE ? OR mobile LIKE ? OR LOWER(gstin) LIKE ?)`;
            const q = `%${search.toLowerCase()}%`;
            params.push(q, q, q, q);
        }
        if (lastId) {
            sql += ` AND id < ?`;
            params.push(lastId);
        }
        sql += ` ORDER BY created_at DESC, id DESC LIMIT ?`;
        params.push(limit);
        const people = await db.prepare(sql).all(params);
        if (people.length === 0) {
            return success(res, 'People records retrieved', []);
        }
        const personIds = people.map(p => p.id);
        const placeholders = personIds.map(() => '?').join(',');
        const [purchasesStats, salesStats, paymentsStats] = await Promise.all([
            db.prepare(`SELECT supplier_id as person_id, SUM(total) as sum, MAX(created_at) as last_date FROM purchases WHERE supplier_id IN (${placeholders}) GROUP BY supplier_id`).all(personIds),
            db.prepare(`SELECT person_id, SUM(total) as sum, MAX(created_at) as last_date FROM bills WHERE person_id IN (${placeholders}) AND status != 'Cancelled' GROUP BY person_id`).all(personIds),
            db.prepare(`SELECT person_id, type, SUM(amount) as sum, MAX(created_at) as last_pay FROM payments WHERE person_id IN (${placeholders}) GROUP BY person_id, type`).all(personIds)
        ]);
        const purchasesMap = new Map((purchasesStats || []).map(r => [r.person_id, r]));
        const salesMap = new Map((salesStats || []).map(r => [r.person_id, r]));
        const paymentsMap = new Map();
        (paymentsStats || []).forEach(r => {
            if (!paymentsMap.has(r.person_id))
                paymentsMap.set(r.person_id, {});
            paymentsMap.get(r.person_id)[r.type] = r;
        });
        for (const p of people) {
            const openBal = parseFloat(p.opening_balance || 0);
            if (p.category === 'Supplier') {
                const purchRes = purchasesMap.get(p.id);
                const payRes = paymentsMap.get(p.id)?.['out'];
                const totalPurchases = parseFloat(purchRes?.sum || 0);
                const totalPaid = parseFloat(payRes?.sum || 0);
                const dueAmount = totalPurchases - totalPaid + openBal;
                p.total_purchases = totalPurchases;
                p.total_paid = totalPaid;
                p.due_amount = dueAmount;
                p.last_purchase_date = purchRes?.last_date || null;
                p.last_payment_date = payRes?.last_pay || null;
            }
            else {
                const salesRes = salesMap.get(p.id);
                const payRes = paymentsMap.get(p.id)?.['in'];
                const totalSales = parseFloat(salesRes?.sum || 0);
                const totalPaid = parseFloat(payRes?.sum || 0);
                const dueAmount = totalSales - totalPaid + openBal;
                p.total_sales = totalSales;
                p.total_paid = totalPaid;
                p.due_amount = dueAmount;
                p.last_visit = salesRes?.last_date || null;
                p.last_payment_date = payRes?.last_pay || null;
            }
        }
        return success(res, 'People records retrieved', people);
    }
    catch (err) {
        return error(res, err.message || 'Failed to retrieve records', 500);
    }
};
const getPersonById = async (req, res) => {
    const { id } = req.params;
    try {
        const p = await db.prepare(`SELECT * FROM people WHERE id = ? AND shop_id = ?`).get(id, req.user.active_shop_id);
        if (!p) {
            return error(res, 'Person/Party record not found', 404);
        }
        const openBal = parseFloat(p.opening_balance || 0);
        if (p.category === 'Supplier') {
            const purchRes = await db.prepare(`SELECT SUM(total) as sum, COUNT(*) as count, MAX(created_at) as last_date FROM purchases WHERE supplier_id = ?`).get(p.id);
            const payRes = await db.prepare(`SELECT SUM(amount) as sum, MAX(created_at) as last_pay FROM payments WHERE person_id = ? AND type = 'out'`).get(p.id);
            p.total_purchases = parseFloat(purchRes?.sum || 0);
            p.purchase_count = parseInt(purchRes?.count || 0);
            p.total_paid = parseFloat(payRes?.sum || 0);
            p.due_amount = p.total_purchases - p.total_paid + openBal;
            p.last_purchase_date = purchRes?.last_date || null;
            p.last_payment_date = payRes?.last_pay || null;
        }
        else {
            const salesRes = await db.prepare(`SELECT SUM(total) as sum, COUNT(*) as count, MAX(created_at) as last_date FROM bills WHERE (person_id = ? OR customer_phone = ?) AND status != 'Cancelled'`).get(p.id, p.mobile);
            const payRes = await db.prepare(`SELECT SUM(amount) as sum, MAX(created_at) as last_pay FROM payments WHERE person_id = ? AND type = 'in'`).get(p.id);
            p.total_sales = parseFloat(salesRes?.sum || 0);
            p.sales_count = parseInt(salesRes?.count || 0);
            p.total_paid = parseFloat(payRes?.sum || 0);
            p.due_amount = p.total_sales - p.total_paid + openBal;
            p.last_visit = salesRes?.last_date || null;
            p.last_payment_date = payRes?.last_pay || null;
        }
        return success(res, 'Record details loaded', p);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const createPerson = async (req, res) => {
    const { category = 'Customer', name, business_name, mobile, alt_mobile, email, gstin, pan, address, city, state, pincode, opening_balance = 0, credit_limit = 0, payment_terms = 'Net 30', birthday, anniversary, notes } = req.body;
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
        return error(res, 'Customer / Party Name is mandatory', 400);
    }
    const cleanMobile = (mobile || '').replace(/\D/g, '');
    if (!cleanMobile || cleanMobile.length !== 10) {
        return error(res, 'Mobile number is mandatory and must be exactly 10 numeric digits', 400);
    }
    const activeShop = req.user.active_shop_id;
    try {
        const existing = await db.prepare(`SELECT id FROM people WHERE mobile = ? AND shop_id = ? AND category = ? AND status != 'Deleted'`).get(cleanMobile, activeShop, category);
        if (existing) {
            return error(res, `${category} with mobile '${cleanMobile}' already exists`, 400);
        }
        const personId = 'prn_' + uuidv4().substring(0, 8);
        const openBalNum = parseFloat(opening_balance) || 0;
        const creditLimitNum = parseFloat(credit_limit) || 0;
        await db.prepare(`
            INSERT INTO people (
                id, shop_id, category, name, business_name, mobile, alt_mobile, email,
                gstin, pan, address, city, state, pincode, opening_balance, credit_limit,
                payment_terms, birthday, anniversary, notes, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
        `).run(personId, activeShop, category, trimmedName, business_name || null, cleanMobile, alt_mobile || null, email || null, gstin || null, pan || null, address || null, city || null, state || null, pincode || null, openBalNum, creditLimitNum, payment_terms || 'Net 30', birthday || null, anniversary || null, notes || null);
        if (openBalNum !== 0) {
            const ledgerId = 'ldg_' + uuidv4().substring(0, 8);
            await db.prepare(`
                INSERT INTO ledgers (id, shop_id, person_id, entry_type, reference_id, debit, credit, running_balance, notes)
                VALUES (?, ?, ?, 'Opening Balance', ?, ?, ?, ?, 'Initial Opening Balance')
            `).run(ledgerId, activeShop, personId, personId, openBalNum > 0 ? openBalNum : 0, openBalNum < 0 ? Math.abs(openBalNum) : 0, openBalNum);
        }
        await logAudit(activeShop, req.user.id, `Create ${category}`, `Added ${category} '${trimmedName}' (${cleanMobile})`);
        return success(res, `${category} created successfully`, { id: personId, category, name: trimmedName, mobile: cleanMobile }, 201);
    }
    catch (err) {
        return error(res, err.message || 'Failed to create record', 500);
    }
};
const updatePerson = async (req, res) => {
    const { id } = req.params;
    const { name, business_name, mobile, alt_mobile, email, gstin, pan, address, city, state, pincode, opening_balance, credit_limit, payment_terms, birthday, anniversary, loyalty_points, status, notes } = req.body;
    const activeShop = req.user.active_shop_id;
    try {
        const p = await db.prepare(`SELECT * FROM people WHERE id = ? AND shop_id = ?`).get(id, activeShop);
        if (!p) {
            return error(res, 'Record not found', 404);
        }
        let cleanMobile = p.mobile;
        if (mobile !== undefined) {
            cleanMobile = (mobile || '').replace(/\D/g, '');
            if (!cleanMobile || cleanMobile.length !== 10) {
                return error(res, 'Mobile number must be exactly 10 numeric digits', 400);
            }
        }
        let trimmedName = p.name;
        if (name !== undefined) {
            trimmedName = (name || '').trim();
            if (!trimmedName) {
                return error(res, 'Customer / Party Name cannot be empty', 400);
            }
        }
        await db.prepare(`
            UPDATE people SET
                name = ?,
                business_name = COALESCE(?, business_name),
                mobile = ?,
                alt_mobile = COALESCE(?, alt_mobile),
                email = COALESCE(?, email),
                gstin = COALESCE(?, gstin),
                pan = COALESCE(?, pan),
                address = COALESCE(?, address),
                city = COALESCE(?, city),
                state = COALESCE(?, state),
                pincode = COALESCE(?, pincode),
                opening_balance = COALESCE(?, opening_balance),
                credit_limit = COALESCE(?, credit_limit),
                payment_terms = COALESCE(?, payment_terms),
                birthday = COALESCE(?, birthday),
                anniversary = COALESCE(?, anniversary),
                loyalty_points = COALESCE(?, loyalty_points),
                status = COALESCE(?, status),
                notes = COALESCE(?, notes),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND shop_id = ?
        `).run(trimmedName, business_name, cleanMobile, alt_mobile, email, gstin, pan, address, city, state, pincode, opening_balance, credit_limit, payment_terms, birthday, anniversary, loyalty_points, status, notes, id, activeShop);
        await logAudit(activeShop, req.user.id, `Update ${p.category}`, `Updated details for ${trimmedName}`);
        return success(res, `${p.category} updated successfully`);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const deletePerson = async (req, res) => {
    const { id } = req.params;
    const activeShop = req.user.active_shop_id;
    try {
        const p = await db.prepare(`SELECT * FROM people WHERE id = ? AND shop_id = ?`).get(id, activeShop);
        if (!p) {
            return error(res, 'Record not found', 404);
        }
        await db.prepare(`UPDATE people SET status = 'Deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?`).run(id, activeShop);
        await logAudit(activeShop, req.user.id, `Delete ${p.category}`, `Soft deleted ${p.category} '${p.name}'`);
        return success(res, `${p.category} deleted successfully`);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
module.exports = {
    getPeople,
    getPersonById,
    createPerson,
    updatePerson,
    deletePerson
};
