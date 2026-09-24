import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'out');
const port = Number(process.argv[3] || 4184);
const mime = { '.html':'text/html; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.woff2':'font/woff2', '.glb':'model/gltf-binary' };
http.createServer((req, res) => {
    try {
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        let file = path.resolve(root, '.' + pathname);
        if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
        const size = statSync(file).size;
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
        const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
        res.writeHead(range ? 206 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges':'bytes', 'Cache-Control':'no-store', ...(range ? {'Content-Range':`bytes ${start}-${end}/${size}`} : {}) });
        if (req.method === 'HEAD') { res.end(); return; }
        createReadStream(file, { start, end }).pipe(res);
    } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Static export: http://127.0.0.1:${port}`));
