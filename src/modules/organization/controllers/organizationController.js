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
            const orgId = req.user.organization_id || '';
            orgs = await db.prepare("SELECT * FROM organizations WHERE (owner_id = ? OR id = ?) AND status != 'deleted'").all(req.user.id, orgId);
        }

        // Attach branches count and owner information
        const enrichedOrgs = [];
        for (const org of orgs) {
            const branchCountRes = await db.prepare("SELECT COUNT(*) as count FROM shops WHERE organization_id = ? AND status != 'deleted'").get(org.id);
            let ownerUser = null;
            if (org.owner_id) {
                ownerUser = await db.prepare("SELECT id, name, username, email, phone, status FROM users WHERE id = ?").get(org.owner_id);
            }

            enrichedOrgs.push({
                ...org,
                branches_count: parseInt(branchCountRes?.count || 0),
                owner: ownerUser || { id: org.owner_id, name: org.owner_name || 'Unassigned', username: 'N/A' }
            });
        }

        return success(res, 'Organizations retrieved', enrichedOrgs);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const getOrganizationById = async (req, res) => {
    const { id } = req.params;

    // Authorization check: Owner can only view their own organization
    if (req.user.role !== 'Admin' && req.user.organization_id !== id) {
        const userOrg = await db.prepare("SELECT id FROM organizations WHERE owner_id = ? AND id = ?").get(req.user.id, id);
        if (!userOrg) {
            return error(res, 'Unauthorized access to organization', 403);
        }
    }

    try {
        const org = await db.prepare("SELECT * FROM organizations WHERE id = ?").get(id);
        if (!org) return error(res, 'Organization not found', 404);

        const branches = await db.prepare("SELECT id, name, shop_name, shop_code, status, address, phone, created_at FROM shops WHERE organization_id = ? AND status != 'deleted' ORDER BY created_at DESC").all(id);
        const users = await db.prepare("SELECT id, name, username, email, role, status FROM users WHERE organization_id = ? AND status != 'disabled'").all(id);

        let ownerUser = null;
        if (org.owner_id) {
            ownerUser = await db.prepare("SELECT id, name, username, email, phone FROM users WHERE id = ?").get(org.owner_id);
        }

        return success(res, 'Organization details retrieved', {
            ...org,
            branches_count: branches.length,
            owner: ownerUser || { id: org.owner_id, name: org.owner_name, username: 'N/A' },
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

    const {
        name,
        code,
        owner_name,
        owner_username,
        owner_password,
        email,
        phone,
        subscription_plan = 'Standard',
        subscription_expiry
    } = req.body;

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

        // Set subscription expiry default to 1 year from now if not passed
        const defaultExpiry = subscription_expiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

            // Default branch for organization
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
            INSERT INTO organizations (
                id, name, code, owner_id, owner_name, email, phone, status,
                subscription_plan, subscription_status, subscription_start, subscription_expiry
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 'Active', CURRENT_TIMESTAMP, ?)
        `).run(orgId, name, code, ownerId, owner_name || `${name} Owner`, email || null, phone || null, subscription_plan, defaultExpiry);

        await logAudit('system', req.user.id, 'Create Organization', `Created organization '${name}' (${code})`);

        return success(res, 'Organization created successfully', {
            id: orgId,
            name,
            code,
            owner_id: ownerId,
            subscription_plan,
            subscription_status: 'Active',
            subscription_expiry: defaultExpiry
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
    const { name, email, phone, status, subscription_plan, subscription_status, subscription_expiry, owner_id } = req.body;

    try {
        let ownerName = null;
        if (owner_id) {
            const ownerUser = await db.prepare("SELECT name FROM users WHERE id = ?").get(owner_id);
            if (ownerUser) ownerName = ownerUser.name;
        }

        await db.prepare(`
            UPDATE organizations SET
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                status = COALESCE(?, status),
                subscription_plan = COALESCE(?, subscription_plan),
                subscription_status = COALESCE(?, subscription_status),
                subscription_expiry = COALESCE(?, subscription_expiry),
                owner_id = COALESCE(?, owner_id),
                owner_name = COALESCE(?, owner_name),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, email, phone, status, subscription_plan, subscription_status, subscription_expiry, owner_id, ownerName, id);

        // If owner_id was updated, ensure user role and organization_id match
        if (owner_id) {
            await db.prepare("UPDATE users SET role = 'Owner', organization_id = ? WHERE id = ?").run(id, owner_id);
        }

        await logAudit('system', req.user.id, 'Update Organization', `Updated organization ${id}`);

        return success(res, 'Organization updated successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const assignOwner = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return error(res, 'Only Superadmin can assign organization owners', 403);
    }

    const { id } = req.params;
    const { owner_id, owner_name, owner_username, owner_password, email, phone } = req.body;

    try {
        const org = await db.prepare("SELECT * FROM organizations WHERE id = ?").get(id);
        if (!org) return error(res, 'Organization not found', 404);

        let targetOwnerId = owner_id;
        let targetOwnerName = owner_name;

        if (!targetOwnerId && owner_username && owner_password) {
            const existingUser = await db.prepare("SELECT id FROM users WHERE username = ?").get(owner_username);
            if (existingUser) {
                return error(res, 'Username already taken', 400);
            }

            targetOwnerId = 'usr_' + uuidv4().substring(0, 8);
            const hashed = bcrypt.hashSync(owner_password, 10);
            targetOwnerName = owner_name || `${org.name} Owner`;

            // Fetch a default shop for organization if present
            const orgShop = await db.prepare("SELECT id FROM shops WHERE organization_id = ?").get(id);
            const defaultShopId = orgShop ? orgShop.id : 'shop_default_hq';

            const ownerPermissions = JSON.stringify([
                'Dashboard', 'Inventory', 'Billing', 'Reports', 'Customers',
                'Stock In', 'Stock Out', 'Delete Item', 'Edit Item', 'Create Item',
                'Discount', 'Print Bill', 'Export Excel', 'Settings', 'Users',
                'Financial Reports', 'Categories', 'Units', 'Purchase Price',
                'Selling Price', 'History', 'Parties', 'Suppliers', 'Ledgers', 'Payments', 'Purchases'
            ]);

            await db.prepare(`
                INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, organization_id, permissions, status, phone)
                VALUES (?, ?, ?, ?, ?, ?, 'Owner', ?, ?, ?, 'active', ?)
            `).run(targetOwnerId, targetOwnerName, owner_username, email || null, hashed, hashed, defaultShopId, id, ownerPermissions, phone || null);
        } else if (targetOwnerId) {
            const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(targetOwnerId);
            if (!user) return error(res, 'Selected user not found', 404);

            targetOwnerName = user.name;
            await db.prepare("UPDATE users SET role = 'Owner', organization_id = ? WHERE id = ?").run(id, targetOwnerId);
        } else {
            return error(res, 'Please select an existing user or provide owner credentials', 400);
        }

        await db.prepare(`
            UPDATE organizations SET
                owner_id = ?,
                owner_name = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(targetOwnerId, targetOwnerName, id);

        await logAudit('system', req.user.id, 'Assign Organization Owner', `Assigned '${targetOwnerName}' as owner of '${org.name}'`);

        return success(res, `Assigned '${targetOwnerName}' as owner of '${org.name}' successfully`, {
            organization_id: id,
            owner_id: targetOwnerId,
            owner_name: targetOwnerName
        });
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
    assignOwner,
    deleteOrganization
};
