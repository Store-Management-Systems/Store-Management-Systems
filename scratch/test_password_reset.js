const { db } = require('../src/shared');
const { initNeonDatabase } = require('../src/shared/database/pgInit');
const bcrypt = require('bcryptjs');
const { login, changePasswordForced } = require('../src/modules/auth/controllers/authController');
const { resetPassword, searchUsersForReset, createUser } = require('../src/modules/users/controllers/userController');
const { createOrganization } = require('../src/modules/organization/controllers/organizationController');

async function runPasswordResetAndApprovalTests() {
    if (process.env.DATABASE_URL) {
        await initNeonDatabase().catch(() => {});
    }

    console.log("==================================================");
    console.log("🧪 EXECUTING GLOBAL PASSWORD RESET & APPROVAL REMOVAL TEST SUITE");
    console.log("==================================================\n");

    let allPassed = true;

    const resHelper = () => {
        return {
            statusCode: 200,
            responseData: null,
            status(code) { this.statusCode = code; return this; },
            json(data) { this.responseData = data; return this; },
            cookie() { return this; }
        };
    };

    // -------------------------------------------------------------
    // TEST 1 — SUPER ADMIN RESETS ANY USER PASSWORD
    // -------------------------------------------------------------
    console.log("--- TEST 1: SUPER ADMIN PASSWORD RESET ---");
    // Create a target user
    const targetUserId = 'usr_target_' + Date.now();
    const targetUsername = 'target_user_' + Date.now();
    const targetPassHash = bcrypt.hashSync('old_password_123', 10);
    await db.prepare(`
        INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, organization_id, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Staff', 'shop_default_hq', 'org_default_hq', 'active')
    `).run(targetUserId, 'Target Staff User', targetUsername, 'target@test.com', 'old_password_123', targetPassHash);

    const adminReq = {
        user: { id: 'usr_super_admin', role: 'Admin' },
        params: { id: targetUserId },
        body: { generateTemp: true, forceChangeNextLogin: true }
    };
    const adminRes = resHelper();
    await resetPassword(adminReq, adminRes);

    console.log(`[TEST 1] Admin Reset Status Code: ${adminRes.statusCode}`);
    if (adminRes.statusCode === 200 && adminRes.responseData?.data?.temporaryPassword) {
        const tempPass = adminRes.responseData.data.temporaryPassword;
        console.log(`✅ TEST 1 PASSED: Super Admin reset password successfully! Temp password: ${tempPass}\n`);
    } else {
        console.error("❌ TEST 1 FAILED:", adminRes.responseData);
        allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 2 — FORCED PASSWORD CHANGE ON NEXT LOGIN
    // -------------------------------------------------------------
    console.log("--- TEST 2: FORCED PASSWORD CHANGE ENFORCEMENT ---");
    const tempPass = adminRes.responseData?.data?.temporaryPassword;
    const loginReq = { body: { username: targetUsername, password: tempPass } };
    const loginRes = resHelper();
    await login(loginReq, loginRes);

    const loggedUser = loginRes.responseData?.data?.user;
    console.log(`[TEST 2] Login Status Code: ${loginRes.statusCode}, Force Flag: ${loggedUser?.force_password_change}`);
    if (loginRes.statusCode === 200 && loggedUser?.force_password_change === 1) {
        // Now perform forced password update
        const forcedReq = {
            user: { id: targetUserId },
            body: { newPassword: 'new_secure_password_456' }
        };
        const forcedRes = resHelper();
        await changePasswordForced(forcedReq, forcedRes);

        const updatedDbUser = await db.prepare("SELECT force_password_change FROM users WHERE id = ?").get(targetUserId);
        if (forcedRes.statusCode === 200 && updatedDbUser.force_password_change === 0) {
            console.log("✅ TEST 2 PASSED: Forced password change successfully executed and flag cleared!\n");
        } else {
            console.error("❌ TEST 2 FAILED:", forcedRes.responseData);
            allPassed = false;
        }
    } else {
        console.error("❌ TEST 2 LOGIN FAILED:", loginRes.responseData);
        allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 3 — OWNER SCOPE LIMITATIONS & CROSS-ORG REJECTION
    // -------------------------------------------------------------
    console.log("--- TEST 3: OWNER SCOPE & CROSS-ORG RBAC REJECTION ---");
    // Create Org A and Org B
    const uniqueTime = Date.now();
    const orgAReq = {
        user: { id: 'usr_super_admin', role: 'Admin' },
        body: { name: 'Reset Org A', code: 'ROA-' + uniqueTime, owner_username: 'roa_owner_' + uniqueTime, owner_password: 'password123' }
    };
    const orgARes = resHelper();
    await createOrganization(orgAReq, orgARes);
    const orgAId = orgARes.responseData?.data?.id;
    const ownerAId = orgARes.responseData?.data?.owner_id;

    const orgBReq = {
        user: { id: 'usr_super_admin', role: 'Admin' },
        body: { name: 'Reset Org B', code: 'ROB-' + uniqueTime, owner_username: 'rob_owner_' + uniqueTime, owner_password: 'password123' }
    };
    const orgBRes = resHelper();
    await createOrganization(orgBReq, orgBRes);
    const orgBId = orgBRes.responseData?.data?.id;
    const ownerBId = orgBRes.responseData?.data?.owner_id;

    // Owner A attempts to reset Owner B password -> MUST BE REJECTED (403)
    const unauthorizedResetReq = {
        user: { id: ownerAId, role: 'Owner', organization_id: orgAId },
        params: { id: ownerBId },
        body: { newPassword: 'unauthorized_pass' }
    };
    const unauthorizedResetRes = resHelper();
    await resetPassword(unauthorizedResetReq, unauthorizedResetRes);

    console.log(`[TEST 3] Unauthorized Reset Status Code: ${unauthorizedResetRes.statusCode}, Message: ${unauthorizedResetRes.responseData?.message}`);
    if (unauthorizedResetRes.statusCode === 403) {
        console.log("✅ TEST 3 PASSED: Owner strictly blocked from resetting password of another organization's user (403 Forbidden)!\n");
    } else {
        console.error("❌ TEST 3 FAILED!");
        allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 4 — USER CREATION DIRECTLY ACTIVE (NO APPROVAL CREATION)
    // -------------------------------------------------------------
    console.log("--- TEST 4: USER CREATION DIRECTLY ACTIVE ---");
    const createStaffReq = {
        user: { id: ownerAId, role: 'Owner', organization_id: orgAId, shop_id: 'shp_default' },
        body: { name: 'Direct Staff', username: 'direct_staff_' + uniqueTime, password: 'password123', role: 'Staff' }
    };
    const createStaffRes = resHelper();
    await createUser(createStaffReq, createStaffRes);

    const createdStaffId = createStaffRes.responseData?.data?.id;
    const createdStaffUser = await db.prepare("SELECT status FROM users WHERE id = ?").get(createdStaffId);
    console.log(`[TEST 4] Created User Status Code: ${createStaffRes.statusCode}, Status: ${createdStaffUser?.status}`);

    if (createStaffRes.statusCode === 201 && createdStaffUser?.status === 'active') {
        console.log("✅ TEST 4 PASSED: User created directly as 'active' without pending_approval state!\n");
    } else {
        console.error("❌ TEST 4 FAILED:", createStaffRes.responseData);
        allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 5 — VERIFY ZERO APPROVAL TABLES REMAIN
    // -------------------------------------------------------------
    console.log("--- TEST 5: VERIFY APPROVALS TABLE REMOVAL ---");
    let tableExists = true;
    try {
        await db.prepare("SELECT COUNT(*) FROM approvals").get();
    } catch (e) {
        tableExists = false;
    }

    console.log(`[TEST 5] Approvals Table Exists: ${tableExists}`);
    if (!tableExists) {
        console.log("✅ TEST 5 PASSED: Approvals table completely removed from database schema!\n");
    } else {
        console.error("❌ TEST 5 FAILED: Approvals table still exists in DB!");
        allPassed = false;
    }

    console.log("==================================================");
    if (allPassed) {
        console.log("🎉 ALL PASSWORD RESET & APPROVAL REMOVAL TESTS PASSED 100%!");
    } else {
        console.error("❌ SOME TESTS FAILED!");
        process.exit(1);
    }
    console.log("==================================================");
}

runPasswordResetAndApprovalTests().catch(err => {
    console.error("Test Suite Error:", err);
    process.exit(1);
});
