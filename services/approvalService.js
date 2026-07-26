const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('./auditService');

/**
 * Execute an approved action payload (Branch Creation, User Creation, User Edit, User Delete)
 */
const executeApprovalPayload = async (approval) => {
    try {
        const payload = JSON.parse(approval.payload || '{}');

        if (approval.type === 'branch_create') {
            const { shopId, shopName, name, shopCode, ownerId, address, phone, gst, currency, taxRate, logo } = payload;

            const existing = await db.prepare('SELECT id FROM shops WHERE id = ?').get(shopId);
            if (existing) {
                await db.prepare("UPDATE shops SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(shopId);
            } else {
                await db.prepare(`
                    INSERT INTO shops (id, shop_name, name, shop_code, owner_id, address, phone, gst, currency, tax_rate, logo, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
                `).run(shopId || ('shp_' + uuidv4().substring(0, 8)), shopName || name, name || shopName, shopCode, ownerId || approval.requester_id, address || null, phone || null, gst || null, currency || '₹', taxRate || 0, logo || 'logo.png');
            }
            await logAudit(shopId, approval.requester_id, 'Approve Branch', `Branch '${shopName || name}' approved and activated.`);
        }

        else if (approval.type === 'user_create') {
            const { userId, name, username, email, password_hash, role, shop_id, permissions, phone } = payload;
            const existing = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
            if (existing) {
                await db.prepare("UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
            } else {
                await db.prepare(`
                    INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, permissions, status, phone)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
                `).run(userId, name, username, email || null, password_hash, password_hash, role || 'Staff', shop_id, typeof permissions === 'string' ? permissions : JSON.stringify(permissions || []), phone || null);
            }
            await logAudit(shop_id, approval.requester_id, 'Approve User Create', `User '${username}' created and activated.`);
        }

        else if (approval.type === 'user_edit') {
            const { userId, name, email, role, permissions, status, phone } = payload;
            const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
            if (user) {
                let permsJson = user.permissions;
                if (permissions !== undefined) {
                    permsJson = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);
                }
                await db.prepare(`
                    UPDATE users SET
                        name = COALESCE(?, name),
                        email = COALESCE(?, email),
                        role = COALESCE(?, role),
                        permissions = ?,
                        status = COALESCE(?, status),
                        phone = COALESCE(?, phone),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(name, email, role, permsJson, status, phone, userId);
                await logAudit(user.shop_id, approval.requester_id, 'Approve User Edit', `User '${user.username}' profile/role changes approved.`);
            }
        }

        else if (approval.type === 'user_delete') {
            const { userId } = payload;
            const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
            if (user) {
                await db.prepare("DELETE FROM users WHERE id = ?").run(userId);
                await logAudit(user.shop_id, approval.requester_id, 'Approve User Delete', `User '${user.username}' account permanently deleted.`);
            }
        }

        // Mark approval as processed & approved
        await db.prepare(`
            UPDATE approvals SET status = 'approved', processed_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(approval.id);

        return true;
    } catch (err) {
        console.error(`Failed to execute approval ${approval.id}:`, err);
        return false;
    }
};

/**
 * Process all pending approvals whose auto_approve_at timestamp has passed (8 hours limit)
 */
const processPendingAutoApprovals = async () => {
    try {
        const pending = await db.prepare("SELECT * FROM approvals WHERE status = 'pending'").all();
        const now = new Date();

        for (const app of pending) {
            const autoTime = new Date(app.auto_approve_at);
            if (autoTime <= now) {
                console.log(`⚡ Auto-approving request #${app.id} (${app.title}) after 8 hours timeout.`);
                await executeApprovalPayload(app);
            }
        }
    } catch (e) {
        console.error('Error processing auto approvals:', e.message);
    }
};

module.exports = {
    executeApprovalPayload,
    processPendingAutoApprovals
};
