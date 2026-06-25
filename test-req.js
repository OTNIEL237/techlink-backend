const http = require('http');

const data = JSON.stringify({
  technicianId: "8d068afe-3cac-4afc-a13c-3f6e3f4978f6",
  subscriptionType: "yearly",
  technicianData: {
    name: "test",
    phone: "237671234567",
    email: "test@test.com"
  }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/subscriptions/initialize',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', d => {
    body += d;
  });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', body);
  });
});

req.on('error', error => {
  console.error('Error:', error);
});

req.write(data);
req.end();
