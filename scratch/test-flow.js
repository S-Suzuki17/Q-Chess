const https = require('https');
function testFlow(username, password) {
    const data = JSON.stringify({ username, password });
    const req = https.request('https://q-chess.onrender.com/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-Client-Build': 'test', 'X-Client-Platform': 'web' }
    }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
            console.log('Register Response:', res.statusCode, body);
            if (res.statusCode === 201) {
                const req2 = https.request('https://q-chess.onrender.com/auth/ranked-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-Client-Build': 'test', 'X-Client-Platform': 'web' }
                }, res2 => {
                    let body2 = '';
                    res2.on('data', d => body2 += d);
                    res2.on('end', () => console.log('Login Response:', res2.statusCode, body2));
                });
                req2.write(data);
                req2.end();
            }
        });
    });
    req.write(data);
    req.end();
}
testFlow('testflow' + Math.floor(Math.random()*10000), 'VeryStrong123456!');
