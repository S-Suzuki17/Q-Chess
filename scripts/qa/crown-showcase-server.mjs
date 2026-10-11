import {build,createServer} from 'vite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),fixture=resolve(root,'scripts/qa/fixtures/crown-showcase'),stub=resolve(fixture,'stubs.tsx');
export function showcaseConfig(port=0){return {configFile:false,root:fixture,publicDir:resolve(root,'public'),cacheDir:resolve(root,'scratch/showcase-vite-cache'),
  server:{host:'127.0.0.1',port,fs:{allow:[root]}},
  resolve:{alias:[
   ...['LocalGameBoard','Board3D'].map(name=>({find:new RegExp(`^\\./${name}$`),replacement:stub})),
   ...['useCampaignProgress','useCircuitAccess'].map(name=>({find:new RegExp(`^\\.\\./hooks/${name}$`),replacement:stub})),
   ...['circuitAccess','stripeMembership','crownAdmission','adPolicy'].map(name=>({find:new RegExp(`^\\.\\./lib/${name}$`),replacement:stub})),
   {find:/^\.\.\/config\/crownAdmission$/,replacement:stub},
  ]},define:{'process.env':{}},optimizeDeps:{include:['react','react-dom/client','lucide-react']},
  build:{write:false},
 };}
export async function startShowcase(port=0){
 const server=await createServer(showcaseConfig(port));await server.listen();return {server,base:`http://127.0.0.1:${server.httpServer.address().port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--build-only')){await build(showcaseConfig());console.log('PASS: isolated Crown visual fixture compiles; browser rendering and interaction have not run.');}
 else {const {base}=await startShowcase(Number(process.env.PORT??4195));console.log(`Local presentation fixture: ${base}. Synthetic progress only; no production requests.`);}
}
