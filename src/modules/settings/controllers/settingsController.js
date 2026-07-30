const { db, success, error } = require('../../../shared');
const { logAudit } = require('../../notifications/services/auditService');

// 1. PLATFORM SETTINGS (Platform Admin Scope)
const getPlatformSettings = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return error(res, 'Only Platform Admin can access Platform Settings', 403);
    }
    try {
        let ps = await db.prepare("SELECT * FROM platform_settings WHERE id = 'ps_global'").get();
        if (!ps) {
            ps = {
                id: 'ps_global',
                platform_name: 'STORE MANAGEMENT SYSTEMS',
                platform_logo: 'assets/logos/logo.png',
                support_email: 'support@storemanagementsystems.com',
                support_phone: '+1-800-SMS-SaaS',
                default_currency: '₹',
                default_price_per_branch: 999,
                session_timeout_minutes: 15,
                auto_approval_hours: 8,
                system_status: 'Operational',
                version: 'v2.5.0 SaaS Enterprise'
            };
        }
        return success(res, 'Platform Settings retrieved', ps);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const updatePlatformSettings = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return error(res, 'Only Platform Admin can update Platform Settings', 403);
    }
    const {
        platform_name,
        platform_logo,
        support_email,
        support_phone,
        default_currency,
        default_price_per_branch,
        session_timeout_minutes,
        auto_approval_hours
    } = req.body;

    try {
        await db.prepare(`
            UPDATE platform_settings SET
                platform_name = COALESCE(?, platform_name),
                platform_logo = COALESCE(?, platform_logo),
                support_email = COALESCE(?, support_email),
                support_phone = COALESCE(?, support_phone),
                default_currency = COALESCE(?, default_currency),
                default_price_per_branch = COALESCE(?, default_price_per_branch),
                session_timeout_minutes = COALESCE(?, session_timeout_minutes),
                auto_approval_hours = COALESCE(?, auto_approval_hours),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 'ps_global'
        `).run(
            platform_name,
            platform_logo,
            support_email,
            support_phone,
            default_currency,
            default_price_per_branch,
            session_timeout_minutes,
            auto_approval_hours
        );

        await logAudit('system', req.user.id, 'Update Platform Settings', 'Updated SaaS Platform configuration');
        return success(res, 'Platform Settings updated successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

// 2. ORGANIZATION SETTINGS (Organization Owner Scope)
const getOrganizationSettings = async (req, res) => {
    const orgId = req.user.organization_id;
    if (!orgId && req.user.role !== 'Admin') {
        return error(res, 'Organization context required', 400);
    }

    try {
        const targetOrgId = orgId || req.query.organization_id;
        const org = await db.prepare("SELECT * FROM organizations WHERE id = ?").get(targetOrgId);
        if (!org) return error(res, 'Organization not found', 404);

        let brandingObj = null;
        if (org.branding_config) {
            try { brandingObj = typeof org.branding_config === 'string' ? JSON.parse(org.branding_config) : org.branding_config; } catch (e) {}
        }

        return success(res, 'Organization Settings retrieved', {
            id: org.id,
            name: org.name,
            code: org.code,
            owner_name: org.owner_name,
            email: org.email,
            phone: org.phone,
            subscription_plan: org.subscription_plan,
            subscription_status: org.subscription_status,
            subscription_expiry: org.subscription_expiry,
            price_per_branch: org.price_per_branch,
            active_branch_count: org.active_branch_count,
            subscription_amount: org.subscription_amount,
            branding_config: brandingObj
        });
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const updateOrganizationSettings = async (req, res) => {
    const orgId = req.user.organization_id;
    if (!orgId && req.user.role !== 'Admin') {
        return error(res, 'Organization context required', 400);
    }

    const targetOrgId = orgId || req.body.organization_id;
    const { name, email, phone, branding_config } = req.body;

    try {
        let brandingStr = null;
        if (branding_config !== undefined) {
            brandingStr = typeof branding_config === 'object' ? JSON.stringify(branding_config) : branding_config;
        }

        await db.prepare(`
            UPDATE organizations SET
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                branding_config = COALESCE(?, branding_config),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, email, phone, brandingStr, targetOrgId);

        if (branding_config && branding_config.logo && branding_config.logo_type === 'image') {
            await db.prepare(`UPDATE shops SET logo = ?, updated_at = CURRENT_TIMESTAMP WHERE organization_id = ?`).run(branding_config.logo, targetOrgId);
        }

        await logAudit(targetOrgId, req.user.id, 'Update Organization Settings', 'Updated organization defaults & brand identity');
        return success(res, 'Organization Settings updated successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

// 3. BRANCH SETTINGS (Branch Manager / Staff Scope)
const getSettings = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        let settings = await db.prepare(`SELECT * FROM settings WHERE shop_id = ?`).get(targetShop);
        if (!settings) {
            const shop = await db.prepare(`SELECT * FROM shops WHERE id = ?`).get(targetShop);
            settings = {
                shop_id: targetShop,
                shop_name: shop ? (shop.shop_name || shop.name) : 'Main Shop',
                currency: shop ? shop.currency : '₹',
                tax_rate: shop ? shop.tax_rate : 0,
                low_stock_alert: shop ? shop.low_stock_alert : 5
            };
        }
        return success(res, 'Settings retrieved', settings);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const updateSettings = async (req, res) => {
    const { name, tagline, address, phone, gst, currency, taxRate, logo, lowStockAlert } = req.body;
    const targetShop = req.user.active_shop_id;

    try {
        await db.prepare(`
            UPDATE settings SET
                shop_name = COALESCE(?, shop_name),
                tagline = COALESCE(?, tagline),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                gst = COALESCE(?, gst),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert),
                updated_at = CURRENT_TIMESTAMP
            WHERE shop_id = ?
        `).run(name, tagline, address, phone, gst, currency, taxRate, logo, lowStockAlert, targetShop);

        await db.prepare(`
            UPDATE shops SET
                shop_name = COALESCE(?, shop_name),
                name = COALESCE(?, name),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                gst = COALESCE(?, gst),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, name, address, phone, gst, currency, taxRate, logo, lowStockAlert, targetShop);

        await logAudit(targetShop, req.user.id, 'Update Settings', 'Updated shop settings and profile');
        return success(res, 'Settings updated successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = {
    getPlatformSettings,
    updatePlatformSettings,
    getOrganizationSettings,
    updateOrganizationSettings,
    getSettings,
    updateSettings
};
