const db = require('../database/init');
const { success, error } = require('../utils/response');

const getDashboardStats = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;

        // Revenue Stats
        const totalRevRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ? AND status != 'Cancelled'`).get(targetShop);
        const todayRevRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ? AND status != 'Cancelled' AND created_at >= CURRENT_DATE`).get(targetShop);
        const monthRevRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ? AND status != 'Cancelled' AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`).get(targetShop);

        // Bill Count Stats
        const totalBillsRes = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ?`).get(targetShop);
        const todayBillsRes = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ? AND created_at >= CURRENT_DATE`).get(targetShop);

        // Item & Inventory Stats
        const shopSettings = await db.prepare(`SELECT low_stock_alert FROM settings WHERE shop_id = ?`).get(targetShop);
        const threshold = shopSettings ? (shopSettings.low_stock_alert || 5) : 5;

        const totalItemsRes = await db.prepare(`SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND status = 'active'`).get(targetShop);
        const lowStockItems = await db.prepare(`SELECT id, name, stock, unit, category FROM items WHERE shop_id = ? AND status = 'active' AND stock <= ? ORDER BY stock ASC`).all(targetShop, threshold);

        // Recent 5 Bills
        const recentBills = await db.prepare(`SELECT * FROM bills WHERE shop_id = ? ORDER BY created_at DESC LIMIT 5`).all(targetShop);

        return success(res, 'Dashboard statistics loaded', {
            revenue: {
                total: parseFloat(totalRevRes?.sum || 0),
                today: parseFloat(todayRevRes?.sum || 0),
                monthly: parseFloat(monthRevRes?.sum || 0)
            },
            bills: {
                total: parseInt(totalBillsRes?.count || 0),
                today: parseInt(todayBillsRes?.count || 0)
            },
            items: {
                total: parseInt(totalItemsRes?.count || 0),
                lowStockCount: lowStockItems.length,
                lowStockItems
            },
            recentBills
        });
    } catch (err) {
        return error(res, err.message || 'Failed to load dashboard stats', 500);
    }
};

module.exports = {
    getDashboardStats
};
