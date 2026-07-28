const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');

const getCustomers = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        const customers = await db.prepare(`SELECT * FROM customers WHERE shop_id = ? ORDER BY created_at DESC`).all(targetShop);
        return success(res, 'Customers retrieved', customers);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const getCustomerById = async (req, res) => {
    const { id } = req.params;
    try {
        const customer = await db.prepare(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`).get(id, req.user.active_shop_id);
        if (!customer) return error(res, 'Customer not found', 404);
        return success(res, 'Customer details retrieved', customer);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const createCustomer = async (req, res) => {
    const { name, phone, email, address, gst, birthday, notes } = req.body;
    if (!name) return error(res, 'Customer name is required', 400);

    const targetShop = req.user.active_shop_id;
    try {
        const id = 'cust_' + uuidv4().substring(0, 8);
        await db.prepare(`
            INSERT INTO customers (id, shop_id, name, phone, email, address, gst, birthday, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, targetShop, name, phone || null, email || null, address || null, gst || null, birthday || null, notes || null);
        return success(res, 'Customer created', { id, name, phone }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const updateCustomer = async (req, res) => {
    const { id } = req.params;
    const { name, phone, email, address, gst, birthday, notes } = req.body;
    try {
        await db.prepare(`
            UPDATE customers SET
                name = COALESCE(?, name),
                phone = COALESCE(?, phone),
                email = COALESCE(?, email),
                address = COALESCE(?, address),
                gst = COALESCE(?, gst),
                birthday = COALESCE(?, birthday),
                notes = COALESCE(?, notes)
            WHERE id = ? AND shop_id = ?
        `).run(name, phone, email, address, gst, birthday, notes, id, req.user.active_shop_id);
        return success(res, 'Customer updated');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const deleteCustomer = async (req, res) => {
    const { id } = req.params;
    try {
        await db.prepare(`DELETE FROM customers WHERE id = ? AND shop_id = ?`).run(id, req.user.active_shop_id);
        return success(res, 'Customer deleted');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = { getCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer };
