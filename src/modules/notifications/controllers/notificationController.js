const { db, success, error } = require('../../../shared');

const getNotifications = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        const notes = await db.prepare(`SELECT * FROM notifications WHERE shop_id = ? ORDER BY created_at DESC LIMIT 50`).all(targetShop);
        return success(res, 'Notifications retrieved', notes);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const markAsRead = async (req, res) => {
    const { id } = req.params;
    try {
        await db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(id);
        return success(res, 'Notification marked as read');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const getAuditLogs = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        const logs = await db.prepare(`
            SELECT a.*, u.username, u.name as user_name
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.shop_id = ?
            ORDER BY a.created_at DESC LIMIT 100
        `).all(targetShop);
        return success(res, 'Audit logs retrieved', logs);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = { getNotifications, markAsRead, getAuditLogs };
