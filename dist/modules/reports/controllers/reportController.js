"use strict";
const { db, error } = require('../../../shared');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const generateExcelReport = async (req, res) => {
    const { type = 'Billing', from, to, shop_id, category } = req.query;
    const targetShop = req.user.role === 'Admin' && shop_id ? shop_id : req.user.active_shop_id;
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`${type} Report`);
        if (type === 'Outstanding' || type === 'People') {
            worksheet.columns = [
                { header: 'Category', key: 'category', width: 15 },
                { header: 'Name', key: 'name', width: 22 },
                { header: 'Business Name', key: 'business_name', width: 22 },
                { header: 'Mobile', key: 'mobile', width: 15 },
                { header: 'GSTIN', key: 'gstin', width: 18 },
                { header: 'Opening Bal (₹)', key: 'opening_balance', width: 15 },
                { header: 'Due Amount (₹)', key: 'due_amount', width: 18 },
                { header: 'Credit Limit (₹)', key: 'credit_limit', width: 15 },
                { header: 'Status', key: 'status', width: 12 }
            ];
            let sql = `SELECT * FROM people WHERE shop_id = ? AND status != 'Deleted'`;
            const params = [targetShop];
            if (category && category !== 'All') {
                sql += ` AND category = ?`;
                params.push(category);
            }
            sql += ` ORDER BY category, name ASC`;
            const rows = await db.prepare(sql).all(params);
            for (const r of rows) {
                const openBal = parseFloat(r.opening_balance || 0);
                let due = 0;
                if (r.category === 'Supplier') {
                    const purchRes = await db.prepare(`SELECT SUM(total) as sum FROM purchases WHERE supplier_id = ?`).get(r.id);
                    const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'out'`).get(r.id);
                    due = (parseFloat(purchRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
                }
                else {
                    const salesRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE person_id = ? OR customer_phone = ?`).get(r.id, r.mobile);
                    const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'in'`).get(r.id);
                    due = (parseFloat(salesRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
                }
                worksheet.addRow({
                    category: r.category,
                    name: r.name,
                    business_name: r.business_name || '',
                    mobile: r.mobile || '',
                    gstin: r.gstin || '',
                    opening_balance: openBal.toFixed(2),
                    due_amount: due.toFixed(2),
                    credit_limit: parseFloat(r.credit_limit || 0).toFixed(2),
                    status: r.status
                });
            }
        }
        else if (type === 'Purchases') {
            worksheet.columns = [
                { header: 'Purchase No', key: 'purchase_number', width: 18 },
                { header: 'Supplier Invoice', key: 'supplier_invoice_no', width: 18 },
                { header: 'Supplier Name', key: 'supplier_name', width: 22 },
                { header: 'Total (₹)', key: 'total', width: 15 },
                { header: 'Paid (₹)', key: 'paid_amount', width: 15 },
                { header: 'Due (₹)', key: 'due_amount', width: 15 },
                { header: 'Payment Status', key: 'payment_status', width: 15 },
                { header: 'Date', key: 'created_at', width: 22 }
            ];
            const rows = await db.prepare(`
                SELECT pur.*, p.name as supplier_name
                FROM purchases pur
                LEFT JOIN people p ON pur.supplier_id = p.id
                WHERE pur.shop_id = ?
                ORDER BY pur.created_at DESC
            `).all(targetShop);
            rows.forEach(r => worksheet.addRow({
                ...r,
                created_at: new Date(r.created_at).toLocaleString()
            }));
        }
        else if (type === 'Billing') {
            worksheet.columns = [
                { header: 'Bill No', key: 'bill_number', width: 15 },
                { header: 'Customer/Party', key: 'customer_name', width: 22 },
                { header: 'Phone', key: 'customer_phone', width: 15 },
                { header: 'Subtotal (₹)', key: 'subtotal', width: 14 },
                { header: 'Tax (₹)', key: 'tax', width: 10 },
                { header: 'Total (₹)', key: 'total', width: 14 },
                { header: 'Paid (₹)', key: 'paid_amount', width: 14 },
                { header: 'Due (₹)', key: 'due_amount', width: 14 },
                { header: 'Payment Mode', key: 'payment_mode', width: 15 },
                { header: 'Date', key: 'created_at', width: 22 }
            ];
            let sql = `SELECT * FROM bills WHERE shop_id = ?`;
            const params = [targetShop];
            if (from && to) {
                sql += ` AND created_at BETWEEN ? AND ?`;
                params.push(`${from} 00:00:00`, `${to} 23:59:59`);
            }
            sql += ` ORDER BY created_at DESC`;
            const rows = await db.prepare(sql).all(params);
            rows.forEach(r => worksheet.addRow({
                ...r,
                created_at: new Date(r.created_at).toLocaleString()
            }));
        }
        else {
            worksheet.columns = [
                { header: 'Item Name', key: 'name', width: 25 },
                { header: 'Category', key: 'category', width: 15 },
                { header: 'Unit', key: 'unit', width: 10 },
                { header: 'Buy Price (₹)', key: 'buy_price', width: 14 },
                { header: 'Sell Price (₹)', key: 'selling_price', width: 14 },
                { header: 'Stock', key: 'stock', width: 10 }
            ];
            const rows = await db.prepare(`SELECT * FROM items WHERE shop_id = ? AND status = 'active' ORDER BY name ASC`).all(targetShop);
            rows.forEach(r => worksheet.addRow(r));
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_Report_${Date.now()}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    }
    catch (err) {
        return error(res, err.message || 'Export error', 500);
    }
};
const generatePDFReport = async (req, res) => {
    const { type = 'Billing', shop_id } = req.query;
    const targetShop = req.user.role === 'Admin' && shop_id ? shop_id : req.user.active_shop_id;
    try {
        const doc = new PDFDocument({ margin: 30 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_Report_${Date.now()}.pdf"`);
        doc.pipe(res);
        doc.fontSize(20).text(`${type} Executive Report`, { align: 'center' });
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown();
        if (type === 'Outstanding') {
            const people = await db.prepare(`SELECT * FROM people WHERE shop_id = ? AND status != 'Deleted' ORDER BY category, name ASC`).all(targetShop);
            people.forEach((r, idx) => {
                doc.fontSize(11).text(`${idx + 1}. [${r.category}] ${r.name} (${r.business_name || 'Individual'}) - Mobile: ${r.mobile || 'N/A'}`);
            });
        }
        else {
            const rows = await db.prepare(`SELECT * FROM items WHERE shop_id = ? AND status = 'active' ORDER BY name ASC`).all(targetShop);
            rows.forEach((r, idx) => {
                doc.fontSize(11).text(`${idx + 1}. ${r.name} - Stock: ${r.stock} ${r.unit} | Price: ₹${r.selling_price || r.price}`);
            });
        }
        doc.end();
    }
    catch (err) {
        return error(res, err.message || 'PDF export error', 500);
    }
};
module.exports = {
    generateExcelReport,
    generatePDFReport,
    exportExcelReport: generateExcelReport,
    exportPdfReport: generatePDFReport
};
