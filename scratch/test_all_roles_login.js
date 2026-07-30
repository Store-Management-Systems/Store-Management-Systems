const { db } = require('../src/shared');
const { initNeonDatabase } = require('../src/shared/database/pgInit');
const bcrypt = require('bcryptjs');
const { login } = require('../src/modules/auth/controllers/authController');
const { createOrganization } = require('../src/modules/organization/controllers/organizationController');
const { createShop, deleteShop } = require('../src/modules/shops/controllers/shopController');

async function runRoleLoginTests() {
    if (process.env.DATABASE_URL) {
        await initNeonDatabase().catch(() => {});
    }

    console.log("==================================================");
    console.log("🧪 EXECUTING COMPREHENSIVE ROLE & AUTHENTICATION TEST SUITE");
    console.log("==================================================\n");

    let allPassed = true;

    const resHelper = () => {
        const r = {
            statusCode: 200,
            responseData: null,
            status(code) { this.statusCode = code; return this; },
            json(data) { this.responseData = data; return this; },
            cookie() { return this; }
        };
        return r;
    };

    // -------------------------------------------------------------
    // TEST 1 — PLATFORM ADMIN LOGIN
    // -------------------------------------------------------------
    console.log("--- TEST 1: PLATFORM ADMIN LOGIN ---");
    const adminReq = { body: { username: 'admin', password: 'admin123' } };
    const adminRes = resHelper();
    await login(adminReq, adminRes);

    console.log(`[TEST 1] Admin Login Status Code: ${adminRes.statusCode}`);
    if (adminRes.statusCode === 200 && adminRes.responseData?.data?.user?.role === 'Admin') {
        console.log("✅ TEST 1 PASSED: Platform Admin logged in successfully without requiring organization_id or branch_id!\n");
    } else {
        console.error("❌ TEST 1 FAILED:", adminRes.responseData);
        allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 2 — OWNER CREATION & OWNER LOGIN
    // -------------------------------------------------------------
    console.log("--- TEST 2: OWNER CREATION & OWNER LOGIN ---");
    const adminUser = adminRes.responseData?.data?.user;
    const testOrgCode = 'RTO-' + Date.now();
    const createOrgReq = {
        user: { id: adminUser.id, role: 'Admin' },
        body: {
            name: 'Role Test Organization',
            code: testOrgCode,
            price_per_branch: 999,
            owner_name: 'Test Owner',
            owner_username: 'test_owner_' + Date.now(),
            owner_password: 'password123'
        }
    };
    const createOrgRes = resHelper();
    await createOrganization(createOrgReq, createOrgRes);

    const orgId = createOrgRes.responseData?.data?.id;
    const ownerId = createOrgRes.responseData?.data?.owner_id;
    const ownerUsername = createOrgReq.body.owner_username;

    // Login as Owner
    const ownerReq = { body: { username: ownerUsername, password: 'password123' } };
    const ownerRes = resHelper();
    await login(ownerReq, ownerRes);

    console.log(`[TEST 2] Owner Login Status Code: ${ownerRes.statusCode}`);
    if (ownerRes.statusCode === 200 && ownerRes.responseData?.data?.user?.role === 'Owner' && ownerRes.responseData?.data?.user?.organization_id === orgId) {
        console.log("✅ TEST 2 PASSED: Owner logged in successfully, resolved organization_id, and accessed Owner scope!\n");
    } else {
        console.error("❌ TEST 2 FAILED:", ownerRes.responseData);
        allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 3 — STAFF LOGIN & BRANCH SCOPE RESOLUTION
    // -------------------------------------------------------------
    console.log("--- TEST 3: BRANCH / STAFF LOGIN ---");
    // Create staff user for HQ branch
    const staffPassHash = bcrypt.hashSync('password123', 10);
    const staffId = 'usr_staff_' + Date.now();
    const staffUsername = 'staff_' + Date.now();
    await db.prepare(`
        INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, organization_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
    `).run(staffId, 'Test Staff', staffUsername, 'staff@store.com', 'password123', staffPassHash, 'Staff', 'shop_default_hq', orgId, 'active');

    const staffReq = { body: { username: staffUsername, password: 'password123' } };
    const staffRes = resHelper();
    await login(staffReq, staffRes);

    console.log(`[TEST 3] Staff Login Status Code: ${staffRes.statusCode}`);
    if (staffRes.statusCode === 200 && staffRes.responseData?.data?.user?.role === 'Staff' && staffRes.responseData?.data?.user?.shop_id === 'shop_default_hq') {
        console.log("✅ TEST 3 PASSED: Staff user logged in successfully and resolved branch context!\n");
    } else {
        console.error("❌ TEST 3 FAILED:", staffRes.responseData);
        allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 4 — INVALID PASSWORD REJECTION
    // -------------------------------------------------------------
    console.log("--- TEST 4: INVALID PASSWORD REJECTION ---");
    const badReq = { body: { username: 'admin', password: 'wrong_password_123' } };
    const badRes = resHelper();
    await login(badReq, badRes);

    console.log(`[TEST 4] Invalid Login Status Code: ${badRes.statusCode}, Message: ${badRes.responseData?.message}`);
    if (badRes.statusCode === 401) {
        console.log("✅ TEST 4 PASSED: Invalid password attempt correctly rejected with 401 Unauthorized!\n");
    } else {
        console.error("❌ TEST 4 FAILED!");
        allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 5 — UNAUTHORIZED TENANT DELETION SECURITY CHECK
    // -------------------------------------------------------------
    console.log("--- TEST 5: UNAUTHORIZED CROSS-TENANT SECURITY CHECK ---");
    // Create Org B
    const createOrgBReq = {
        user: { id: adminUser.id, role: 'Admin' },
        body: {
            name: 'Isolated Org B',
            code: 'RTO-B-' + Date.now(),
            owner_username: 'isolated_owner_b_' + Date.now(),
            owner_password: 'password123'
        }
    };
    const createOrgBRes = resHelper();
    await createOrganization(createOrgBReq, createOrgBRes);
    const orgBId = createOrgBRes.responseData?.data?.id;

    const orgBShop = await db.prepare("SELECT id FROM shops WHERE organization_id = ?").get(orgBId);

    // Attempt to delete Org B's branch using Owner A credentials
    const unauthorizedDelReq = {
        user: { id: ownerId, role: 'Owner', organization_id: orgId },
        params: { id: orgBShop ? orgBShop.id : 'shp_invalid' }
    };
    const unauthorizedDelRes = resHelper();
    await deleteShop(unauthorizedDelReq, unauthorizedDelRes);

    console.log(`[TEST 5] Unauthorized Delete Status Code: ${unauthorizedDelRes.statusCode}, Message: ${unauthorizedDelRes.responseData?.message}`);
    if (unauthorizedDelRes.statusCode === 403) {
        console.log("✅ TEST 5 PASSED: Backend strictly blocked cross-tenant branch deletion attempt with 403 Forbidden!\n");
    } else {
        console.error("❌ TEST 5 FAILED!");
        allPassed = false;
    }

    console.log("==================================================");
    if (allPassed) {
        console.log("🎉 ALL ROLE AUTHENTICATION & SECURITY TESTS PASSED 100%!");
    } else {
        console.error("❌ SOME TESTS FAILED!");
        process.exit(1);
    }
    console.log("==================================================");
}

runRoleLoginTests().catch(err => {
    console.error("Role Test Suite Error:", err);
    process.exit(1);
});
