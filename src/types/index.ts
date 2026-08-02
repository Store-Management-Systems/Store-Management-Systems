export type UserRole = 'Admin' | 'SUPER_ADMIN' | 'Super Admin' | 'SuperAdmin' | 'Owner' | 'Manager' | 'Staff' | 'Cashier' | 'Employee';

export interface UserSession {
    id: string;
    name: string;
    username: string;
    email?: string | null;
    role: UserRole;
    shop_id: string;
    active_shop_id?: string;
    organization_id?: string | null;
    permissions?: string[];
    force_password_change?: number;
}

export interface JwtPayload {
    id: string;
    name: string;
    username: string;
    email?: string | null;
    role: UserRole;
    shop_id: string;
    organization_id?: string | null;
    permissions?: string[];
    iat?: number;
    exp?: number;
}

export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}

export interface Organization {
    id: string;
    name: string;
    code: string;
    owner_id?: string;
    owner_name?: string;
    price_per_branch?: number;
    subscription_plan?: string;
    subscription_status?: string;
    subscription_amount?: number;
    active_branch_count?: number;
    status: string;
    created_at?: string;
    updated_at?: string;
}

export interface Shop {
    id: string;
    name?: string;
    shop_name: string;
    shop_code: string;
    owner_id?: string;
    organization_id?: string | null;
    address?: string | null;
    phone?: string | null;
    gst?: string | null;
    currency?: string;
    tax_rate?: number;
    logo?: string | null;
    low_stock_alert?: number;
    status: string;
    created_at?: string;
    updated_at?: string;
}

export interface Item {
    id: string;
    shop_id: string;
    organization_id?: string | null;
    name: string;
    category?: string | null;
    price: number;
    purchase_price?: number;
    selling_price?: number;
    stock: number;
    unit?: string | null;
    barcode?: string | null;
    min_stock_alert?: number;
    created_at?: string;
    updated_at?: string;
}

export interface BillItem {
    id?: string;
    bill_id?: string;
    item_id: string;
    item_name: string;
    price: number;
    quantity: number;
    total: number;
    unit?: string;
}

export interface Bill {
    id: string;
    shop_id: string;
    organization_id?: string | null;
    bill_number: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    discount_type?: 'rupees' | 'percent';
    grand_total: number;
    payment_mode: string;
    paid_amount?: number;
    status: string;
    items?: BillItem[];
    created_at?: string;
    updated_at?: string;
}

export interface Subscription {
    id: string;
    subscription_id: string;
    organization_id: string;
    organization_name?: string;
    branch_id?: string | null;
    branch_name?: string;
    branch_code?: string;
    owner_name?: string;
    plan_name: string;
    plan_id?: string;
    subscription_amount: number;
    payment_status: 'Paid' | 'Unpaid';
    payment_mode?: string;
    subscription_start?: string;
    renewal_date?: string;
    expiry_date?: string;
    days_remaining?: number;
    calculated_status?: string;
    status: string;
    created_at?: string;
    updated_at?: string;
}

export interface GlobalSettings {
    company_name: string;
    legal_name: string;
    gstin: string;
    pan: string;
    cin: string;
    registered_address: string;
    city: string;
    state: string;
    country: string;
    pincode: string;
    website: string;
    company_email: string;
    company_phone: string;
    billing_company_name: string;
    billing_legal_name: string;
    billing_gstin: string;
    billing_pan: string;
    invoice_prefix: string;
    billing_address: string;
    billing_city: string;
    billing_state: string;
    billing_country: string;
    billing_pincode: string;
    billing_email: string;
    billing_phone: string;
    bank_name: string;
    account_holder: string;
    account_number: string;
    ifsc_code: string;
    bank_branch: string;
    upi_id: string;
    payment_terms: string;
    notes_terms: string;
    signatory_name: string;
    signatory_designation: string;
    signature_logo?: string | null;
    seal_logo?: string | null;
    support_email: string;
    support_phone: string;
    whatsapp_number: string;
    customer_care_number: string;
    tech_support_number: string;
    sales_email: string;
    sales_phone: string;
    business_hours: string;
    dark_logo?: string;
    light_logo?: string;
    favicon?: string;
    app_icon?: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    default_currency: string;
    currency_symbol: string;
    date_format: string;
    time_format: string;
    time_zone: string;
    session_timeout_minutes: number;
    password_min_length: number;
    max_login_attempts: number;
    force_password_change_default: number;
    platform_name: string;
    platform_logo: string;
    default_price_per_branch: number;
    system_status: string;
    version: string;
}
