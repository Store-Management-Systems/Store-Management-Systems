const http = require('http');

function testLogin(username, password) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ username, password });
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', err => resolve({ status: 500, error: err.message }));
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("Testing login on localhost:3000...");
  const adminRes = await testLogin('admin', 'admin123');
  console.log("Admin Login Result:", adminRes);

  const pkpRes = await testLogin('pkp', 'admin123');
  console.log("PKP Login Result:", pkpRes);
}

run();
