const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');

const logAudit = (shop_id, user_id, action, details) => {
    try {
        const id = 'log_' + uuidv4().substring(0, 8);
        db.prepare(`
            INSERT INTO audit_logs (id, shop_id, user_id, action, details)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, shop_id || 'shop_default_hq', user_id || null, action, typeof details === 'object' ? JSON.stringify(details) : details);
    } catch (err) {
        console.error('Audit Log Error:', err.message);
    }
};

module.exports = { logAudit };
