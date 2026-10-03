const https = require('https');
function attemptRegister(username, password) {
    const data = JSON.stringify({ username, password });
    const req = https.request('https://q-chess.onrender.com/auth/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'X-Client-Build': 'test',
            'X-Client-Platform': 'web'
        }
    }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => console.log('Response:', res.statusCode, body));
    });
    req.write(data);
    req.end();
}
attemptRegister('testuser' + Math.floor(Math.random()*10000), 'VeryStrong123456!');
