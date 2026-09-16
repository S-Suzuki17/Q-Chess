import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve,sep,extname } from 'node:path';
const root=resolve('out');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.webmanifest':'application/manifest+json'};
const server=createServer(async(request,response)=>{
    try {
        let path=resolve(root,`.${decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname)}`);
        if(path!==root&&!path.startsWith(root+sep)) {response.writeHead(403).end();return;}
        const info=await stat(path);
        if(info.isDirectory()) path=resolve(path,'index.html');
        response.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
        createReadStream(path).on('error',()=>response.destroy()).pipe(response);
    } catch {response.writeHead(404).end('Not found');}
});
server.listen(3101,'127.0.0.1',()=>console.log('Local export preview: http://127.0.0.1:3101'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
