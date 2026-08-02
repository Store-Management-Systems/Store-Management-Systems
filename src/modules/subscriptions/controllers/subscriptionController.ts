import { Request, Response } from 'express';
import { db, success, error } from '../../../shared';
import { getPgPool } from '../../../shared/database/pgInit';

export const getSubscriptions = async (req: Request, res: Response) => {
    try {
        const { organization_id, status, payment_status, search } = req.query;
        let query = `
            SELECT s.*,
                   o.name as organization_name,
                   o.owner_id,
                   u.name as owner_name,
                   sh.shop_name as branch_name,
                   sh.shop_code as branch_code
            FROM subscriptions s
            LEFT JOIN organizations o ON s.organization_id = o.id
            LEFT JOIN users u ON o.owner_id = u.id
            LEFT JOIN shops sh ON s.branch_id = sh.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (organization_id) {
            query += ` AND s.organization_id = ?`;
            params.push(organization_id);
        }
        if (status && status !== 'All') {
            query += ` AND s.status = ?`;
            params.push(status);
        }
        if (payment_status && payment_status !== 'All') {
            query += ` AND s.payment_status = ?`;
            params.push(payment_status);
        }
        if (search) {
            query += ` AND (LOWER(o.name) LIKE ? OR LOWER(sh.shop_name) LIKE ? OR LOWER(s.subscription_id) LIKE ?)`;
            const term = `%${String(search).toLowerCase()}%`;
            params.push(term, term, term);
        }

        query += ` ORDER BY s.created_at DESC`;
        const rows = await db.prepare(query).all(...params);

        const now = new Date();
        const processed = rows.map((r: any) => {
            const exp = r.expiry_date ? new Date(r.expiry_date) : new Date();
            const diffTime = exp.getTime() - now.getTime();
            const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let calcStatus = 'Active';
            if (daysLeft < 0) calcStatus = 'Expired';
            else if (daysLeft <= 7) calcStatus = 'Expiring Soon';

            return {
                ...r,
                days_remaining: daysLeft,
                calculated_status: calcStatus
            };
        });

        return success(res, 'Subscriptions retrieved successfully', processed);
    } catch (err: any) {
        return error(res, err.message || 'Failed to retrieve subscriptions', 500);
    }
};

export const renewSubscription = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { days } = req.body;
        const extensionDays = parseInt(days) || 30;

        let newExpiryDate: Date;

        const pgPool = getPgPool();
        if (pgPool) {
            try {
                const pgRes = await pgPool.query('SELECT fn_renew_subscription($1, $2) as new_expiry', [id, extensionDays]);
                newExpiryDate = new Date(pgRes.rows[0].new_expiry);
            } catch (e) {
                const sub = await db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
                if (!sub) return error(res, 'Subscription record not found', 404);
                const currentExpiry = sub.expiry_date ? new Date(sub.expiry_date) : new Date();
                newExpiryDate = currentExpiry > new Date() ? new Date(currentExpiry.getTime() + extensionDays * 24 * 60 * 60 * 1000) : new Date(Date.now() + extensionDays * 24 * 60 * 60 * 1000);
                await db.prepare(`UPDATE subscriptions SET expiry_date = ?, renewal_date = CURRENT_TIMESTAMP, payment_status = 'Paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newExpiryDate.toISOString(), id);
            }
        } else {
            const sub = await db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
            if (!sub) return error(res, 'Subscription record not found', 404);
            const currentExpiry = sub.expiry_date ? new Date(sub.expiry_date) : new Date();
            newExpiryDate = currentExpiry > new Date() ? new Date(currentExpiry.getTime() + extensionDays * 24 * 60 * 60 * 1000) : new Date(Date.now() + extensionDays * 24 * 60 * 60 * 1000);
            await db.prepare(`UPDATE subscriptions SET expiry_date = ?, renewal_date = CURRENT_TIMESTAMP, payment_status = 'Paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newExpiryDate.toISOString(), id);
        }

        const updated = await db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
        return success(res, `Subscription renewed by ${extensionDays} days`, updated);
    } catch (err: any) {
        return error(res, err.message || 'Failed to renew subscription', 500);
    }
};

export const updatePaymentStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { payment_status } = req.body;

        await db.prepare(`UPDATE subscriptions SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(payment_status, id);
        const updated = await db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);

        return success(res, `Subscription payment status updated to ${payment_status}`, updated);
    } catch (err: any) {
        return error(res, err.message, 500);
    }
};

export const updatePaymentMode = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { payment_mode } = req.body;

        await db.prepare(`UPDATE subscriptions SET payment_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(payment_mode, id);
        const updated = await db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);

        return success(res, `Payment mode updated to ${payment_mode}`, updated);
    } catch (err: any) {
        return error(res, err.message, 500);
    }
};
