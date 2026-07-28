const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../../notifications/services/auditService');

const getShops = async (req, res) => {
    try {
        let shops = [];
        if (req.user.role === 'Admin') {
            shops = await db.prepare(`SELECT * FROM shops WHERE status != 'deleted' ORDER BY created_at DESC`).all();
        } else if (req.user.role === 'Owner') {
            const orgId = req.user.organization_id || '';
            shops = await db.prepare(`SELECT * FROM shops WHERE (organization_id = ? OR owner_id = ? OR id = ?) AND status != 'deleted' ORDER BY created_at DESC`).all(orgId, req.user.id, req.user.shop_id);
        } else {
            shops = await db.prepare(`SELECT * FROM shops WHERE id = ? AND status != 'deleted'`).all(req.user.shop_id);
        }
        return success(res, 'Shops retrieved', shops);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const getShopById = async (req, res) => {
    try {
        const { id } = req.params;
        const shop = await db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
        if (!shop) {
            return error(res, 'Shop branch not found', 404);
        }

        // Data isolation check: Non-Admin can only access branches of their own organization
        if (req.user.role !== 'Admin') {
            const userOrgId = req.user.organization_id;
            if (shop.organization_id && userOrgId && shop.organization_id !== userOrgId && shop.owner_id !== req.user.id && shop.id !== req.user.shop_id) {
                return error(res, 'Unauthorized access to shop branch', 403);
            }
        }

        return success(res, 'Shop details retrieved', shop);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const createShop = async (req, res) => {
    const {
        shop_name,
        shop_code,
        organization_id,
        address,
        phone,
        email,
        gst,
        fssai,
        manager,
        opening_date,
        currency = '₹',
        tax_rate = 0,
        logo = null,
        low_stock_alert = 5,
        owner_name,
        owner_username,
        owner_password
    } = req.body;

    if (!shop_name || !shop_code) {
        return error(res, 'Shop name and shop code are required', 400);
    }

    try {
        const existingCode = await db.prepare(`SELECT id FROM shops WHERE shop_code = ?`).get(shop_code);
        if (existingCode) {
            return error(res, 'Shop code already exists', 400);
        }

        const isSuperAdmin = req.user.role === 'Admin';
        const isOwner = req.user.role === 'Owner';

        const shopId = 'shp_' + uuidv4().substring(0, 8);
        const ownerId = isSuperAdmin ? (req.user.id) : (isOwner ? req.user.id : req.user.id);
        
        let targetOrgId = organization_id || req.user.organization_id || null;
        if (!targetOrgId && isOwner) {
            const userOrg = await db.prepare("SELECT id FROM organizations WHERE owner_id = ?").get(req.user.id);
            if (userOrg) targetOrgId = userOrg.id;
        }

        const initialStatus = (isSuperAdmin || isOwner) ? 'active' : 'pending_approval';

        await db.prepare(`
            INSERT INTO shops (
                id, name, shop_name, shop_code, owner_id, organization_id, address, phone, email, gst, fssai, manager, opening_date,
                currency, tax_rate, logo, low_stock_alert, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            shopId, shop_name, shop_name, shop_code, ownerId, targetOrgId, address || '', phone || '', email || null,
            gst || '', fssai || null, manager || null, opening_date || null, currency,
            parseFloat(tax_rate) || 0, logo, parseInt(low_stock_alert) || 5, initialStatus
        );

        if (owner_username && owner_password) {
            const existingUser = await db.prepare(`SELECT id FROM users WHERE username = ?`).get(owner_username);
            if (!existingUser) {
                const newUserId = 'usr_' + uuidv4().substring(0, 8);
                const hashed = bcrypt.hashSync(owner_password, 10);
                const managerPermissions = JSON.stringify([
                    'Dashboard', 'Inventory', 'Billing', 'Reports', 'Customers',
                    'Stock In', 'Stock Out', 'Delete Item', 'Edit Item', 'Create Item',
                    'Discount', 'Print Bill', 'Export Excel', 'Settings', 'Users',
                    'Financial Reports', 'Categories', 'Units', 'Purchase Price',
                    'Selling Price', 'History', 'Parties', 'Suppliers', 'Ledgers', 'Payments', 'Purchases'
                ]);

                await db.prepare(`
                    INSERT INTO users (id, name, username, password, password_hash, role, shop_id, organization_id, permissions, status)
                    VALUES (?, ?, ?, ?, ?, 'Manager', ?, ?, ?, ?)
                `).run(newUserId, owner_name || `${shop_name} Manager`, owner_username, hashed, hashed, shopId, targetOrgId, managerPermissions, initialStatus);
            }
        }

        await db.prepare(`
            INSERT INTO settings (id, shop_id, shop_name, tagline, address, phone, gst, currency, tax_rate, logo, low_stock_alert)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('set_' + uuidv4().substring(0, 8), shopId, shop_name, 'Quality & Excellence', address || '', phone || '', gst || '', currency, parseFloat(tax_rate) || 0, logo, parseInt(low_stock_alert) || 5);

        const defaultCats = ['General', 'Bakery', 'Beverages', 'Snacks', 'Others'];
        for (let idx = 0; idx < defaultCats.length; idx++) {
            await db.prepare(`INSERT INTO categories (id, shop_id, name) VALUES (?, ?, ?)`).run(`cat_${shopId}_${idx}`, shopId, defaultCats[idx]);
        }

        const defaultUnits = ['Pcs', 'Kg', 'Grams', 'Ltr', 'Box', 'Pack'];
        for (let idx = 0; idx < defaultUnits.length; idx++) {
            await db.prepare(`INSERT INTO units (id, shop_id, name) VALUES (?, ?, ?)`).run(`unit_${shopId}_${idx}`, shopId, defaultUnits[idx]);
        }

        if (!isSuperAdmin && !isOwner) {
            const appId = 'app_' + uuidv4().substring(0, 8);
            const autoApproveAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
            await db.prepare(`
                INSERT INTO approvals (id, shop_id, requester_id, requester_name, type, entity_id, title, payload, status, auto_approve_at)
                VALUES (?, ?, ?, ?, 'branch_create', ?, ?, ?, 'pending', ?)
            `).run(appId, shopId, req.user.id, req.user.name, shopId, `Create Branch: ${shop_name} (${shop_code})`, JSON.stringify({
                shopId, shopName: shop_name, name: shop_name, shopCode: shop_code, ownerId: req.user.id, address, phone, gst, currency, taxRate: tax_rate, logo
            }), autoApproveAt);

            const notifId = 'notif_' + uuidv4().substring(0, 8);
            await db.prepare(`
                INSERT INTO notifications (id, shop_id, title, message, type)
                VALUES (?, 'shop_default_hq', ?, ?, 'warning')
            `).run(notifId, `New Branch Approval Request: ${shop_name}`, `Branch Owner '${req.user.name}' requested creation of branch '${shop_name}' (${shop_code})`);

            await logAudit(shopId, req.user.id, 'Request Branch Creation', `Submitted branch creation for '${shop_name}' for approval`);
            return success(res, 'Branch creation submitted for Superadmin approval (Auto-approves in 8 hours)', { shop_id: shopId, status: 'pending_approval' }, 202);
        }

        await logAudit(shopId, req.user.id, 'Create Shop', `Created new shop branch '${shop_name}' (${shop_code})`);
        return success(res, 'Shop branch created successfully', { shop_id: shopId, owner_id: ownerId, organization_id: targetOrgId }, 201);
    } catch (err) {
        return error(res, err.message || 'Failed to create shop', 400);
    }
};

const updateShop = async (req, res) => {
    const { id } = req.params;
    const { shop_name, address, phone, email, gst, fssai, manager, opening_date, currency, tax_rate, logo, low_stock_alert, status } = req.body;

    try {
        const shop = await db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
        if (!shop) {
            return error(res, 'Shop not found', 404);
        }

        // Data isolation check: Non-Admin can only update branches of their own organization
        if (req.user.role !== 'Admin') {
            const userOrgId = req.user.organization_id;
            if (shop.organization_id && userOrgId && shop.organization_id !== userOrgId && shop.owner_id !== req.user.id) {
                return error(res, 'Unauthorized access to shop branch', 403);
            }
        }

        await db.prepare(`
            UPDATE shops SET
                shop_name = COALESCE(?, shop_name),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                email = COALESCE(?, email),
                gst = COALESCE(?, gst),
                fssai = COALESCE(?, fssai),
                manager = COALESCE(?, manager),
                opening_date = COALESCE(?, opening_date),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert),
                status = COALESCE(?, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(shop_name, address, phone, email, gst, fssai, manager, opening_date, currency, tax_rate, logo, low_stock_alert, status, id);

        await db.prepare(`
            UPDATE settings SET
                shop_name = COALESCE(?, shop_name),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                gst = COALESCE(?, gst),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert),
                updated_at = CURRENT_TIMESTAMP
            WHERE shop_id = ?
        `).run(shop_name, address, phone, gst, currency, tax_rate, logo, low_stock_alert, id);

        await logAudit(id, req.user.id, 'Update Shop', `Updated branch details for ${shop.shop_name}`);
        return success(res, 'Shop updated successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const toggleShopStatus = async (req, res) => {
    const { id } = req.params;
    try {
        const shop = await db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
        if (!shop) {
            return error(res, 'Shop not found', 404);
        }

        if (req.user.role !== 'Admin') {
            const userOrgId = req.user.organization_id;
            if (shop.organization_id && userOrgId && shop.organization_id !== userOrgId && shop.owner_id !== req.user.id) {
                return error(res, 'Unauthorized access to shop branch', 403);
            }
        }

        const newStatus = shop.status === 'active' ? 'disabled' : 'active';
        await db.prepare(`UPDATE shops SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newStatus, id);

        await logAudit(id, req.user.id, 'Toggle Shop Status', `Shop ${shop.shop_name} set to ${newStatus}`);
        return success(res, `Shop is now ${newStatus}`);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const deleteShop = async (req, res) => {
    const { id } = req.params;
    if (id === 'shop_default_hq') {
        return error(res, 'Cannot delete default main headquarters shop branch', 400);
    }

    try {
        const shop = await db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
        if (!shop) {
            return error(res, 'Shop not found', 404);
        }

        if (req.user.role !== 'Admin') {
            const userOrgId = req.user.organization_id;
            if (shop.organization_id && userOrgId && shop.organization_id !== userOrgId && shop.owner_id !== req.user.id) {
                return error(res, 'Unauthorized access to shop branch', 403);
            }
        }

        const billCount = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ? AND status != 'Cancelled'`).get(id);
        if (parseInt(billCount?.count || 0) > 0) {
            return error(res, `Cannot delete branch '${shop.shop_name}' because it contains ${billCount.count} active sales transactions`, 400);
        }

        await db.prepare(`UPDATE shops SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
        await logAudit(id, req.user.id, 'Delete Shop', `Soft deleted shop branch ${shop.shop_name}`);
        return success(res, 'Shop branch deleted successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = {
    getShops,
    getShopById,
    createShop,
    updateShop,
    toggleShopStatus,
    deleteShop
};
