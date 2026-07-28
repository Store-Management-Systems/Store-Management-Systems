const { db, success, error } = require('../../../shared');
const { recalculateOrganizationSubscription } = require('../../organization/controllers/organizationController');

const getDashboardStats = async (req, res) => {
    try {
        const { range, startDate, endDate, branch_id } = req.query;
        const role = req.user.role;

        // -------------------------------------------------------------
        // 1. ADMIN DASHBOARD (Organization & Subscription Overview)
        // -------------------------------------------------------------
        if (role === 'Admin') {
            const orgs = await db.prepare("SELECT * FROM organizations WHERE status != 'deleted' ORDER BY created_at DESC").all();
            const totalOrgs = orgs.length;
            const activeOrgs = orgs.filter(o => o.status === 'active').length;
            const inactiveOrgs = totalOrgs - activeOrgs;

            let activeSubs = 0;
            let expiringSubs = 0;
            let expiredSubs = 0;

            const now = new Date();

            const enrichedOrgs = [];
            for (const org of orgs) {
                await recalculateOrganizationSubscription(org.id);
                const freshOrg = await db.prepare("SELECT * FROM organizations WHERE id = ?").get(org.id);

                const allBranches = await db.prepare("SELECT id, name, shop_name, shop_code, status, created_at FROM shops WHERE organization_id = ? ORDER BY created_at DESC").all(org.id);
                const activeBranches = allBranches.filter(b => b.status === 'active');
                
                let subStatus = freshOrg.subscription_status || 'Active';
                if (freshOrg.subscription_expiry) {
                    const expDate = new Date(freshOrg.subscription_expiry);
                    const daysRemaining = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
                    if (daysRemaining < 0) {
                        subStatus = 'Expired';
                        expiredSubs++;
                    } else if (daysRemaining <= 15) {
                        subStatus = 'Expiring Soon';
                        expiringSubs++;
                    } else {
                        subStatus = 'Active';
                        activeSubs++;
                    }
                } else {
                    activeSubs++;
                }

                let ownerUser = null;
                if (freshOrg.owner_id) {
                    ownerUser = await db.prepare("SELECT id, name, username, email FROM users WHERE id = ?").get(freshOrg.owner_id);
                }

                const pricePerBranch = parseFloat(freshOrg.price_per_branch || 999);
                const subAmount = activeBranches.length * pricePerBranch;

                enrichedOrgs.push({
                    ...freshOrg,
                    subscription_status: subStatus,
                    branches_count: allBranches.filter(b => b.status !== 'deleted').length,
                    active_branches_count: activeBranches.length,
                    price_per_branch: pricePerBranch,
                    subscription_amount: subAmount,
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

            return success(res, 'Admin organization & subscription dashboard loaded', {
                mode: 'Admin',
                metrics: {
                    totalOrganizations: totalOrgs,
                    activeOrganizations: activeOrgs,
                    inactiveOrganizations: inactiveOrgs,
                    subscriptions: {
                        active: activeSubs,
                        expiringSoon: expiringSubs,
                        expired: expiredSubs
                    }
                },
                organizations: enrichedOrgs
            });
        }

        // Determine Owner's Organization
        let userOrgId = req.user.organization_id;
        if (!userOrgId && role === 'Owner') {
            const orgRec = await db.prepare("SELECT id FROM organizations WHERE owner_id = ?").get(req.user.id);
            if (orgRec) userOrgId = orgRec.id;
        }

        // -------------------------------------------------------------
        // 2. OWNER DASHBOARD (Organization-level & Branch-wise Sales)
        // -------------------------------------------------------------
        if (role === 'Owner') {
            let org = null;
            if (userOrgId) {
                await recalculateOrganizationSubscription(userOrgId);
                org = await db.prepare("SELECT * FROM organizations WHERE id = ?").get(userOrgId);
            }

            // Get all branches belonging strictly to this Owner's Organization
            let branches = [];
            if (userOrgId) {
                branches = await db.prepare("SELECT id, name, shop_name, shop_code, status, address, phone FROM shops WHERE organization_id = ? AND status != 'deleted' ORDER BY created_at DESC").all(userOrgId);
            } else {
                branches = await db.prepare("SELECT id, name, shop_name, shop_code, status, address, phone FROM shops WHERE owner_id = ? AND status != 'deleted' ORDER BY created_at DESC").all(req.user.id);
            }

            const branchIds = branches.map(b => b.id);
            let targetBranchIds = branchIds;

            if (branch_id && branch_id !== 'all') {
                if (branchIds.includes(branch_id)) {
                    targetBranchIds = [branch_id];
                } else {
                    targetBranchIds = [];
                }
            }

            // Build Date Filter Clause for Bills
            let dateClause = "";
            const params = [];

            if (range === 'today') {
                dateClause = " AND created_at >= CURRENT_DATE";
            } else if (range === 'yesterday') {
                dateClause = " AND created_at >= (CURRENT_DATE - INTERVAL '1 day') AND created_at < CURRENT_DATE";
            } else if (range === '7days') {
                dateClause = " AND created_at >= (CURRENT_DATE - INTERVAL '7 days')";
            } else if (range === '30days') {
                dateClause = " AND created_at >= (CURRENT_DATE - INTERVAL '30 days')";
            } else if (startDate && endDate) {
                dateClause = " AND created_at >= ? AND created_at <= ?";
                params.push(startDate, endDate);
            }

            let totalOrgSales = 0;
            let totalOrgBills = 0;
            const branchPerformance = [];

            for (const b of branches) {
                let sqlSales = `SELECT SUM(total) as sum, COUNT(*) as count FROM bills WHERE shop_id = ? AND status != 'Cancelled'` + dateClause;
                const p = [b.id, ...params];
                const resSales = await db.prepare(sqlSales).get(...p);

                const bSales = parseFloat(resSales?.sum || 0);
                const bBills = parseInt(resSales?.count || 0);

                if (targetBranchIds.includes(b.id)) {
                    totalOrgSales += bSales;
                    totalOrgBills += bBills;
                }

                branchPerformance.push({
                    branch_id: b.id,
                    branch_name: b.shop_name || b.name,
                    branch_code: b.shop_code,
                    sales: bSales,
                    bill_count: bBills,
                    status: b.status,
                    phone: b.phone
                });
            }

            const activeBranchCount = branches.filter(b => b.status === 'active').length;
            const pricePerBranch = parseFloat(org?.price_per_branch || 999);
            const subscriptionAmount = activeBranchCount * pricePerBranch;

            return success(res, 'Owner organization dashboard loaded', {
                mode: 'Owner',
                organization: org ? {
                    ...org,
                    active_branches_count: activeBranchCount,
                    price_per_branch: pricePerBranch,
                    subscription_amount: subscriptionAmount
                } : { name: 'My Organization', code: 'ORG', active_branches_count: activeBranchCount, price_per_branch: pricePerBranch, subscription_amount: subscriptionAmount },
                summary: {
                    totalSales: totalOrgSales,
                    totalBills: totalOrgBills,
                    totalBranches: branches.length,
                    activeBranches: activeBranchCount,
                    subscriptionAmount: subscriptionAmount
                },
                branchPerformance,
                filter: {
                    range: range || 'all',
                    branch_id: branch_id || 'all'
                }
            });
        }

        // -------------------------------------------------------------
        // 3. STAFF / SINGLE BRANCH DASHBOARD
        // -------------------------------------------------------------
        const targetShop = req.user.active_shop_id;

        // 1. Items Summary
        const totalItemsRes = await db.prepare(`SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND status = 'active'`).get(targetShop);
        const lowStockRes = await db.prepare(`SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND status = 'active' AND stock <= 5`).get(targetShop);
        const lowStockItems = await db.prepare(`SELECT id, name, stock, unit, category FROM items WHERE shop_id = ? AND status = 'active' AND stock <= 5 LIMIT 10`).all(targetShop);

        // 2. Revenue & Sales Metrics
        const todayRevRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ? AND status != 'Cancelled' AND created_at >= CURRENT_DATE`).get(targetShop);
        const totalRevRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ? AND status != 'Cancelled'`).get(targetShop);
        const todayBillsRes = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ? AND status != 'Cancelled' AND created_at >= CURRENT_DATE`).get(targetShop);

        // 3. Recent Bills
        const recentBills = await db.prepare(`SELECT * FROM bills WHERE shop_id = ? ORDER BY created_at DESC LIMIT 5`).all(targetShop);

        // 4. People & B2B/B2C Outstanding Calculations
        const people = await db.prepare(`SELECT * FROM people WHERE shop_id = ? AND status != 'Deleted'`).all(targetShop);

        let customerCount = 0;
        let customerActiveCount = 0;
        let customerOutstanding = 0;

        let partyCount = 0;
        let partyReceivable = 0;
        let partyOverdue = 0;

        let supplierCount = 0;
        let supplierPayable = 0;
        let supplierOverdue = 0;

        for (const p of people) {
            const openBal = parseFloat(p.opening_balance || 0);

            if (p.category === 'Supplier') {
                supplierCount++;
                const purchRes = await db.prepare(`SELECT SUM(total) as sum FROM purchases WHERE supplier_id = ?`).get(p.id);
                const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'out'`).get(p.id);
                const due = (parseFloat(purchRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
                if (due > 0) {
                    supplierPayable += due;
                    supplierOverdue += due;
                }
            } else if (p.category === 'Party') {
                partyCount++;
                const salesRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE person_id = ? OR customer_phone = ?`).get(p.id, p.mobile);
                const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'in'`).get(p.id);
                const due = (parseFloat(salesRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
                if (due > 0) {
                    partyReceivable += due;
                    partyOverdue += due;
                }
            } else {
                customerCount++;
                if (p.status === 'Active') customerActiveCount++;
                const salesRes = await db.prepare(`SELECT SUM(total) as sum FROM bills WHERE person_id = ? OR customer_phone = ?`).get(p.id, p.mobile);
                const payRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE person_id = ? AND type = 'in'`).get(p.id);
                const due = (parseFloat(salesRes?.sum || 0) - parseFloat(payRes?.sum || 0)) + openBal;
                if (due > 0) customerOutstanding += due;
            }
        }

        // 5. Today's Collections & Payments
        const todayCollectionsRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE shop_id = ? AND type = 'in' AND created_at >= CURRENT_DATE`).get(targetShop);
        const todayPaymentsRes = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE shop_id = ? AND type = 'out' AND created_at >= CURRENT_DATE`).get(targetShop);

        const totalReceivable = customerOutstanding + partyReceivable;
        const totalPayable = supplierPayable;
        const netOutstanding = totalReceivable - totalPayable;

        return success(res, 'Branch dashboard statistics loaded', {
            mode: 'Branch',
            items: {
                total: parseInt(totalItemsRes?.count || 0),
                lowStockCount: parseInt(lowStockRes?.count || 0),
                lowStockItems: lowStockItems || []
            },
            revenue: {
                today: parseFloat(todayRevRes?.sum || 0),
                total: parseFloat(totalRevRes?.sum || 0)
            },
            bills: {
                today: parseInt(todayBillsRes?.count || 0)
            },
            recentBills: recentBills || [],
            customersWidget: {
                total: customerCount,
                active: customerActiveCount,
                outstanding: customerOutstanding
            },
            partiesWidget: {
                total: partyCount,
                receivable: partyReceivable,
                overdue: partyOverdue
            },
            suppliersWidget: {
                total: supplierCount,
                payable: supplierPayable,
                overdue: supplierOverdue
            },
            financeWidget: {
                totalReceivable,
                totalPayable,
                netOutstanding,
                todayCollections: parseFloat(todayCollectionsRes?.sum || 0),
                todayPayments: parseFloat(todayPaymentsRes?.sum || 0)
            }
        });

    } catch (err) {
        return error(res, err.message || 'Failed to load dashboard metrics', 500);
    }
};

module.exports = { getDashboardStats };
