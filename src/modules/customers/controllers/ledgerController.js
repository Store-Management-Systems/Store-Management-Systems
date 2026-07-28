const { db, success, error } = require('../../../shared');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const getLedger = async (req, res) => {
    const { personId } = req.params;
    const { from, to } = req.query;
    const activeShop = req.user.active_shop_id;

    try {
        const person = await db.prepare(`SELECT * FROM people WHERE id = ? AND shop_id = ?`).get(personId, activeShop);
        if (!person) {
            return error(res, 'Entity/Party record not found', 404);
        }

        let sql = `SELECT * FROM ledgers WHERE person_id = ? AND shop_id = ?`;
        const params = [personId, activeShop];

        if (from && to) {
            sql += ` AND created_at BETWEEN ? AND ?`;
            params.push(`${from} 00:00:00`, `${to} 23:59:59`);
        }

        sql += ` ORDER BY created_at ASC`;

        const entries = await db.prepare(sql).all(params);

        // Recalculate running balance in order
        let runningBalance = parseFloat(person.opening_balance || 0);

        const calculatedEntries = entries.map(e => {
            const debit = parseFloat(e.debit || 0);
            const credit = parseFloat(e.credit || 0);

            if (person.category === 'Supplier') {
                // For Suppliers: Credit increases Payable, Debit decreases Payable
                runningBalance = runningBalance + credit - debit;
            } else {
                // For B2B Parties / B2C Customers: Debit increases Receivable, Credit decreases Receivable
                runningBalance = runningBalance + debit - credit;
            }

            return {
                ...e,
                debit,
                credit,
                running_balance: runningBalance
            };
        });

        return success(res, 'Ledger retrieved successfully', {
            person,
            current_due: runningBalance,
            entries: calculatedEntries
        });
    } catch (err) {
        return error(res, err.message || 'Failed to retrieve ledger', 500);
    }
};

const exportLedgerExcel = async (req, res) => {
    const { personId } = req.params;
    const { from, to } = req.query;
    const activeShop = req.user.active_shop_id;

    try {
        const person = await db.prepare(`SELECT * FROM people WHERE id = ? AND shop_id = ?`).get(personId, activeShop);
        if (!person) return error(res, 'Person not found', 404);

        let sql = `SELECT * FROM ledgers WHERE person_id = ? AND shop_id = ?`;
        const params = [personId, activeShop];
        if (from && to) {
            sql += ` AND created_at BETWEEN ? AND ?`;
            params.push(`${from} 00:00:00`, `${to} 23:59:59`);
        }
        sql += ` ORDER BY created_at ASC`;

        const entries = await db.prepare(sql).all(params);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`${person.name} Ledger`);

        worksheet.columns = [
            { header: 'Date', key: 'created_at', width: 20 },
            { header: 'Entry Type', key: 'entry_type', width: 20 },
            { header: 'Reference ID', key: 'reference_id', width: 18 },
            { header: 'Debit (₹)', key: 'debit', width: 15 },
            { header: 'Credit (₹)', key: 'credit', width: 15 },
            { header: 'Balance (₹)', key: 'running_balance', width: 18 },
            { header: 'Notes', key: 'notes', width: 30 }
        ];

        let running = parseFloat(person.opening_balance || 0);

        entries.forEach(e => {
            const debit = parseFloat(e.debit || 0);
            const credit = parseFloat(e.credit || 0);
            if (person.category === 'Supplier') {
                running = running + credit - debit;
            } else {
                running = running + debit - credit;
            }
            worksheet.addRow({
                created_at: new Date(e.created_at).toLocaleString(),
                entry_type: e.entry_type,
                reference_id: e.reference_id || 'N/A',
                debit: debit.toFixed(2),
                credit: credit.toFixed(2),
                running_balance: running.toFixed(2),
                notes: e.notes || ''
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${person.name}_Ledger_${Date.now()}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const exportLedgerPdf = async (req, res) => {
    const { personId } = req.params;
    const activeShop = req.user.active_shop_id;

    try {
        const person = await db.prepare(`SELECT * FROM people WHERE id = ? AND shop_id = ?`).get(personId, activeShop);
        if (!person) return error(res, 'Person not found', 404);

        const entries = await db.prepare(`SELECT * FROM ledgers WHERE person_id = ? AND shop_id = ? ORDER BY created_at ASC`).all(personId, activeShop);

        const doc = new PDFDocument({ margin: 30 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${person.name}_Statement_${Date.now()}.pdf"`);
        doc.pipe(res);

        doc.fontSize(18).text(`${person.name} - ${person.category} Account Statement`, { align: 'center' });
        if (person.business_name) doc.fontSize(12).text(person.business_name, { align: 'center' });
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown();

        let running = parseFloat(person.opening_balance || 0);

        entries.forEach((e, idx) => {
            const debit = parseFloat(e.debit || 0);
            const credit = parseFloat(e.credit || 0);
            if (person.category === 'Supplier') {
                running = running + credit - debit;
            } else {
                running = running + debit - credit;
            }

            doc.fontSize(10).text(
                `${idx + 1}. [${new Date(e.created_at).toLocaleDateString()}] ${e.entry_type} | Dr: ₹${debit.toFixed(2)} | Cr: ₹${credit.toFixed(2)} | Bal: ₹${running.toFixed(2)}`
            );
        });

        doc.moveDown();
        doc.fontSize(12).text(`Net Closing Outstanding: ₹${running.toFixed(2)}`, { align: 'right' });

        doc.end();
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = {
    getLedger,
    exportLedgerExcel,
    exportLedgerPdf
};
