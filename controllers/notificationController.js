const db = require('../database/init');
const { success, error } = require('../utils/response');

const getNotifications = (req, res) => {
    const shopId = req.user.active_shop_id;
    const notifications = db.prepare(`SELECT * FROM notifications WHERE shop_id = ? ORDER BY created_at DESC LIMIT 50`).all(shopId);
    return success(res, 'Notifications retrieved', notifications);
};

const markAsRead = (req, res) => {
    const { id } = req.params;
    const shopId = req.user.active_shop_id;
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND shop_id = ?`).run(id, shopId);
    return success(res, 'Notification marked as read');
};

const getAuditLogs = (req, res) => {
    const shopId = req.user.active_shop_id;
    const logs = db.prepare(`
        SELECT al.*, u.name as user_name, u.username
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.shop_id = ?
        ORDER BY al.created_at DESC
        LIMIT 100
    `).all(shopId);

    return success(res, 'Audit logs retrieved', logs);
};

module.exports = {
    getNotifications,
    markAsRead,
    getAuditLogs
};
