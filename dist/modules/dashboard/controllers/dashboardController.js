"use strict";
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
            const activeOrgs = orgs.filter(o => o.status === 'active');
            const inactiveOrgs = orgs.filter(o => o.status === 'inactive');
            let expiringSubs = 0;
            let expiredSubs = 0;
            const now = new Date();
            const enrichedOrgs = [];
            const allBranchesList = [];
            for (const org of orgs) {
                await recalculateOrganizationSubscription(org.id);
                const freshOrg = await db.prepare("SELECT * FROM organizations WHERE id = ?").get(org.id);
                const allBranches = await db.prepare("SELECT id, name, shop_name, shop_code, status, created_at FROM shops WHERE organization_id = ? AND status != 'deleted' ORDER BY created_at DESC").all(org.id);
                const activeBranches = allBranches.filter(b => b.status === 'active');
                const inactiveBranches = allBranches.filter(b => b.status === 'inactive');
                let subStatus = freshOrg.subscription_status || 'Active';
                let daysRemaining = null;
                if (freshOrg.subscription_expiry) {
                    const expDate = new Date(freshOrg.subscription_expiry);
                    daysRemaining = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
                    if (daysRemaining < 0) {
                        subStatus = 'Expired';
                        expiredSubs++;
                    }
                    else if (daysRemaining <= 10) {
                        subStatus = 'Expiring Soon';
                        expiringSubs++;
                    }
                    else {
                        subStatus = 'Active';
                    }
                }
                let ownerUser = null;
                if (freshOrg.owner_id) {
                    ownerUser = await db.prepare("SELECT id, name, username, email FROM users WHERE id = ?").get(freshOrg.owner_id);
                }
                const pricePerBranch = parseFloat(freshOrg.price_per_branch || 999);
                const subAmount = activeBranches.length * pricePerBranch;
                const orgItem = {
                    ...freshOrg,
                    subscription_status: subStatus,
                    days_remaining: daysRemaining,
                    branches_count: allBranches.length,
                    active_branches_count: activeBranches.length,
                    inactive_branches_count: inactiveBranches.length,
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
                };
                enrichedOrgs.push(orgItem);
                for (const b of allBranches) {
                    allBranchesList.push({
                        id: b.id,
                        name: b.shop_name || b.name,
                        code: b.shop_code,
                        status: b.status,
                        created_at: b.created_at,
                        organization_id: freshOrg.id,
                        organization_name: freshOrg.name,
                        organization_code: freshOrg.code,
                        owner_name: ownerUser ? ownerUser.name : (freshOrg.owner_name || 'Unassigned')
                    });
                }
            }
            const totalActiveBranches = allBranchesList.filter(b => b.status === 'active').length;
            const totalInactiveBranches = allBranchesList.filter(b => b.status === 'inactive').length;
            return success(res, 'Admin organization & subscription dashboard loaded', {
                mode: 'Admin',
                metrics: {
                    totalOrganizations: totalOrgs,
                    activeOrganizations: activeOrgs.length,
                    inactiveOrganizations: inactiveOrgs.length,
                    totalBranches: allBranchesList.length,
                    activeBranches: totalActiveBranches,
                    inactiveBranches: totalInactiveBranches,
                    subscriptions: {
                        expiringSoon: expiringSubs,
                        expired: expiredSubs
                    }
                },
                organizations: enrichedOrgs,
                branches: allBranchesList
            });
        }
        // Determine Owner's Organization
        let userOrgId = req.user.organization_id;
        if (!userOrgId && role === 'Owner') {
            const orgRec = await db.prepare("SELECT id FROM organizations WHERE owner_id = ?").get(req.user.id);
            if (orgRec)
                userOrgId = orgRec.id;
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
            }
            else {
                branches = await db.prepare("SELECT id, name, shop_name, shop_code, status, address, phone FROM shops WHERE owner_id = ? AND status != 'deleted' ORDER BY created_at DESC").all(req.user.id);
            }
            const branchIds = branches.map(b => b.id);
            let targetBranchIds = branchIds;
            if (branch_id && branch_id !== 'all') {
                if (branchIds.includes(branch_id)) {
                    targetBranchIds = [branch_id];
                }
                else {
                    targetBranchIds = [];
                }
            }
            // Build Date Filter Clause for Bills
            let dateClause = "";
            const params = [];
            if (range === 'today') {
                dateClause = " AND created_at >= CURRENT_DATE";
            }
            else if (range === 'yesterday') {
                dateClause = " AND created_at >= (CURRENT_DATE - INTERVAL '1 day') AND created_at < CURRENT_DATE";
            }
            else if (range === '7days') {
                dateClause = " AND created_at >= (CURRENT_DATE - INTERVAL '7 days')";
            }
            else if (range === '30days') {
                dateClause = " AND created_at >= (CURRENT_DATE - INTERVAL '30 days')";
            }
            else if (startDate && endDate) {
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
        // 3. STAFF / SINGLE BRANCH DASHBOARD (Optimized with Promise.all & SQL Aggregations)
        // -------------------------------------------------------------
        const targetShop = req.user.active_shop_id;
        const cacheKey = `dashboard:${targetShop}:${role}`;
        const cachedDashboard = cache.get(cacheKey);
        if (cachedDashboard) {
            return success(res, 'Branch dashboard statistics loaded (cached)', cachedDashboard);
        }
        const [totalItemsRes, lowStockRes, lowStockItems, todayRevRes, totalRevRes, todayBillsRes, recentBills, peopleCategoryStats, supplierPurchasesRes, peoplePaymentsRes, peopleSalesRes, todayCollectionsRes, todayPaymentsRes] = await Promise.all([
            // 1. Items
            db.prepare(`SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND status = 'active'`).get(targetShop),
            db.prepare(`SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND status = 'active' AND stock <= 5`).get(targetShop),
            db.prepare(`SELECT id, name, stock, unit, category FROM items WHERE shop_id = ? AND status = 'active' AND stock <= 5 ORDER BY stock ASC LIMIT 10`).all(targetShop),
            // 2. Revenue & Sales
            db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ? AND status != 'Cancelled' AND created_at >= CURRENT_DATE`).get(targetShop),
            db.prepare(`SELECT SUM(total) as sum FROM bills WHERE shop_id = ? AND status != 'Cancelled'`).get(targetShop),
            db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ? AND status != 'Cancelled' AND created_at >= CURRENT_DATE`).get(targetShop),
            // 3. Recent Bills
            db.prepare(`SELECT id, shop_id, bill_number, customer_name, total, payment_mode, status, created_at FROM bills WHERE shop_id = ? ORDER BY created_at DESC LIMIT 5`).all(targetShop),
            // 4. People Aggregations
            db.prepare(`SELECT category, COUNT(*) as total_count, SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active_count, SUM(COALESCE(opening_balance, 0)) as open_bal FROM people WHERE shop_id = ? AND status != 'Deleted' GROUP BY category`).all(targetShop),
            db.prepare(`SELECT SUM(COALESCE(pur.total, 0)) as sum FROM purchases pur JOIN people p ON pur.supplier_id = p.id WHERE p.shop_id = ? AND p.status != 'Deleted' AND p.category = 'Supplier'`).get(targetShop),
            db.prepare(`SELECT p.category, pay.type, SUM(COALESCE(pay.amount, 0)) as sum FROM payments pay JOIN people p ON pay.person_id = p.id WHERE p.shop_id = ? AND p.status != 'Deleted' GROUP BY p.category, pay.type`).all(targetShop),
            db.prepare(`SELECT p.category, SUM(COALESCE(b.total, 0)) as sum FROM bills b JOIN people p ON (b.person_id = p.id OR b.customer_phone = p.mobile) WHERE p.shop_id = ? AND p.status != 'Deleted' AND b.status != 'Cancelled' GROUP BY p.category`).all(targetShop),
            // 5. Today's Collections & Payments
            db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE shop_id = ? AND type = 'in' AND created_at >= CURRENT_DATE`).get(targetShop),
            db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE shop_id = ? AND type = 'out' AND created_at >= CURRENT_DATE`).get(targetShop)
        ]);
        let customerCount = 0, customerActiveCount = 0, customerOpenBal = 0;
        let partyCount = 0, partyOpenBal = 0;
        let supplierCount = 0, supplierOpenBal = 0;
        (peopleCategoryStats || []).forEach(cat => {
            if (cat.category === 'Supplier') {
                supplierCount = parseInt(cat.total_count || 0);
                supplierOpenBal = parseFloat(cat.open_bal || 0);
            }
            else if (cat.category === 'Party') {
                partyCount = parseInt(cat.total_count || 0);
                partyOpenBal = parseFloat(cat.open_bal || 0);
            }
            else {
                customerCount = parseInt(cat.total_count || 0);
                customerActiveCount = parseInt(cat.active_count || 0);
                customerOpenBal = parseFloat(cat.open_bal || 0);
            }
        });
        // Supplier Outstanding = Purchases - Payments Out + Opening Balance
        const supplierPurchases = parseFloat(supplierPurchasesRes?.sum || 0);
        const supplierPaymentsOut = parseFloat((peoplePaymentsRes || []).find(p => p.category === 'Supplier' && p.type === 'out')?.sum || 0);
        const supplierPayable = Math.max(0, (supplierPurchases - supplierPaymentsOut) + supplierOpenBal);
        // Party Outstanding = Sales - Payments In + Opening Balance
        const partySales = parseFloat((peopleSalesRes || []).find(p => p.category === 'Party')?.sum || 0);
        const partyPaymentsIn = parseFloat((peoplePaymentsRes || []).find(p => p.category === 'Party' && p.type === 'in')?.sum || 0);
        const partyReceivable = Math.max(0, (partySales - partyPaymentsIn) + partyOpenBal);
        // Customer Outstanding = Sales - Payments In + Opening Balance
        const customerSales = parseFloat((peopleSalesRes || []).find(p => p.category === 'Customer')?.sum || 0);
        const customerPaymentsIn = parseFloat((peoplePaymentsRes || []).find(p => p.category === 'Customer' && p.type === 'in')?.sum || 0);
        const customerOutstanding = Math.max(0, (customerSales - customerPaymentsIn) + customerOpenBal);
        const totalReceivable = customerOutstanding + partyReceivable;
        const totalPayable = supplierPayable;
        const netOutstanding = totalReceivable - totalPayable;
        const responsePayload = {
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
                overdue: partyReceivable
            },
            suppliersWidget: {
                total: supplierCount,
                payable: supplierPayable,
                overdue: supplierPayable
            },
            financeWidget: {
                totalReceivable,
                totalPayable,
                netOutstanding,
                todayCollections: parseFloat(todayCollectionsRes?.sum || 0),
                todayPayments: parseFloat(todayPaymentsRes?.sum || 0)
            }
        };
        // Cache for 15 seconds
        cache.set(cacheKey, responsePayload, 15);
        return success(res, 'Branch dashboard statistics loaded', responsePayload);
    }
    catch (err) {
        return error(res, err.message || 'Failed to load dashboard metrics', 500);
    }
};
module.exports = { getDashboardStats };
