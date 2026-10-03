import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
const output=resolve('scratch/rewards-ui-preview');
await mkdir(output,{recursive:true});
await build({entryPoints:['scratch/rewards-ui-preview.tsx'],bundle:true,outfile:resolve(output,'preview.js'),format:'esm',jsx:'automatic',
    define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_QG_WEB_COMMERCE_SALES_RELEASE_READY':'"true"'},
    plugins:[{name:'isolated-ui-data',setup(b){b.onResolve({filter:/(dailyLoginRewards|stripeMembership|currentAccountTerms|rankedRefundBalance|useCircuitAccess|circuitAccess|useAppPlatform)$|^next\/link$/},()=>({path:resolve('scratch/rewards-ui-mocks.tsx')}));}}]});
const css=await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'),{from:resolve('src/app/globals.css')});
await writeFile(resolve(output,'utilities.css'),css.css);
const html='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Q-Gambit Rewards UI · LOCAL QA</title><link rel="stylesheet" href="/utilities.css"><link rel="stylesheet" href="/preview.css"><style>body{background:#121710;color:#e5e3d7}select{background:#252a21;color:#fff;padding:8px}button,summary{cursor:pointer}</style><div id="root"></div><script type="module" src="/preview.js"></script></html>';
const routes={'/preview.js':['preview.js','text/javascript'],'/preview.css':['preview.css','text/css'],'/utilities.css':['utilities.css','text/css']};
createServer(async(req,res)=>{
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; form-action 'none'");
    if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
    const route=routes[path];if(!route){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',route[1]);res.end(await readFile(resolve(output,route[0])));
}).listen(4192,'127.0.0.1',()=>console.log('Isolated rewards UI: http://127.0.0.1:4192/ (no external requests or mutations)'));
