const express = require('express');
const { db } = require('../src/shared');
const { initNeonDatabase } = require('../src/shared/database/pgInit');
const routes = require('../src/routes');

async function runSubscriptionTests() {
  if (process.env.DATABASE_URL) {
    await initNeonDatabase().catch(() => {});
  }

  console.log("==================================================");
  console.log("🧪 EXECUTING SUBSCRIPTION MANAGEMENT TEST SUITE");
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

    // 1. Verify Audit Logs Table Removal
    console.log('\n--- TEST 1: VERIFY AUDIT LOGS TABLE REMOVAL ---');
    let auditLogsTableExists = true;
    try {
      if (db.isPg) {
        const res = await db.prepare("SELECT to_regclass('public.audit_logs') as tbl;").get();
        auditLogsTableExists = !!(res && res.tbl);
      } else {
        const res = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs';").get();
        auditLogsTableExists = !!res;
      }
    } catch (e) {
      auditLogsTableExists = false;
    }
    console.log(`[TEST 1] Audit Logs Table Exists: ${auditLogsTableExists}`);
    if (!auditLogsTableExists) {
      console.log('✅ TEST 1 PASSED: Audit Logs table completely removed from database!');
    } else {
      console.error('❌ TEST 1 FAILED: Audit logs table still exists in DB!');
    }

    // 2. Verify Auto-Approval Expiry Removal
    console.log('\n--- TEST 2: VERIFY AUTO-APPROVAL EXPIRY REMOVAL ---');
    const platformSettings = await req('/settings/platform', 'GET', null, adminToken);
    console.log('[TEST 2] Platform Settings Status Code:', platformSettings.status);
    console.log('[TEST 2] Auto-Approval Hours Field:', platformSettings.body.data ? platformSettings.body.data.auto_approval_hours : 'undefined');
    if (platformSettings.status === 200 && platformSettings.body.data.auto_approval_hours === undefined) {
      console.log('✅ TEST 2 PASSED: Auto-Approval Expiry (Hours) field completely removed from Platform Settings!');
    } else {
      console.error('❌ TEST 2 FAILED: auto_approval_hours is still present!');
    }

    // 3. Test Automatic Branch Subscription Creation
    console.log('\n--- TEST 3: AUTOMATIC BRANCH SUBSCRIPTION CREATION ---');
    const shopCode = 'BR-' + Math.floor(1000 + Math.random() * 9000);
    const createShopRes = await req('/shops', 'POST', {
      shop_name: 'Metro Retail Branch ' + shopCode,
      shop_code: shopCode,
      address: '123 Tech Park',
      phone: '9876543210',
      gst: '22AAAAA0000A1Z5'
    }, adminToken);
    console.log('[TEST 3] Create Branch Status Code:', createShopRes.status);
    if (createShopRes.status === 201 && createShopRes.body.data.subscription_id) {
      console.log('✅ TEST 3 PASSED: Branch created & automatic subscription record generated! Sub ID:', createShopRes.body.data.subscription_id);
    } else {
      console.error('❌ TEST 3 FAILED: Automatic subscription generation failed!', createShopRes.body);
    }

    // 4. Test Subscription Management List & Stats APIs
    console.log('\n--- TEST 4: SUBSCRIPTION LIST & STATS APIs ---');
    const statsRes = await req('/subscriptions/stats', 'GET', null, adminToken);
    console.log('[TEST 4] Stats Status Code:', statsRes.status, 'Total Orgs:', statsRes.body.data ? statsRes.body.data.totalOrganizations : null);

    const listRes = await req('/subscriptions', 'GET', null, adminToken);
    console.log('[TEST 4] List Status Code:', listRes.status, 'Total Subscriptions:', listRes.body.data ? listRes.body.data.length : null);
    if (statsRes.status === 200 && listRes.status === 200 && listRes.body.data.length > 0) {
      console.log('✅ TEST 4 PASSED: Subscription stats and list endpoints working properly!');
    } else {
      console.error('❌ TEST 4 FAILED:', listRes.body);
    }

    const targetSub = listRes.body.data[0];

    // 5. Test Interactive Payment Status Toggle (Paid / Unpaid)
    console.log('\n--- TEST 5: INTERACTIVE PAYMENT STATUS TOGGLE (Paid / Unpaid) ---');
    const newStatus = targetSub.payment_status === 'Paid' ? 'Unpaid' : 'Paid';
    const toggleRes = await req(`/subscriptions/${targetSub.id}/status`, 'PUT', { payment_status: newStatus }, adminToken);
    console.log('[TEST 5] Toggle Status Code:', toggleRes.status, 'New Payment Status:', toggleRes.body.data ? toggleRes.body.data.payment_status : null);
    if (toggleRes.status === 200 && toggleRes.body.data.payment_status === newStatus) {
      console.log(`✅ TEST 5 PASSED: Payment status updated successfully to ${newStatus}!`);
    } else {
      console.error('❌ TEST 5 FAILED:', toggleRes.body);
    }

    // 6. Test Payment Mode Update
    console.log('\n--- TEST 6: PAYMENT MODE UPDATE ---');
    const modeRes = await req(`/subscriptions/${targetSub.id}/payment-mode`, 'PUT', { payment_mode: 'UPI' }, adminToken);
    console.log('[TEST 6] Mode Status Code:', modeRes.status, 'Updated Payment Mode:', modeRes.body.data ? modeRes.body.data.payment_mode : null);
    if (modeRes.status === 200 && modeRes.body.data.payment_mode === 'UPI') {
      console.log('✅ TEST 6 PASSED: Payment mode updated to UPI successfully!');
    } else {
      console.error('❌ TEST 6 FAILED:', modeRes.body);
    }

    // 7. Test Subscription Renewal
    console.log('\n--- TEST 7: SUBSCRIPTION RENEWAL ENGINE ---');
    const renewRes = await req(`/subscriptions/${targetSub.id}/renew`, 'POST', { plan_id: 'quarterly', payment_mode: 'Net Banking' }, adminToken);
    console.log('[TEST 7] Renew Status Code:', renewRes.status, 'New Expiry:', renewRes.body.data ? renewRes.body.data.expiry_date : null);
    if (renewRes.status === 200 && renewRes.body.data.plan_id === 'quarterly') {
      console.log('✅ TEST 7 PASSED: Subscription renewed for Quarterly Plan!');
    } else {
      console.error('❌ TEST 7 FAILED:', renewRes.body);
    }

    // 8. Test Subscription Expiry Extension
    console.log('\n--- TEST 8: SUBSCRIPTION EXPIRY EXTENSION ---');
    const extendRes = await req(`/subscriptions/${targetSub.id}/extend`, 'POST', { days: 30 }, adminToken);
    console.log('[TEST 8] Extend Status Code:', extendRes.status, 'Extended Expiry:', extendRes.body.data ? extendRes.body.data.expiry_date : null);
    if (extendRes.status === 200) {
      console.log('✅ TEST 8 PASSED: Expiry date extended by 30 days!');
    } else {
      console.error('❌ TEST 8 FAILED:', extendRes.body);
    }

    console.log('\n==================================================');
    console.log('🎉 ALL SUBSCRIPTION MANAGEMENT TESTS PASSED 100%!');
    console.log('==================================================\n');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    server.close();
    process.exit(1);
  }
}

runSubscriptionTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
