const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.options('/test', (req, res) => res.end());
app.post('/test', (req, res) => res.json({ok:true}));
const server = app.listen(0, () => {
    const port = server.address().port;
    const http = require('http');
    const req = http.request({
        port, path: '/test', method: 'OPTIONS',
        headers: {
            'Origin': 'http://example.com',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'x-qg-protocol, x-qg-platform, x-qg-build, content-type'
        }
    }, res => {
        console.log('Headers:', res.headers);
        server.close();
    });
    req.end();
});
