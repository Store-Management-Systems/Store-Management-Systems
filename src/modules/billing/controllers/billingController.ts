import { Request, Response } from 'express';
import { db, success, error } from '../../../shared';
import { getPgPool } from '../../../shared/database/pgInit';

export const createBill = async (req: Request, res: Response) => {
    try {
        const { items, customer_name, customer_phone, discount, discount_type, payment_mode, paid_amount } = req.body;
        const shopId = (req as any).user.active_shop_id || (req as any).user.shop_id;
        const orgId = (req as any).user.organization_id;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return error(res, 'At least one item is required to generate a bill', 400);
        }

        const shop = await db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId);
        const taxRate = shop ? (parseFloat(shop.tax_rate) || 0) : 0;

        let subtotal = 0;
        for (const item of items) {
            subtotal += (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1);
        }

        let tax_amount = 0;
        let discount_amount = 0;
        let grand_total = 0;

        // Use PL/pgSQL Function if connected to Neon PostgreSQL
        const pgPool = getPgPool();
        if (pgPool) {
            try {
                const pgRes = await pgPool.query(
                    'SELECT * FROM fn_calculate_bill_totals($1, $2, $3, $4)',
                    [subtotal, taxRate, parseFloat(discount) || 0, discount_type || 'rupees']
                );
                if (pgRes.rows && pgRes.rows[0]) {
                    tax_amount = parseFloat(pgRes.rows[0].tax_amount) || 0;
                    discount_amount = parseFloat(pgRes.rows[0].discount_amount) || 0;
                    grand_total = parseFloat(pgRes.rows[0].grand_total) || 0;
                }
            } catch (pgErr) {
                discount_amount = discount_type === 'percent' ? (subtotal * (parseFloat(discount) || 0)) / 100 : (parseFloat(discount) || 0);
                tax_amount = ((subtotal - discount_amount) * taxRate) / 100;
                grand_total = Math.max(0, subtotal - discount_amount + tax_amount);
            }
        } else {
            discount_amount = discount_type === 'percent' ? (subtotal * (parseFloat(discount) || 0)) / 100 : (parseFloat(discount) || 0);
            tax_amount = ((subtotal - discount_amount) * taxRate) / 100;
            grand_total = Math.max(0, subtotal - discount_amount + tax_amount);
        }

        const billId = 'bill_' + Date.now();
        const billNumber = 'INV-' + Math.floor(100000 + Math.random() * 900000);

        await db.prepare(`
            INSERT INTO bills (id, shop_id, organization_id, bill_number, customer_name, customer_phone, subtotal, tax_amount, discount_amount, discount_type, grand_total, payment_mode, paid_amount, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(billId, shopId, orgId, billNumber, customer_name || 'Walk-in Customer', customer_phone || null, subtotal, tax_amount, discount_amount, discount_type || 'rupees', grand_total, payment_mode || 'Cash', paid_amount !== undefined ? paid_amount : grand_total, 'completed');

        for (const item of items) {
            const billItemId = 'bi_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const itemTotal = (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1);
            await db.prepare(`
                INSERT INTO bill_items (id, bill_id, item_id, item_name, price, quantity, total, unit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(billItemId, billId, item.item_id || item.id, item.name || item.item_name, item.price, item.quantity, itemTotal, item.unit || 'Pcs');

            if (!db.isPg && (item.item_id || item.id)) {
                await db.prepare('UPDATE items SET stock = MAX(0, stock - ?) WHERE id = ?').run(parseInt(item.quantity) || 1, item.item_id || item.id);
            }
        }

        const createdBill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
        const createdItems = await db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(billId);
        createdBill.items = createdItems;

        return success(res, 'Bill generated successfully', createdBill, 201);
    } catch (err: any) {
        return error(res, err.message || 'Failed to create bill', 500);
    }
};

export const getBills = async (req: Request, res: Response) => {
    try {
        const shopId = (req as any).user.active_shop_id || (req as any).user.shop_id;
        const bills = await db.prepare('SELECT * FROM bills WHERE shop_id = ? ORDER BY created_at DESC LIMIT 100').all(shopId);

        for (const b of bills) {
            b.items = await db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(b.id);
        }

        return success(res, 'Bills retrieved successfully', bills);
    } catch (err: any) {
        return error(res, err.message || 'Failed to retrieve bills', 500);
    }
};
