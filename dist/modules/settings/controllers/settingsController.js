"use strict";
const { db, success, error } = require('../../../shared');
const globalSettingsService = require('../services/globalSettingsService');
// 1. GLOBAL SAAS CONFIGURATION CENTER (Super Admin Scope)
const getGlobalSettings = async (req, res) => {
    try {
        const settings = await globalSettingsService.getGlobalSettings();
        return success(res, 'Global SaaS Settings retrieved', settings);
    }
    catch (err) {
        return error(res, err.message || 'Failed to retrieve global settings', 500);
    }
};
const updateGlobalSettings = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return error(res, 'Only Super Admin can update Global SaaS Settings', 403);
    }
    try {
        const updates = req.body || {};
        delete updates.auto_approval_hours;
        const updatedSettings = await globalSettingsService.updateGlobalSettings(updates);
        return success(res, 'Global SaaS Settings updated successfully', updatedSettings);
    }
    catch (err) {
        return error(res, err.message || 'Failed to update global settings', 500);
    }
};
// 2. ORGANIZATION SETTINGS (Organization Owner Scope)
const getOrganizationSettings = async (req, res) => {
    try {
        const targetOrgId = req.user.organization_id;
        if (!targetOrgId) {
            return error(res, 'Organization ID missing for user', 400);
        }
        const org = await db.prepare(`SELECT * FROM organizations WHERE id = ?`).get(targetOrgId);
        if (!org) {
            return error(res, 'Organization not found', 404);
        }
        return success(res, 'Organization Settings retrieved', org);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const updateOrganizationSettings = async (req, res) => {
    if (!['Admin', 'Owner'].includes(req.user.role)) {
        return error(res, 'Only Organization Owners or Admins can update organization settings', 403);
    }
    try {
        const targetOrgId = req.user.organization_id;
        const { name, email, phone, branding_config } = req.body;
        await db.prepare(`
            UPDATE organizations SET
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                branding_config = COALESCE(?, branding_config),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, email, phone, branding_config, targetOrgId);
        return success(res, 'Organization Settings updated successfully');
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
// 3. SHOP / BRANCH SETTINGS (Branch Manager / Staff Scope)
const getShopSettings = async (req, res) => {
    try {
        const targetShop = req.user.active_shop_id || req.user.shop_id;
        const settings = await db.prepare(`SELECT * FROM settings WHERE shop_id = ?`).get(targetShop);
        return success(res, 'Shop Settings retrieved', settings);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const updateShopSettings = async (req, res) => {
    try {
        const targetShop = req.user.active_shop_id || req.user.shop_id;
        const { shop_name, tagline, address, phone, gst, currency, tax_rate, logo, low_stock_alert } = req.body;
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
        `).run(shop_name, tagline, address, phone, gst, currency, tax_rate, logo, low_stock_alert, targetShop);
        return success(res, 'Shop Settings updated successfully');
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
module.exports = {
    getGlobalSettings,
    updateGlobalSettings,
    getPlatformSettings: getGlobalSettings, // Backward compatibility alias
    updatePlatformSettings: updateGlobalSettings, // Backward compatibility alias
    getOrganizationSettings,
    updateOrganizationSettings,
    getShopSettings,
    updateShopSettings
};
