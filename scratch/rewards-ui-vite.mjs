import { createServer } from 'vite';
import { resolve } from 'node:path';
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:4192,strictPort:true},
    define:{'process.env.NEXT_PUBLIC_QG_WEB_COMMERCE_SALES_RELEASE_READY':'"true"'},
    resolve:{alias:[{find:/^.*\/(dailyLoginRewards|stripeMembership|currentAccountTerms|rankedRefundBalance|useCircuitAccess|circuitAccess|useAppPlatform)$|^next\/link$/,replacement:resolve('scratch/rewards-ui-mocks.tsx')}]},
    plugins:[{name:'isolated-ui-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
        if(new URL(req.url,'http://127.0.0.1').pathname!=='/')return next();
        const html='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Q-Gambit Rewards UI · LOCAL QA</title><style>body{background:#121710;color:#e5e3d7}select{background:#252a21;color:#fff;padding:8px}button,summary{cursor:pointer}</style><div id="root"></div><script type="module" src="/scratch/rewards-ui-preview.tsx"></script></html>';
        res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self' ws://127.0.0.1:4192; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; form-action 'none'");
        res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await s.transformIndexHtml(req.url,html));
    });}}]});
await server.listen();console.log('Isolated rewards UI: http://127.0.0.1:4192/ (synthetic data; no production mutations)');
