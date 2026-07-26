const db = require('../database/init');
const { success, error } = require('../utils/response');

const getDashboardStats = (req, res) => {
    const shopId = req.user.active_shop_id;
    const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(shopId) || {};
    const lowStockAlert = shop.low_stock_alert || 5;

    // Today & Month date formatting
    const todayStr = new Date().toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7);

    // Revenue & Bills Aggregates
    const revenueAgg = db.prepare(`
        SELECT
            COALESCE(SUM(total), 0) as totalRevenue,
            COALESCE(SUM(CASE WHEN date(created_at) = date(?) THEN total ELSE 0 END), 0) as todayRevenue,
            COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at) = ? THEN total ELSE 0 END), 0) as monthlyRevenue,
            COUNT(*) as totalBills,
            COALESCE(SUM(CASE WHEN date(created_at) = date(?) THEN 1 ELSE 0 END), 0) as todayBills
        FROM bills
        WHERE shop_id = ?
    `).get(todayStr, monthStr, todayStr, shopId);

    // Items Stats
    const totalItems = db.prepare(`SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND status = 'active'`).get(shopId).count;
    const lowStockItems = db.prepare(`SELECT * FROM items WHERE shop_id = ? AND status = 'active' AND stock <= ? ORDER BY stock ASC`).all(shopId, lowStockAlert);

    // Top Selling Items
    const topSellingItems = db.prepare(`
        SELECT bi.item_id, bi.name, SUM(bi.qty) as total_qty, SUM(bi.total) as total_revenue
        FROM bill_items bi
        JOIN bills b ON bi.bill_id = b.id
        WHERE b.shop_id = ?
        GROUP BY bi.item_id, bi.name
        ORDER BY total_qty DESC
        LIMIT 5
    `).all(shopId);

    // Recent Bills
    const recentBills = db.prepare(`SELECT * FROM bills WHERE shop_id = ? ORDER BY created_at DESC LIMIT 5`).all(shopId);
    recentBills.forEach(b => {
        b.billNo = b.bill_number;
        b.customerName = b.customer_name;
        b.customerPhone = b.customer_phone;
        b.date = b.created_at;
    });

    // Customers count
    const totalCustomers = db.prepare(`SELECT COUNT(*) as count FROM customers WHERE shop_id = ?`).get(shopId).count;

    let adminMetrics = {};
    if (req.user.role === 'Admin') {
        const totalShops = db.prepare(`SELECT COUNT(*) as count FROM shops WHERE status = 'active'`).get().count;
        const totalOwners = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'Owner' AND status = 'active'`).get().count;
        const totalStaff = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role IN ('Staff', 'Cashier', 'Manager') AND status = 'active'`).get().count;
        adminMetrics = { totalShops, totalOwners, totalStaff };
    }

    return success(res, 'Dashboard analytics retrieved', {
        shop: {
            id: shop.id,
            name: shop.shop_name,
            code: shop.shop_code,
            currency: shop.currency || '₹',
            lowStockAlert: lowStockAlert
        },
        revenue: {
            total: revenueAgg.totalRevenue,
            today: revenueAgg.todayRevenue,
            monthly: revenueAgg.monthlyRevenue
        },
        bills: {
            total: revenueAgg.totalBills,
            today: revenueAgg.todayBills
        },
        items: {
            total: totalItems,
            lowStockCount: lowStockItems.length,
            lowStockItems: lowStockItems
        },
        topSellingItems,
        recentBills,
        totalCustomers,
        ...adminMetrics
    });
};

module.exports = {
    getDashboardStats
};
