const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../../notifications/services/auditService');

const recalculateOrganizationSubscription = async (orgId) => {
    if (!orgId) return null;
    const activeRes = await db.prepare("SELECT COUNT(*) as count FROM shops WHERE organization_id = ? AND status = 'active'").get(orgId);
    const activeCount = parseInt(activeRes?.count || 0);

    const org = await db.prepare("SELECT price_per_branch FROM organizations WHERE id = ?").get(orgId);
    const pricePerBranch = parseFloat(org?.price_per_branch || 999);
    const totalAmount = activeCount * pricePerBranch;

    await db.prepare(`
        UPDATE organizations SET
            active_branch_count = ?,
            subscription_amount = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(activeCount, totalAmount, orgId);

    return { active_branch_count: activeCount, price_per_branch: pricePerBranch, subscription_amount: totalAmount };
};

const getOrganizations = async (req, res) => {
    try {
        let orgs = [];
        if (req.user.role === 'Admin') {
            orgs = await db.prepare("SELECT * FROM organizations WHERE status != 'deleted' ORDER BY created_at DESC").all();
        } else {
            const orgId = req.user.organization_id || '';
            orgs = await db.prepare("SELECT * FROM organizations WHERE (owner_id = ? OR id = ?) AND status != 'deleted'").all(req.user.id, orgId);
        }

        const enrichedOrgs = [];
        for (const org of orgs) {
            await recalculateOrganizationSubscription(org.id);
            const freshOrg = await db.prepare("SELECT * FROM organizations WHERE id = ?").get(org.id);

            const allBranches = await db.prepare("SELECT id, name, shop_name, shop_code, status, created_at FROM shops WHERE organization_id = ? ORDER BY created_at DESC").all(org.id);
            const activeBranches = allBranches.filter(b => b.status === 'active');

            let ownerUser = null;
            if (freshOrg.owner_id) {
                ownerUser = await db.prepare("SELECT id, name, username, email, phone, status FROM users WHERE id = ?").get(freshOrg.owner_id);
            }

            enrichedOrgs.push({
                ...freshOrg,
                branches_count: allBranches.filter(b => b.status !== 'deleted').length,
                active_branches_count: activeBranches.length,
                price_per_branch: parseFloat(freshOrg.price_per_branch || 999),
                subscription_amount: activeBranches.length * parseFloat(freshOrg.price_per_branch || 999),
                owner: ownerUser || { id: freshOrg.owner_id, name: freshOrg.owner_name || 'Unassigned', username: 'N/A' },
                branches_breakdown: allBranches.map(b => ({
                    id: b.id,
                    name: b.shop_name || b.name,
                    code: b.shop_code,
                    status: b.status,
                    is_billable: b.status === 'active'
                }))
            });
        }

        return success(res, 'Organizations retrieved', enrichedOrgs);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const getOrganizationById = async (req, res) => {
    const { id } = req.params;

    if (req.user.role !== 'Admin' && req.user.organization_id !== id) {
        const userOrg = await db.prepare("SELECT id FROM organizations WHERE owner_id = ? AND id = ?").get(req.user.id, id);
        if (!userOrg) {
            return error(res, 'Unauthorized access to organization', 403);
        }
    }

    try {
        await recalculateOrganizationSubscription(id);
        const org = await db.prepare("SELECT * FROM organizations WHERE id = ?").get(id);
        if (!org || org.status === 'deleted') return error(res, 'Organization not found', 404);

        const allBranches = await db.prepare("SELECT id, name, shop_name, shop_code, status, address, phone, created_at FROM shops WHERE organization_id = ? ORDER BY created_at DESC").all(id);
        const users = await db.prepare("SELECT id, name, username, email, role, status FROM users WHERE organization_id = ? AND status != 'disabled'").all(id);

        const activeBranches = allBranches.filter(b => b.status === 'active');
        const pricePerBranch = parseFloat(org.price_per_branch || 999);
        const subAmount = activeBranches.length * pricePerBranch;

        let ownerUser = null;
        if (org.owner_id) {
            ownerUser = await db.prepare("SELECT id, name, username, email, phone FROM users WHERE id = ?").get(org.owner_id);
        }

        return success(res, 'Organization details retrieved', {
            ...org,
            branches_count: allBranches.filter(b => b.status !== 'deleted').length,
            active_branches_count: activeBranches.length,
            price_per_branch: pricePerBranch,
            subscription_amount: subAmount,
            owner: ownerUser || { id: org.owner_id, name: org.owner_name, username: 'N/A' },
            branches: allBranches.filter(b => b.status !== 'deleted'),
            branches_breakdown: allBranches.map(b => ({
                id: b.id,
                name: b.shop_name || b.name,
                code: b.shop_code,
                status: b.status,
                is_billable: b.status === 'active'
            })),
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
        subscription_expiry,
        price_per_branch = 999
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

        const defaultExpiry = subscription_expiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const numPricePerBranch = parseFloat(price_per_branch) || 999;

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
                subscription_plan, subscription_status, subscription_start, subscription_expiry,
                price_per_branch, active_branch_count, subscription_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 'Active', CURRENT_TIMESTAMP, ?, ?, 1, ?)
        `).run(orgId, name, code, ownerId, owner_name || `${name} Owner`, email || null, phone || null, subscription_plan, defaultExpiry, numPricePerBranch, numPricePerBranch);

        await recalculateOrganizationSubscription(orgId);

        // Automatic Subscription Record for Initial Default Branch
        const subPk = 'sub_' + uuidv4().substring(0, 8);
        const subId = 'SUB-' + Date.now();
        const now = new Date();
        const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await db.prepare(`
            INSERT INTO subscriptions (
                id, subscription_id, organization_id, branch_id, plan_id, plan_name,
                subscription_amount, payment_status, payment_mode, subscription_start,
                renewal_date, expiry_date, auto_renew_enabled, status
            ) VALUES (?, ?, ?, ?, 'monthly', 'Monthly Plan', ?, 'Unpaid', 'Cash', ?, ?, ?, 1, 'Active')
        `).run(subPk, subId, orgId, defaultShopId, numPricePerBranch, now.toISOString(), expiryDate, expiryDate).catch(() => {});

        return success(res, 'Organization created successfully', {
            id: orgId,
            name,
            code,
            owner_id: ownerId,
            subscription_plan,
            subscription_status: 'Active',
            subscription_expiry: defaultExpiry,
            active_branch_count: 1,
            price_per_branch: numPricePerBranch,
            subscription_amount: numPricePerBranch,
            subscription_id: subId
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
    const { name, email, phone, status, subscription_plan, subscription_status, subscription_expiry, owner_id, price_per_branch } = req.body;

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
                price_per_branch = COALESCE(?, price_per_branch),
                owner_id = COALESCE(?, owner_id),
                owner_name = COALESCE(?, owner_name),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, email, phone, status, subscription_plan, subscription_status, subscription_expiry, price_per_branch, owner_id, ownerName, id);

        if (owner_id) {
            await db.prepare("UPDATE users SET role = 'Owner', organization_id = ? WHERE id = ?").run(id, owner_id);
        }

        await recalculateOrganizationSubscription(id);
        await logAudit('system', req.user.id, 'Update Organization', `Updated organization details for ${id}`);

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
        const org = await db.prepare("SELECT * FROM organizations WHERE id = ?").get(id);
        if (!org) return error(res, 'Organization not found', 404);

        // Fetch affected branches before deletion
        const affectedBranches = await db.prepare("SELECT id, shop_name, shop_code FROM shops WHERE organization_id = ? AND status != 'deleted'").all(id);

        // 1. Soft delete Organization
        await db.prepare("UPDATE organizations SET status = 'deleted', subscription_status = 'Cancelled', active_branch_count = 0, subscription_amount = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

        // 2. CASCADE soft delete all associated branches
        await db.prepare("UPDATE shops SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE organization_id = ?").run(id);

        // 3. Immediately revoke access for Owner and all branch staff users
        await db.prepare("UPDATE users SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE organization_id = ? OR id = ?").run(id, org.owner_id || '');

        await logAudit('system', req.user.id, 'Delete Organization', `Safely deleted organization '${org.name}' (${org.code}), soft-deleted ${affectedBranches.length} branches, and revoked user access`);

        return success(res, `Organization '${org.name}' and all ${affectedBranches.length} associated branches have been safely deleted and user access revoked. Historical records remain archived.`);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = {
    recalculateOrganizationSubscription,
    getOrganizations,
    getOrganizationById,
    createOrganization,
    updateOrganization,
    assignOwner,
    deleteOrganization
};
