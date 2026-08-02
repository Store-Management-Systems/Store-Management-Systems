const { db } = require('../../../shared');

let _cachedSettings = null;

const DEFAULT_GLOBAL_SETTINGS = {
    // 1. Company Information
    company_name: 'STORE MANAGEMENT SYSTEMS',
    legal_name: 'Store Management Systems Pvt. Ltd.',
    gstin: '22AAAAA0000A1Z5',
    pan: 'ABCDE1234F',
    cin: 'U72900DL2024PTC123456',
    registered_address: 'Suite 500, Tech Park Plaza, Barakhamba Road',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    pincode: '110001',
    website: 'https://storemanagementsystems.com',
    company_email: 'contact@storemanagementsystems.com',
    company_phone: '+91-9876543210',

    // 2. SaaS Billing Details & A4 Invoices
    billing_company_name: 'Store Management Systems SaaS Billing',
    billing_legal_name: 'Store Management Systems Pvt. Ltd.',
    billing_gstin: '22AAAAA0000A1Z5',
    billing_pan: 'ABCDE1234F',
    invoice_prefix: 'SMS-INV-',
    billing_address: 'Suite 500, Tech Park Plaza, Barakhamba Road',
    billing_city: 'New Delhi',
    billing_state: 'Delhi',
    billing_country: 'India',
    billing_pincode: '110001',
    billing_email: 'billing@storemanagementsystems.com',
    billing_phone: '+91-9876543210',
    bank_name: 'HDFC Bank Ltd',
    account_holder: 'Store Management Systems Pvt. Ltd.',
    account_number: '50200012345678',
    ifsc_code: 'HDFC0001234',
    bank_branch: 'Connaught Place Branch, New Delhi',
    upi_id: 'sms@hdfcbank',
    payment_terms: 'Payment due within 7 days of invoice generation.',
    notes_terms: 'Computer generated SaaS invoice. All disputes subject to Delhi jurisdiction.',
    signatory_name: 'Rahul Sharma',
    signatory_designation: 'Director & Head of SaaS Operations',
    signature_logo: null,
    seal_logo: null,

    // 3. Support Contact Information
    support_email: 'support@storemanagementsystems.com',
    support_phone: '+1-800-SMS-SaaS',
    whatsapp_number: '+91-9876543210',
    customer_care_number: '1800-123-4567',
    tech_support_number: '+91-9876543211',
    sales_email: 'sales@storemanagementsystems.com',
    sales_phone: '+91-9876543212',
    business_hours: 'Mon - Sat: 9:00 AM - 8:00 PM IST',

    // 4. Branding
    dark_logo: 'assets/logos/logo.png',
    light_logo: 'assets/logos/logo.png',
    favicon: 'assets/logos/logo.png',
    app_icon: 'assets/logos/logo.png',
    primary_color: '#1E1E1E',
    secondary_color: '#6B7280',
    accent_color: '#3B82F6',

    // 5. System Preferences
    default_currency: '₹',
    currency_symbol: '₹',
    date_format: 'DD/MM/YYYY',
    time_format: '12 Hours',
    time_zone: 'Asia/Kolkata',

    // 6. Security
    session_timeout_minutes: 15,
    password_min_length: 6,
    max_login_attempts: 5,
    force_password_change_default: 0,

    // Legacy Platform Meta
    platform_name: 'STORE MANAGEMENT SYSTEMS',
    platform_logo: 'assets/logos/logo.png',
    default_price_per_branch: 999,
    system_status: 'Operational',
    version: 'v2.5.0 SaaS Enterprise'
};

const getGlobalSettings = async (forceRefresh = false) => {
    if (_cachedSettings && !forceRefresh) {
        return _cachedSettings;
    }

    try {
        const row = await db.prepare(`SELECT * FROM platform_settings WHERE id = 'ps_global'`).get();
        if (!row) {
            _cachedSettings = { ...DEFAULT_GLOBAL_SETTINGS };
            return _cachedSettings;
        }

        // Clean up legacy auto_approval_hours if present
        delete row.auto_approval_hours;

        _cachedSettings = {
            ...DEFAULT_GLOBAL_SETTINGS,
            ...row
        };

        return _cachedSettings;
    } catch (err) {
        console.error('Error reading global settings:', err.message);
        return { ...DEFAULT_GLOBAL_SETTINGS };
    }
};

const invalidateSettingsCache = () => {
    _cachedSettings = null;
};

const updateGlobalSettings = async (updatesObj) => {
    try {
        const current = await getGlobalSettings();
        const merged = { ...current, ...updatesObj };

        delete merged.auto_approval_hours;
        delete merged.id;

        // Build dynamic UPDATE statement for platform_settings table
        const keys = Object.keys(updatesObj).filter(k => k !== 'id' && k !== 'auto_approval_hours');
        if (keys.length === 0) return merged;

        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => updatesObj[k]);
        values.push('ps_global');

        // Check if table has columns, otherwise fallback gracefully
        try {
            await db.prepare(`UPDATE platform_settings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(values);
        } catch (e) {
            // Safely alter table if column missing
            for (const key of keys) {
                try {
                    const colDef = typeof updatesObj[key] === 'number' ? 'NUMERIC' : 'TEXT';
                    if (db.isPg) {
                        await db.prepare(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ${key} ${colDef}`).run().catch(() => {});
                    } else {
                        await db.prepare(`ALTER TABLE platform_settings ADD COLUMN ${key} ${colDef}`).run().catch(() => {});
                    }
                } catch (colErr) {}
            }
            await db.prepare(`UPDATE platform_settings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(values);
        }

        invalidateSettingsCache();
        return await getGlobalSettings(true);
    } catch (err) {
        console.error('Failed to update global settings:', err.message);
        throw err;
    }
};

module.exports = {
    DEFAULT_GLOBAL_SETTINGS,
    getGlobalSettings,
    invalidateSettingsCache,
    updateGlobalSettings
};
