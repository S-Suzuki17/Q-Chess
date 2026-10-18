import {createServer,build} from 'vite';
import {createServer as createHttpServer} from 'node:http';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import tailwind from '@tailwindcss/postcss';
import fontBinding from './bind-fixture-fonts.cjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const fixture=resolve(root,'scripts/qa/fixtures/secondary-screens');
const stateStub=resolve(root,'scripts/qa/fixtures/castle-quest/stubs.tsx');
function fixtureOptions(){
 return {configFile:false,root:fixture,publicDir:resolve(root,'public'),cacheDir:resolve(root,'scratch/secondary-screens-vite-'+process.pid),
  esbuild:{jsx:'automatic'},resolve:{alias:[
   {find:'@',replacement:resolve(root,'src')},
   {find:'next/link',replacement:resolve(fixture,'link.tsx')},
   ...['useCampaignProgress','useCircuitAccess'].map(name=>({find:new RegExp(`^\\.\\./hooks/${name}$`),replacement:stateStub})),
   ...['circuitAccess','stripeMembership','crownAdmission','adPolicy'].map(name=>({find:new RegExp(`^\\.\\./lib/${name}$`),replacement:stateStub})),
   {find:/^\.\.\/config\/crownAdmission$/,replacement:stateStub},{find:/^\.\/LocalGameBoard$/,replacement:stateStub},
   {find:/^\.\.\/lib\/nativeRewards$/,replacement:resolve(fixture,'native-rewards.ts')},
   {find:/^\.\.\/lib\/localGame$/,replacement:resolve(fixture,'local-game.ts')},
  ]},define:{'process.env.NEXT_PUBLIC_SERVER_URL':JSON.stringify('http://127.0.0.1:19999'),'process.env':{}},
  optimizeDeps:{include:['react','react-dom/client','lucide-react']},css:{postcss:{plugins:[tailwind({base:root})]}},
 };
}

/** Compile once for sequential language/lesson checks without HMR or repeated optimization. */
export async function buildSecondaryScreensFixture(directory){
 if(!process.env.QG_TEST_FONT_EXPORT)throw new Error('Set QG_TEST_FONT_EXPORT to a saved Next export so browser acceptance uses the actual fonts.');
 await mkdir(directory,{recursive:true});
 if((await readdir(directory)).length)throw new Error('Choose an empty fixture output directory; existing files are preserved.');
 await build({...fixtureOptions(),build:{outDir:directory,emptyOutDir:false,copyPublicDir:false,reportCompressedSize:false}});
 const fonts=fontBinding.bindFixtureFonts(directory,resolve(process.env.QG_TEST_FONT_EXPORT));
 console.log(`Bound ${fonts.fontFiles.length} actual exported font files to the fixture.`);
}

async function staticFixture(directory,port){
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.glb':'model/gltf-binary','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
 const http=createHttpServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400);res.end();return;}
  if(pathname==='/')pathname='/index.html';
  for(const source of [directory,resolve(root,'public')]){
   const file=resolve(source,'.'+pathname);
   if(!file.startsWith(source+sep))continue;
   try{
    const data=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream','cache-control':'no-store'});
    res.end(req.method==='HEAD'?undefined:data);return;
   }catch(error){if(!['ENOENT','ENOTDIR','EISDIR'].includes(error.code)){res.writeHead(500);res.end();return;}}
  }
  res.writeHead(404);res.end();
 });
 await new Promise(done=>http.listen(port,'127.0.0.1',done));
 return {base:`http://127.0.0.1:${http.address().port}`,server:{close:()=>new Promise((done,reject)=>{http.close(error=>error?reject(error):done());http.closeAllConnections();})}};
}

export async function startSecondaryScreensFixture(port=0){
 if(process.env.QG_TEST_SECONDARY_STATIC)return staticFixture(resolve(process.env.QG_TEST_SECONDARY_STATIC),port);
 const server=await createServer({...fixtureOptions(),server:{host:'127.0.0.1',port,fs:{allow:[root]}}});
 await server.listen();return{server,base:`http://127.0.0.1:${server.httpServer.address().port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='--build')await buildSecondaryScreensFixture(resolve(process.argv[3]??'scratch/secondary-screens-static'));
 else{const {base}=await startSecondaryScreensFixture(Number(process.env.PORT??4217));console.log(base+' · actual UI; synthetic identity/progress/match outcomes; block external network during tests.');}
}
