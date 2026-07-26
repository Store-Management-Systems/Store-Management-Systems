const db = require('../database/init');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { error } = require('../utils/response');

const generateExcelReport = async (req, res) => {
    const { type = 'Billing', from, to, shop_id } = req.query;
    const targetShop = req.user.role === 'Admin' && shop_id ? shop_id : req.user.active_shop_id;

    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`${type} Report`);

        if (type === 'Billing') {
            worksheet.columns = [
                { header: 'Bill No', key: 'bill_number', width: 15 },
                { header: 'Customer', key: 'customer_name', width: 20 },
                { header: 'Phone', key: 'customer_phone', width: 15 },
                { header: 'Subtotal', key: 'subtotal', width: 12 },
                { header: 'Tax', key: 'tax', width: 10 },
                { header: 'Total', key: 'total', width: 12 },
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
            rows.forEach(r => worksheet.addRow(r));
        } else {
            worksheet.columns = [
                { header: 'Item Name', key: 'name', width: 25 },
                { header: 'Category', key: 'category', width: 15 },
                { header: 'Unit', key: 'unit', width: 10 },
                { header: 'Buy Price', key: 'buy_price', width: 12 },
                { header: 'Sell Price', key: 'selling_price', width: 12 },
                { header: 'Stock', key: 'stock', width: 10 }
            ];
            const rows = await db.prepare(`SELECT * FROM items WHERE shop_id = ? AND status = 'active' ORDER BY name ASC`).all(targetShop);
            rows.forEach(r => worksheet.addRow(r));
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_Report_${Date.now()}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
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

        doc.fontSize(20).text(`${type} Report`, { align: 'center' });
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown();

        const rows = await db.prepare(`SELECT * FROM items WHERE shop_id = ? AND status = 'active' ORDER BY name ASC`).all(targetShop);
        rows.forEach((r, idx) => {
            doc.fontSize(11).text(`${idx + 1}. ${r.name} - Stock: ${r.stock} ${r.unit} | Price: ₹${r.selling_price || r.price}`);
        });

        doc.end();
    } catch (err) {
        return error(res, err.message || 'PDF export error', 500);
    }
};

module.exports = { generateExcelReport, generatePDFReport, exportExcelReport: generateExcelReport, exportPdfReport: generatePDFReport };
