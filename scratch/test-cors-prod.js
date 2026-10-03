const https = require('https');
const req = https.request('https://q-chess.onrender.com/auth/register', {
    method: 'OPTIONS',
    headers: {
        'Origin': 'https://q-gambit.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, x-qg-build, x-qg-platform, x-qg-protocol'
    }
}, res => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', res.headers);
});
req.end();
