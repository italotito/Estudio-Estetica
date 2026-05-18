const http = require('http');

const data = JSON.stringify({
  pix: [
    {
      txid: 'MOCK-TXID-1772806451801', // MUST REPLACE THIS ON THE FLY OR TEST FILE
      valor: '100.50',
      horario: new Date().toISOString()
    }
  ]
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/pix/webhook',
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
