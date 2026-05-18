const http = require('http');

const data = JSON.stringify({
  buyer: { firstName: 'Mock', lastName: 'User', document: '12345678901', email: 'mock@mock.com' },
  value: 100.50,
  referenceId: '12345',
  serviceName: 'Test'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/pix/generate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
