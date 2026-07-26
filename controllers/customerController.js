const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');

const getCustomers = (req, res) => {
    const shopId = req.user.active_shop_id;
    const { search, page = 1, limit = 50 } = req.query;

    let sql = `SELECT * FROM customers WHERE shop_id = ?`;
    const params = [shopId];

    if (search) {
        sql += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const customers = db.prepare(sql).all(...params);

    return success(res, 'Customers retrieved', customers);
};

const getCustomerById = (req, res) => {
    const { id } = req.params;
    const shopId = req.user.active_shop_id;
    const customer = db.prepare(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`).get(id, shopId);

    if (!customer) {
        return error(res, 'Customer not found', 404);
    }

    // Get customer's bills
    const bills = db.prepare(`SELECT * FROM bills WHERE shop_id = ? AND customer_phone = ? ORDER BY created_at DESC`).all(shopId, customer.phone);

    return success(res, 'Customer details retrieved', { customer, bills });
};

const createCustomer = (req, res) => {
    const shopId = req.user.active_shop_id;
    const { name, phone, email, address, gst, birthday, notes } = req.body;

    if (!name || name.trim() === '') {
        return error(res, 'Customer name is required', 400);
    }

    const id = 'cus_' + uuidv4().substring(0, 8);

    db.prepare(`
        INSERT INTO customers (id, shop_id, name, phone, email, address, gst, birthday, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, shopId, name.trim(), phone || '', email || '', address || '', gst || '', birthday || '', notes || '');

    return success(res, 'Customer created successfully', { id, name, phone }, 201);
};

const updateCustomer = (req, res) => {
    const { id } = req.params;
    const shopId = req.user.active_shop_id;
    const { name, phone, email, address, gst, birthday, notes } = req.body;

    db.prepare(`
        UPDATE customers SET
            name = COALESCE(?, name),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            address = COALESCE(?, address),
            gst = COALESCE(?, gst),
            birthday = COALESCE(?, birthday),
            notes = COALESCE(?, notes)
        WHERE id = ? AND shop_id = ?
    `).run(name, phone, email, address, gst, birthday, notes, id, shopId);

    return success(res, 'Customer updated successfully');
};

const deleteCustomer = (req, res) => {
    const { id } = req.params;
    const shopId = req.user.active_shop_id;
    db.prepare(`DELETE FROM customers WHERE id = ? AND shop_id = ?`).run(id, shopId);
    return success(res, 'Customer deleted successfully');
};

module.exports = {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer
};
