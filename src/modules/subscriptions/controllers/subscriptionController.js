const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');

const getSubscriptions = async (req, res) => {
    try {
        const callerRole = req.user.role;
        const callerOrgId = req.user.organization_id;

        if (!['Admin', 'Owner'].includes(callerRole)) {
            return error(res, 'Unauthorized to view subscription management records', 403);
        }

        const {
            search = '',
            organization_id = '',
            branch_id = '',
            plan_id = '',
            payment_status = '',
            payment_mode = '',
            status = ''
        } = req.query;

        let sql = `
            SELECT sub.*, o.name as organization_name, o.owner_name, s.shop_name as branch_name, s.shop_code as branch_code
            FROM subscriptions sub
            LEFT JOIN organizations o ON sub.organization_id = o.id
            LEFT JOIN shops s ON sub.branch_id = s.id
            WHERE 1=1
        `;
        const params = [];

        // Scoping by Caller Role
        if (callerRole === 'Owner') {
            sql += ` AND sub.organization_id = ?`;
            params.push(callerOrgId);
        }

        if (organization_id) {
            sql += ` AND sub.organization_id = ?`;
            params.push(organization_id);
        }

        if (branch_id) {
            sql += ` AND sub.branch_id = ?`;
            params.push(branch_id);
        }

        if (plan_id) {
            sql += ` AND sub.plan_id = ?`;
            params.push(plan_id);
        }

        if (payment_status) {
            sql += ` AND sub.payment_status = ?`;
            params.push(payment_status);
        }

        if (payment_mode) {
            sql += ` AND sub.payment_mode = ?`;
            params.push(payment_mode);
        }

        if (search) {
            sql += ` AND (LOWER(o.name) LIKE ? OR LOWER(s.shop_name) LIKE ? OR LOWER(o.owner_name) LIKE ? OR LOWER(sub.subscription_id) LIKE ? OR LOWER(sub.id) LIKE ?)`;
            const s = `%${search.toLowerCase()}%`;
            params.push(s, s, s, s, s);
        }

        sql += ` ORDER BY sub.created_at DESC`;

        let list = await db.prepare(sql).all(params);
        const now = new Date();

        list = list.map(sub => {
            const expiry = sub.expiry_date ? new Date(sub.expiry_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            const diffTime = expiry.getTime() - now.getTime();
            const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let currentStatus = 'Active';
            if (daysRemaining <= 0) {
                currentStatus = 'Expired';
            } else if (daysRemaining <= 10) {
                currentStatus = 'Expiring Soon';
            }

            return {
                ...sub,
                days_remaining: daysRemaining,
                calculated_status: currentStatus
            };
        });

        if (status) {
            if (status === 'Active') {
                list = list.filter(sub => sub.days_remaining > 10);
            } else if (status === 'Expiring Soon') {
                list = list.filter(sub => sub.days_remaining > 0 && sub.days_remaining <= 10);
            } else if (status === 'Expired') {
                list = list.filter(sub => sub.days_remaining <= 0);
            } else if (status === 'Renewal Due') {
                list = list.filter(sub => sub.payment_status === 'Unpaid' || sub.days_remaining <= 10);
            }
        }

        return success(res, 'Subscriptions retrieved successfully', list);
    } catch (err) {
        return error(res, err.message || 'Failed to retrieve subscriptions', 500);
    }
};

const getSubscriptionStats = async (req, res) => {
    try {
        const callerRole = req.user.role;
        const callerOrgId = req.user.organization_id;

        if (!['Admin', 'Owner'].includes(callerRole)) {
            return error(res, 'Unauthorized to view subscription metrics', 403);
        }

        let orgFilter = '';
        const params = [];
        if (callerRole === 'Owner') {
            orgFilter = ` WHERE organization_id = ?`;
            params.push(callerOrgId);
        }

        const allSubs = await db.prepare(`SELECT * FROM subscriptions ${orgFilter}`).all(params);
        const orgs = await db.prepare(`SELECT COUNT(*) as cnt FROM organizations ${callerRole === 'Owner' ? 'WHERE id = ?' : ''}`).get(callerRole === 'Owner' ? [callerOrgId] : []);
        const branches = await db.prepare(`SELECT COUNT(*) as cnt FROM shops WHERE status != 'deleted' ${callerRole === 'Owner' ? 'AND organization_id = ?' : ''}`).get(callerRole === 'Owner' ? [callerOrgId] : []);

        const now = new Date();
        let activeCount = 0;
        let expiredCount = 0;
        let expiringSoonCount = 0;
        let pendingPaymentsCount = 0;
        let renewalsDueCount = 0;
        let monthlyRev = 0;

        allSubs.forEach(sub => {
            const expiry = sub.expiry_date ? new Date(sub.expiry_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            const diffTime = expiry.getTime() - now.getTime();
            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (days <= 0) {
                expiredCount++;
            } else if (days <= 10) {
                expiringSoonCount++;
                activeCount++;
            } else {
                activeCount++;
            }

            if (sub.payment_status === 'Unpaid') {
                pendingPaymentsCount++;
            }

            if (days <= 10 || sub.payment_status === 'Unpaid') {
                renewalsDueCount++;
            }

            if (sub.payment_status === 'Paid') {
                monthlyRev += parseFloat(sub.subscription_amount || 999);
            }
        });

        return success(res, 'Subscription stats retrieved', {
            totalOrganizations: orgs ? (orgs.cnt || 0) : 0,
            totalBranches: branches ? (branches.cnt || 0) : 0,
            activeSubscriptions: activeCount,
            expiredSubscriptions: expiredCount,
            expiringSoonSubscriptions: expiringSoonCount,
            pendingPayments: pendingPaymentsCount,
            renewalsDue: renewalsDueCount,
            monthlyRevenue: monthlyRev
        });
    } catch (err) {
        return error(res, err.message || 'Failed to calculate subscription stats', 500);
    }
};

const getSubscriptionById = async (req, res) => {
    try {
        const { id } = req.params;
        const sub = await db.prepare(`
            SELECT sub.*, o.name as organization_name, o.owner_name, s.shop_name as branch_name, s.shop_code as branch_code
            FROM subscriptions sub
            LEFT JOIN organizations o ON sub.organization_id = o.id
            LEFT JOIN shops s ON sub.branch_id = s.id
            WHERE sub.id = ? OR sub.subscription_id = ?
        `).get(id, id);

        if (!sub) {
            return error(res, 'Subscription record not found', 404);
        }

        if (req.user.role === 'Owner' && sub.organization_id !== req.user.organization_id) {
            return error(res, 'Unauthorized access to target subscription', 403);
        }

        return success(res, 'Subscription retrieved', sub);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const updatePaymentStatus = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return error(res, 'Only Super Admin can update payment status', 403);
        }

        const { id } = req.params;
        const { payment_status } = req.body;

        if (!['Paid', 'Unpaid'].includes(payment_status)) {
            return error(res, "Payment status must be 'Paid' or 'Unpaid'", 400);
        }

        const sub = await db.prepare(`SELECT * FROM subscriptions WHERE id = ? OR subscription_id = ?`).get(id, id);
        if (!sub) {
            return error(res, 'Subscription not found', 404);
        }

        await db.prepare(`
            UPDATE subscriptions SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(payment_status, sub.id);

        // Also sync status with organization table if applicable
        await db.prepare(`
            UPDATE organizations SET subscription_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(payment_status === 'Paid' ? 'Active' : 'Payment Pending', sub.organization_id).catch(() => {});

        return success(res, `Payment status updated to ${payment_status} for subscription ${sub.subscription_id}`, {
            id: sub.id,
            subscription_id: sub.subscription_id,
            payment_status
        });
    } catch (err) {
        return error(res, err.message || 'Failed to update payment status', 500);
    }
};

const updatePaymentMode = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return error(res, 'Only Super Admin can update payment mode', 403);
        }

        const { id } = req.params;
        const { payment_mode } = req.body;

        if (!payment_mode) {
            return error(res, 'Payment mode is required', 400);
        }

        const sub = await db.prepare(`SELECT * FROM subscriptions WHERE id = ? OR subscription_id = ?`).get(id, id);
        if (!sub) {
            return error(res, 'Subscription not found', 404);
        }

        await db.prepare(`
            UPDATE subscriptions SET payment_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(payment_mode, sub.id);

        return success(res, `Payment mode updated to ${payment_mode}`, {
            id: sub.id,
            payment_mode
        });
    } catch (err) {
        return error(res, err.message || 'Failed to update payment mode', 500);
    }
};

const renewSubscription = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return error(res, 'Only Super Admin can renew subscriptions', 403);
        }

        const { id } = req.params;
        const { plan_id = 'monthly', payment_mode = 'Cash' } = req.body;

        const sub = await db.prepare(`SELECT * FROM subscriptions WHERE id = ? OR subscription_id = ?`).get(id, id);
        if (!sub) {
            return error(res, 'Subscription not found', 404);
        }

        let daysToAdd = 30;
        let planName = 'Monthly Plan';
        let amount = 999;

        if (plan_id === 'quarterly') {
            daysToAdd = 90;
            planName = 'Quarterly Plan';
            amount = 2699;
        } else if (plan_id === 'half_yearly') {
            daysToAdd = 180;
            planName = 'Half-Yearly Plan';
            amount = 4999;
        } else if (plan_id === 'yearly') {
            daysToAdd = 365;
            planName = 'Yearly Plan';
            amount = 8999;
        }

        const now = new Date();
        const newStart = now.toISOString();
        const newExpiry = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

        await db.prepare(`
            UPDATE subscriptions SET
                plan_id = ?,
                plan_name = ?,
                subscription_amount = ?,
                payment_status = 'Paid',
                payment_mode = ?,
                subscription_start = ?,
                renewal_date = ?,
                expiry_date = ?,
                status = 'Active',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(plan_id, planName, amount, payment_mode, newStart, newExpiry, newExpiry, sub.id);

        await db.prepare(`
            UPDATE organizations SET subscription_status = 'Active', subscription_expiry = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(newExpiry, sub.organization_id).catch(() => {});

        return success(res, `Subscription ${sub.subscription_id} renewed successfully for ${planName}`, {
            id: sub.id,
            subscription_id: sub.subscription_id,
            plan_id,
            plan_name: planName,
            expiry_date: newExpiry,
            payment_status: 'Paid'
        });
    } catch (err) {
        return error(res, err.message || 'Failed to renew subscription', 500);
    }
};

const extendExpiryDate = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return error(res, 'Only Super Admin can extend subscription expiry', 403);
        }

        const { id } = req.params;
        const { days = 30 } = req.body;

        const sub = await db.prepare(`SELECT * FROM subscriptions WHERE id = ? OR subscription_id = ?`).get(id, id);
        if (!sub) {
            return error(res, 'Subscription not found', 404);
        }

        const currentExpiry = sub.expiry_date ? new Date(sub.expiry_date).getTime() : Date.now();
        const newExpiry = new Date(Math.max(Date.now(), currentExpiry) + parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

        await db.prepare(`
            UPDATE subscriptions SET
                expiry_date = ?,
                renewal_date = ?,
                status = 'Active',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(newExpiry, newExpiry, sub.id);

        return success(res, `Extended expiry by ${days} days`, {
            id: sub.id,
            expiry_date: newExpiry
        });
    } catch (err) {
        return error(res, err.message || 'Failed to extend expiry date', 500);
    }
};

const changePlan = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return error(res, 'Only Super Admin can change plans', 403);
        }

        const { id } = req.params;
        const { plan_id, plan_name, subscription_amount } = req.body;

        const sub = await db.prepare(`SELECT * FROM subscriptions WHERE id = ? OR subscription_id = ?`).get(id, id);
        if (!sub) {
            return error(res, 'Subscription not found', 404);
        }

        await db.prepare(`
            UPDATE subscriptions SET
                plan_id = COALESCE(?, plan_id),
                plan_name = COALESCE(?, plan_name),
                subscription_amount = COALESCE(?, subscription_amount),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(plan_id, plan_name, subscription_amount, sub.id);

        return success(res, 'Subscription plan updated successfully');
    } catch (err) {
        return error(res, err.message || 'Failed to update subscription plan', 500);
    }
};

module.exports = {
    getSubscriptions,
    getSubscriptionStats,
    getSubscriptionById,
    updatePaymentStatus,
    updatePaymentMode,
    renewSubscription,
    extendExpiryDate,
    changePlan
};
