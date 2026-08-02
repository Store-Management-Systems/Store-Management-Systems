const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../src/shared');
const { initNeonDatabase } = require('../src/shared/database/pgInit');
const routes = require('../src/routes');

async function runLoginRecoveryTestSuite() {
  if (process.env.DATABASE_URL) {
    await initNeonDatabase().catch(() => {});
  }

  console.log("==================================================");
  console.log("🔑 EXECUTING CRITICAL AUTHENTICATION & LOGIN RECOVERY TEST SUITE");
  console.log("==================================================\n");

  const app = express();
  app.use(express.json());
  app.use('/api', routes);

  const server = app.listen(0);
  const port = server.address().port;
  console.log(`🚀 Test Express Server running on port ${port}...`);

  const req = (path, method = 'GET', data = null, token = null) => {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const u = new URL(`http://localhost:${port}/api` + path);
      const options = {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      if (token) options.headers['Authorization'] = 'Bearer ' + token;

      const r = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch(e) {
            resolve({ status: res.statusCode, body });
          }
        });
      });
      r.on('error', reject);
      if (data) r.write(JSON.stringify(data));
      r.end();
    });
  };

  let allPassed = true;

  try {
    // -------------------------------------------------------------
    // TEST 1 — SUPER ADMIN LOGIN
    // -------------------------------------------------------------
    console.log("--- TEST 1: SUPER ADMIN LOGIN ---");
    const adminLogin = await req('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    console.log('[TEST 1] Admin Login Status:', adminLogin.status);
    console.log('[TEST 1] Returned User Role:', adminLogin.body?.data?.user?.role);
    if (adminLogin.status === 200 && adminLogin.body?.data?.token && adminLogin.body?.data?.user?.role === 'Admin') {
      console.log('✅ TEST 1 PASSED: Super Admin logged in successfully with valid JWT token!');
    } else {
      console.error('❌ TEST 1 FAILED:', adminLogin.body);
      allPassed = false;
    }

    const adminToken = adminLogin.body?.data?.token;

    // -------------------------------------------------------------
    // TEST 2 — GET CURRENT USER SESSION (/api/auth/me)
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: GET CURRENT USER SESSION (/api/auth/me) ---");
    const meRes = await req('/auth/me', 'GET', null, adminToken);
    console.log('[TEST 2] Auth Me Status:', meRes.status);
    console.log('[TEST 2] Auth Me Username:', meRes.body?.data?.username);
    if (meRes.status === 200 && meRes.body?.data?.username === 'admin') {
      console.log('✅ TEST 2 PASSED: /api/auth/me retrieved authenticated user session perfectly!');
    } else {
      console.error('❌ TEST 2 FAILED:', meRes.body);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 3 — CREATE ORG & OWNER LOGIN
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: ORGANIZATION OWNER LOGIN ---");
    const testOrgCode = 'LOG-' + Date.now();
    const ownerUsername = 'owner_' + Date.now();
    const ownerPass = 'ownerpass123';
    const ownerHash = bcrypt.hashSync(ownerPass, 10);
    const orgId = 'org_' + Date.now();
    const ownerId = 'usr_owner_' + Date.now();
    const shopId = 'shp_owner_' + Date.now();

    await db.prepare(`
      INSERT INTO shops (id, shop_name, shop_code, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(shopId, 'Owner Test HQ', 'HQ-' + Date.now(), 'active');

    await db.prepare(`
      INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, organization_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(ownerId, 'Test Org Owner', ownerUsername, 'owner@test.com', ownerPass, ownerHash, 'Owner', shopId, orgId, 'active');

    const ownerLogin = await req('/auth/login', 'POST', { username: ownerUsername, password: ownerPass });
    console.log('[TEST 3] Owner Login Status:', ownerLogin.status);
    console.log('[TEST 3] Owner Role:', ownerLogin.body?.data?.user?.role);
    if (ownerLogin.status === 200 && ownerLogin.body?.data?.token && ownerLogin.body?.data?.user?.role === 'Owner') {
      console.log('✅ TEST 3 PASSED: Organization Owner logged in successfully!');
    } else {
      console.error('❌ TEST 3 FAILED:', ownerLogin.body);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 4 — STAFF & CASHIER USERS LOGIN
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: STAFF & CASHIER ROLES LOGIN ---");
    const staffUsername = 'staff_' + Date.now();
    const staffPass = 'staffpass123';
    const staffHash = bcrypt.hashSync(staffPass, 10);
    const staffId = 'usr_staff_' + Date.now();

    await db.prepare(`
      INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, organization_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(staffId, 'Test Staff', staffUsername, 'staff@test.com', staffPass, staffHash, 'Staff', shopId, orgId, 'active');

    const staffLogin = await req('/auth/login', 'POST', { username: staffUsername, password: staffPass });
    console.log('[TEST 4] Staff Login Status:', staffLogin.status);
    console.log('[TEST 4] Staff Role:', staffLogin.body?.data?.user?.role);
    if (staffLogin.status === 200 && staffLogin.body?.data?.token && staffLogin.body?.data?.user?.role === 'Staff') {
      console.log('✅ TEST 4 PASSED: Staff user logged in successfully!');
    } else {
      console.error('❌ TEST 4 FAILED:', staffLogin.body);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 5 — INVALID PASSWORD REJECTION SECURITY
    // -------------------------------------------------------------
    console.log("\n--- TEST 5: INVALID PASSWORD REJECTION SECURITY ---");
    const badLogin = await req('/auth/login', 'POST', { username: ownerUsername, password: 'wrongpassword' });
    console.log('[TEST 5] Invalid Password Status Code:', badLogin.status);
    if (badLogin.status === 401 && badLogin.body?.success === false) {
      console.log('✅ TEST 5 PASSED: Invalid password strictly rejected with 401 Unauthorized!');
    } else {
      console.error('❌ TEST 5 FAILED: Bad password was not rejected cleanly!', badLogin.body);
      allPassed = false;
    }

    console.log('\n==================================================');
    if (allPassed) {
      console.log('🎉 ALL LOGIN RECOVERY & ROLES AUTHENTICATION TESTS PASSED 100%!');
    } else {
      console.error('❌ SOME TESTS FAILED');
    }
    console.log('==================================================\n');
    server.close();
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Test execution error:', err);
    server.close();
    process.exit(1);
  }
}

runLoginRecoveryTestSuite().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
