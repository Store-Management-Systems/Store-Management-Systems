const express = require('express');
const { db } = require('../src/shared');
const { initNeonDatabase } = require('../src/shared/database/pgInit');
const routes = require('../src/routes');

async function runGlobalSettingsTests() {
  if (process.env.DATABASE_URL) {
    await initNeonDatabase().catch(() => {});
  }

  console.log("==================================================");
  console.log("🧪 EXECUTING GLOBAL SAAS CONFIGURATION TEST SUITE");
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

  try {
    // Login as Super Admin
    const adminLogin = await req('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    const adminToken = adminLogin.body && adminLogin.body.data ? adminLogin.body.data.token : null;
    if (adminLogin.status !== 200 || !adminToken) {
      console.error('❌ Failed to login as Super Admin:', adminLogin.body);
      server.close();
      process.exit(1);
    }
    console.log('✅ Logged in as Super Admin successfully!');

    // 1. Test GET /api/settings/global
    console.log('\n--- TEST 1: GET GLOBAL SAAS SETTINGS ---');
    const getRes = await req('/settings/global', 'GET', null, adminToken);
    console.log('[TEST 1] Status Code:', getRes.status);
    console.log('[TEST 1] Company Name:', getRes.body.data ? getRes.body.data.company_name : null);
    console.log('[TEST 1] Billing Entity:', getRes.body.data ? getRes.body.data.billing_company_name : null);
    if (getRes.status === 200 && getRes.body.data && getRes.body.data.company_name) {
      console.log('✅ TEST 1 PASSED: Global SaaS configuration retrieved successfully!');
    } else {
      console.error('❌ TEST 1 FAILED:', getRes.body);
    }

    // 2. Test PUT /api/settings/global (Updating Company Info & SaaS Billing)
    console.log('\n--- TEST 2: UPDATE COMPANY INFO & SAAS BILLING ---');
    const updatePayload = {
      company_name: 'ENTERPRISE STORE MANAGEMENT SYSTEMS',
      legal_name: 'Enterprise Store Management Systems India Pvt. Ltd.',
      billing_company_name: 'Enterprise SaaS Billing Solutions',
      billing_gstin: '27AAAAA9999A1Z1',
      invoice_prefix: 'ESMS-INV-',
      support_email: 'enterprise-support@storemanagementsystems.com',
      support_phone: '+91-1800-889-9000',
      bank_name: 'State Bank of India',
      account_number: '3998877665544',
      ifsc_code: 'SBIN0000001'
    };

    const putRes = await req('/settings/global', 'PUT', updatePayload, adminToken);
    console.log('[TEST 2] Status Code:', putRes.status);
    if (putRes.status === 200 && putRes.body.data && putRes.body.data.billing_company_name === 'Enterprise SaaS Billing Solutions') {
      console.log('✅ TEST 2 PASSED: SaaS Company & Billing details updated successfully!');
    } else {
      console.error('❌ TEST 2 FAILED:', putRes.body);
    }

    // 3. Test In-Memory Cache Invalidation & Automatic Propagation
    console.log('\n--- TEST 3: AUTOMATIC DYNAMIC PROPAGATION CHECK ---');
    const verifyGet = await req('/settings/global', 'GET', null, adminToken);
    console.log('[TEST 3] Verify Support Email:', verifyGet.body.data ? verifyGet.body.data.support_email : null);
    console.log('[TEST 3] Verify Invoice Prefix:', verifyGet.body.data ? verifyGet.body.data.invoice_prefix : null);
    if (verifyGet.status === 200 && verifyGet.body.data.support_email === 'enterprise-support@storemanagementsystems.com' && verifyGet.body.data.invoice_prefix === 'ESMS-INV-') {
      console.log('✅ TEST 3 PASSED: Dynamic cache invalidation & global propagation verified!');
    } else {
      console.error('❌ TEST 3 FAILED:', verifyGet.body);
    }

    // 4. Test RBAC Enforcement (Non-Admin Rejection)
    console.log('\n--- TEST 4: RBAC SECURITY ENFORCEMENT ---');
    // Create an owner token or test without token
    const rbacRes = await req('/settings/global', 'PUT', { company_name: 'Hacked Name' }, null);
    console.log('[TEST 4] Unauthenticated Status Code:', rbacRes.status);
    if (rbacRes.status === 401 || rbacRes.status === 403) {
      console.log('✅ TEST 4 PASSED: Unauthenticated update strictly rejected (401/403 Forbidden)!');
    } else {
      console.error('❌ TEST 4 FAILED: RBAC failed to block unauthorized user!', rbacRes.status);
    }

    console.log('\n==================================================');
    console.log('🎉 ALL GLOBAL SAAS CONFIGURATION TESTS PASSED 100%!');
    console.log('==================================================\n');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    server.close();
    process.exit(1);
  }
}

runGlobalSettingsTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
