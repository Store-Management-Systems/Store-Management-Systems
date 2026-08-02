const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../src/shared');
const { initNeonDatabase } = require('../src/shared/database/pgInit');
const routes = require('../src/routes');

async function runSuperAdminAuditTestSuite() {
  if (process.env.DATABASE_URL) {
    await initNeonDatabase().catch(() => {});
  }

  console.log("==================================================");
  console.log("🛡 EXECUTING COMPLETE SUPER ADMIN AUTHENTICATION AUDIT & VERIFICATION SUITE");
  console.log("==================================================\n");

  const app = express();
  app.use(express.json());
  app.use('/api', routes);

  const server = app.listen(0);
  const port = server.address().port;
  console.log(`🚀 Audit Server active on port ${port}...`);

  const req = (path, method = 'GET', data = null, token = null) => {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const u = new URL(`http://localhost:${port}/api` + path);
      const options = {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: method,
        headers: { 'Content-Type': 'application/json' }
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
    // STEP 1 — DATABASE AUDIT OF SUPER ADMIN ACCOUNT
    // -------------------------------------------------------------
    console.log("--- STEP 1: DATABASE AUDIT OF SUPER ADMIN ACCOUNT ---");
    const superAdminRow = await db.prepare("SELECT id, name, username, email, role, status, password_hash FROM users WHERE username = 'admin' OR LOWER(role) LIKE '%admin%'").get();
    console.log('[STEP 1] DB Row Found:', {
      id: superAdminRow?.id,
      name: superAdminRow?.name,
      username: superAdminRow?.username,
      role: superAdminRow?.role,
      status: superAdminRow?.status
    });

    if (superAdminRow && superAdminRow.status === 'active' && ['Admin', 'SUPER_ADMIN', 'Super Admin'].includes(superAdminRow.role)) {
      console.log('✅ STEP 1 PASSED: Super Admin database record is active and properly provisioned!');
    } else {
      console.error('❌ STEP 1 FAILED: Super Admin DB record missing or inactive!', superAdminRow);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // STEP 2 — SUPER ADMIN LOGIN API AUTHENTICATION
    // -------------------------------------------------------------
    console.log("\n--- STEP 2: SUPER ADMIN LOGIN API AUTHENTICATION ---");
    const loginRes = await req('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    console.log('[STEP 2] Status Code:', loginRes.status);
    console.log('[STEP 2] Response Message:', loginRes.body?.message);
    console.log('[STEP 2] JWT Token Issued:', loginRes.body?.data?.token ? 'YES (Bearer JWT)' : 'NO');
    console.log('[STEP 2] User Role in Response:', loginRes.body?.data?.user?.role);

    if (loginRes.status === 200 && loginRes.body?.data?.token && ['Admin', 'SUPER_ADMIN', 'Super Admin'].includes(loginRes.body?.data?.user?.role)) {
      console.log('✅ STEP 2 PASSED: Super Admin logged in successfully with valid session token!');
    } else {
      console.error('❌ STEP 2 FAILED:', loginRes.body);
      allPassed = false;
    }

    const adminToken = loginRes.body?.data?.token;

    // -------------------------------------------------------------
    // STEP 3 — SESSION PERSISTENCE VERIFICATION (/api/auth/me)
    // -------------------------------------------------------------
    console.log("\n--- STEP 3: SESSION PERSISTENCE VERIFICATION ---");
    const meRes = await req('/auth/me', 'GET', null, adminToken);
    console.log('[STEP 3] /api/auth/me Status:', meRes.status);
    console.log('[STEP 3] Authenticated User ID:', meRes.body?.data?.id);
    if (meRes.status === 200 && meRes.body?.data?.username === 'admin') {
      console.log('✅ STEP 3 PASSED: Session persistence verified via JWT token header!');
    } else {
      console.error('❌ STEP 3 FAILED:', meRes.body);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // STEP 4 — SUPER ADMIN UNRESTRICTED DASHBOARD ACCESS
    // -------------------------------------------------------------
    console.log("\n--- STEP 4: SUPER ADMIN UNRESTRICTED DASHBOARD ACCESS ---");
    const orgsRes = await req('/organizations', 'GET', null, adminToken);
    const subsRes = await req('/subscriptions', 'GET', null, adminToken);
    const settingsRes = await req('/settings/global', 'GET', null, adminToken);

    console.log('[STEP 4] GET /api/organizations Status:', orgsRes.status);
    console.log('[STEP 4] GET /api/subscriptions Status:', subsRes.status);
    console.log('[STEP 4] GET /api/settings/global Status:', settingsRes.status);

    if (orgsRes.status === 200 && subsRes.status === 200 && settingsRes.status === 200) {
      console.log('✅ STEP 4 PASSED: Super Admin has unrestricted access to all Admin Dashboard modules!');
    } else {
      console.error('❌ STEP 4 FAILED: Restricted access for Super Admin!');
      allPassed = false;
    }

    // -------------------------------------------------------------
    // STEP 5 — ROLE EQUIVALENCY PARITY (Admin / SUPER_ADMIN)
    // -------------------------------------------------------------
    console.log("\n--- STEP 5: SUPER ADMIN ROLE EQUIVALENCY PARITY ---");
    // Test creating a user with role = 'SUPER_ADMIN' and verify authentication & middleware access
    const saPass = 'superadminpass123';
    const saHash = bcrypt.hashSync(saPass, 10);
    const saId = 'usr_sa_test_' + Date.now();
    const saUsername = 'sa_test_' + Date.now();

    await db.prepare(`
      INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(saId, 'Test SUPER_ADMIN', saUsername, 'sa@test.com', saPass, saHash, 'SUPER_ADMIN', 'shop_default_hq', 'active');

    const saLoginRes = await req('/auth/login', 'POST', { username: saUsername, password: saPass });
    console.log('[STEP 5] SUPER_ADMIN Role Login Status:', saLoginRes.status);
    const saToken = saLoginRes.body?.data?.token;

    const saAccessRes = await req('/settings/global', 'GET', null, saToken);
    console.log('[STEP 5] SUPER_ADMIN Role Global Settings Access Status:', saAccessRes.status);

    if (saLoginRes.status === 200 && saAccessRes.status === 200) {
      console.log('✅ STEP 5 PASSED: SUPER_ADMIN role variant operates with full Super Admin privileges!');
    } else {
      console.error('❌ STEP 5 FAILED:', saLoginRes.body, saAccessRes.body);
      allPassed = false;
    }

    console.log('\n==================================================');
    if (allPassed) {
      console.log('🎉 ALL SUPER ADMIN AUTHENTICATION AUDIT TESTS PASSED 100%!');
    } else {
      console.error('❌ SOME AUDIT TESTS FAILED');
    }
    console.log('==================================================\n');

    server.close();
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Audit execution error:', err);
    server.close();
    process.exit(1);
  }
}

runSuperAdminAuditTestSuite().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
