import { createServer } from 'vite';
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:4193,strictPort:true},
    plugins:[{name:'ranked-fix-qa',configureServer(s){s.middlewares.use(async(req,res,next)=>{
        if(req.url!=='/')return next();
        const html='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Q-Gambit Ranked Fix · LOCAL QA</title><style>body{background:#161513;color:#E8E2D7}button{cursor:pointer;padding:12px}</style><div id="root"></div><script type="module" src="/scratch/ranked-fix-preview.tsx"></script></html>';
        res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self' ws://127.0.0.1:4193; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; form-action 'none'");
        res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await s.transformIndexHtml(req.url,html));
    });}}]});
await server.listen();console.log('Local-only ranked UI: http://127.0.0.1:4193/');
