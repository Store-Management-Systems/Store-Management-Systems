const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../../notifications/services/auditService');

const getOrganizations = async (req, res) => {
    try {
        let orgs = [];
        if (req.user.role === 'Admin') {
            orgs = await db.prepare("SELECT * FROM organizations WHERE status != 'deleted' ORDER BY created_at DESC").all();
        } else {
            orgs = await db.prepare("SELECT * FROM organizations WHERE (owner_id = ? OR id = ?) AND status != 'deleted'").all(req.user.id, req.user.organization_id || '');
        }
        return success(res, 'Organizations retrieved', orgs);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const getOrganizationById = async (req, res) => {
    const { id } = req.params;
    try {
        const org = await db.prepare("SELECT * FROM organizations WHERE id = ?").get(id);
        if (!org) return error(res, 'Organization not found', 404);

        const branches = await db.prepare("SELECT id, name, shop_name, shop_code, status FROM shops WHERE organization_id = ? AND status != 'deleted'").all(id);
        const users = await db.prepare("SELECT id, name, username, role, status FROM users WHERE organization_id = ? AND status != 'disabled'").all(id);

        return success(res, 'Organization details retrieved', {
            ...org,
            branches,
            users
        });
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const createOrganization = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return error(res, 'Only Superadmin can create organizations', 403);
    }

    const { name, code, owner_name, owner_username, owner_password, email, phone } = req.body;

    if (!name || !code) {
        return error(res, 'Organization name and code are required', 400);
    }

    try {
        const existingCode = await db.prepare("SELECT id FROM organizations WHERE code = ?").get(code);
        if (existingCode) {
            return error(res, 'Organization code already exists', 400);
        }

        const orgId = 'org_' + uuidv4().substring(0, 8);
        let ownerId = null;

        if (owner_username && owner_password) {
            const existingUser = await db.prepare("SELECT id FROM users WHERE username = ?").get(owner_username);
            if (existingUser) {
                return error(res, 'Owner username already taken', 400);
            }

            ownerId = 'usr_' + uuidv4().substring(0, 8);
            const hashed = bcrypt.hashSync(owner_password, 10);
            const ownerPermissions = JSON.stringify([
                'Dashboard', 'Inventory', 'Billing', 'Reports', 'Customers',
                'Stock In', 'Stock Out', 'Delete Item', 'Edit Item', 'Create Item',
                'Discount', 'Print Bill', 'Export Excel', 'Settings', 'Users',
                'Financial Reports', 'Categories', 'Units', 'Purchase Price',
                'Selling Price', 'History', 'Parties', 'Suppliers', 'Ledgers', 'Payments', 'Purchases'
            ]);

            // Default shop for owner
            const defaultShopId = 'shp_' + uuidv4().substring(0, 8);
            await db.prepare(`
                INSERT INTO shops (id, name, shop_name, shop_code, owner_id, organization_id, status)
                VALUES (?, ?, ?, ?, ?, ?, 'active')
            `).run(defaultShopId, `${name} Main Branch`, `${name} Main Branch`, `${code}-HQ`, ownerId, orgId);

            await db.prepare(`
                INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, organization_id, permissions, status, phone)
                VALUES (?, ?, ?, ?, ?, ?, 'Owner', ?, ?, ?, 'active', ?)
            `).run(ownerId, owner_name || `${name} Owner`, owner_username, email || null, hashed, hashed, defaultShopId, orgId, ownerPermissions, phone || null);
        }

        await db.prepare(`
            INSERT INTO organizations (id, name, code, owner_id, owner_name, email, phone, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
        `).run(orgId, name, code, ownerId, owner_name || `${name} Owner`, email || null, phone || null);

        await logAudit('system', req.user.id, 'Create Organization', `Created organization '${name}' (${code})`);

        return success(res, 'Organization created successfully', {
            id: orgId,
            name,
            code,
            owner_id: ownerId
        }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const updateOrganization = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return error(res, 'Only Superadmin can update organizations', 403);
    }

    const { id } = req.params;
    const { name, email, phone, status } = req.body;

    try {
        await db.prepare(`
            UPDATE organizations SET
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                status = COALESCE(?, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, email, phone, status, id);

        return success(res, 'Organization updated successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const deleteOrganization = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return error(res, 'Only Superadmin can delete organizations', 403);
    }

    const { id } = req.params;
    try {
        await db.prepare("UPDATE organizations SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
        return success(res, 'Organization deleted successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = {
    getOrganizations,
    getOrganizationById,
    createOrganization,
    updateOrganization,
    deleteOrganization
};
