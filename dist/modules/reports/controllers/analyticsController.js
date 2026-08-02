"use strict";
const { db, success, error } = require('../../../shared');
const getAnalytics = async (req, res) => {
    const activeShop = req.user.active_shop_id;
    try {
        // 1. Top Customers & Parties by Revenue
        const topCustomers = await db.prepare(`
            SELECT customer_name as name, COUNT(*) as bill_count, SUM(total) as total_revenue
            FROM bills
            WHERE shop_id = ? AND customer_name IS NOT NULL
            GROUP BY customer_name
            ORDER BY total_revenue DESC
            LIMIT 5
        `).all(activeShop);
        // 2. Top Suppliers by Purchase Volume
        const topSuppliers = await db.prepare(`
            SELECT p.name, p.business_name, COUNT(pur.id) as purchase_count, SUM(pur.total) as total_purchased
            FROM purchases pur
            JOIN people p ON pur.supplier_id = p.id
            WHERE pur.shop_id = ?
            GROUP BY p.id, p.name, p.business_name
            ORDER BY total_purchased DESC
            LIMIT 5
        `).all(activeShop);
        // 3. Collection vs Payout Trends (Last 6 Months)
        const collections = await db.prepare(`
            SELECT SUM(amount) as sum, type, payment_mode
            FROM payments
            WHERE shop_id = ?
            GROUP BY type, payment_mode
        `).all(activeShop);
        // 4. Ageing Breakdown calculation
        const people = await db.prepare(`SELECT * FROM people WHERE shop_id = ? AND status != 'Deleted'`).all(activeShop);
        let bucket0_30 = 0;
        let bucket31_60 = 0;
        let bucket61_90 = 0;
        let bucket90Plus = 0;
        const now = new Date();
        for (const p of people) {
            const openBal = parseFloat(p.opening_balance || 0);
            let due = 0;
            if (p.category === 'Supplier') {
                const purchRes = await db.prepare(`SELECT SUM(total) as sum FROM purchases WHERE supplier_id = ?`).get(p.id);
                const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'out'`).get(p.id);
                due = (parseFloat(purchRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
            }
            else {
                const salesRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE person_id = ? OR customer_phone = ?`).get(p.id, p.mobile);
                const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'in'`).get(p.id);
                due = (parseFloat(salesRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
            }
            if (due > 0) {
                const daysOld = Math.floor((now - new Date(p.created_at)) / (1000 * 60 * 60 * 24));
                if (daysOld <= 30)
                    bucket0_30 += due;
                else if (daysOld <= 60)
                    bucket31_60 += due;
                else if (daysOld <= 90)
                    bucket61_90 += due;
                else
                    bucket90Plus += due;
            }
        }
        return success(res, 'Analytics trends loaded', {
            topCustomers,
            topSuppliers,
            collections,
            ageingBuckets: {
                bucket0_30,
                bucket31_60,
                bucket61_90,
                bucket90Plus
            }
        });
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
module.exports = { getAnalytics };
