const db = require('../database/init');
const { success, error } = require('../utils/response');

const getDashboardStats = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;

        // 1. Items Summary
        const totalItemsRes = await db.prepare(`SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND status = 'active'`).get(targetShop);
        const lowStockRes = await db.prepare(`SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND status = 'active' AND stock <= 5`).get(targetShop);
        const lowStockItems = await db.prepare(`SELECT id, name, stock, unit, category FROM items WHERE shop_id = ? AND status = 'active' AND stock <= 5 LIMIT 10`).all(targetShop);

        // 2. Revenue & Sales Metrics
        const todayRevRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ? AND created_at >= CURRENT_DATE`).get(targetShop);
        const totalRevRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ?`).get(targetShop);
        const todayBillsRes = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ? AND created_at >= CURRENT_DATE`).get(targetShop);

        // 3. Recent Bills
        const recentBills = await db.prepare(`SELECT * FROM bills WHERE shop_id = ? ORDER BY created_at DESC LIMIT 5`).all(targetShop);

        // 4. People & B2B/B2C Outstanding Calculations
        const people = await db.prepare(`SELECT * FROM people WHERE shop_id = ? AND status != 'Deleted'`).all(targetShop);

        let customerCount = 0;
        let customerActiveCount = 0;
        let customerOutstanding = 0;

        let partyCount = 0;
        let partyReceivable = 0;
        let partyOverdue = 0;

        let supplierCount = 0;
        let supplierPayable = 0;
        let supplierOverdue = 0;

        for (const p of people) {
            const openBal = parseFloat(p.opening_balance || 0);

            if (p.category === 'Supplier') {
                supplierCount++;
                const purchRes = await db.prepare(`SELECT SUM(total) as sum FROM purchases WHERE supplier_id = ?`).get(p.id);
                const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'out'`).get(p.id);
                const due = (parseFloat(purchRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
                if (due > 0) {
                    supplierPayable += due;
                    supplierOverdue += due;
                }
            } else if (p.category === 'Party') {
                partyCount++;
                const salesRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE person_id = ? OR customer_phone = ?`).get(p.id, p.mobile);
                const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'in'`).get(p.id);
                const due = (parseFloat(salesRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
                if (due > 0) {
                    partyReceivable += due;
                    partyOverdue += due;
                }
            } else {
                customerCount++;
                if (p.status === 'Active') customerActiveCount++;
                const salesRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE person_id = ? OR customer_phone = ?`).get(p.id, p.mobile);
                const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'in'`).get(p.id);
                const due = (parseFloat(salesRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
                if (due > 0) customerOutstanding += due;
            }
        }

        // 5. Today's Collections & Payments
        const todayCollectionsRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE shop_id = ? AND type = 'in' AND created_at >= CURRENT_DATE`).get(targetShop);
        const todayPaymentsRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE shop_id = ? AND type = 'out' AND created_at >= CURRENT_DATE`).get(targetShop);

        const totalReceivable = customerOutstanding + partyReceivable;
        const totalPayable = supplierPayable;
        const netOutstanding = totalReceivable - totalPayable;

        return success(res, 'Dashboard statistics loaded', {
            items: {
                total: parseInt(totalItemsRes?.count || 0),
                lowStockCount: parseInt(lowStockRes?.count || 0),
                lowStockItems: lowStockItems || []
            },
            revenue: {
                today: parseFloat(todayRevRes?.sum || 0),
                total: parseFloat(totalRevRes?.sum || 0)
            },
            bills: {
                today: parseInt(todayBillsRes?.count || 0)
            },
            recentBills: recentBills || [],
            customersWidget: {
                total: customerCount,
                active: customerActiveCount,
                outstanding: customerOutstanding
            },
            partiesWidget: {
                total: partyCount,
                receivable: partyReceivable,
                overdue: partyOverdue
            },
            suppliersWidget: {
                total: supplierCount,
                payable: supplierPayable,
                overdue: supplierOverdue
            },
            financeWidget: {
                totalReceivable,
                totalPayable,
                netOutstanding,
                todayCollections: parseFloat(todayCollectionsRes?.sum || 0),
                todayPayments: parseFloat(todayPaymentsRes?.sum || 0)
            }
        });

    } catch (err) {
        return error(res, err.message || 'Failed to load dashboard metrics', 500);
    }
};

module.exports = { getDashboardStats };
