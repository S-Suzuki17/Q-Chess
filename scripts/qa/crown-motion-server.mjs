import {createServer} from 'vite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import tailwind from '@tailwindcss/postcss';
const root=fileURLToPath(new URL('../../',import.meta.url)),fixture=resolve(root,'scripts/qa/fixtures/crown-motion');
const stub=resolve(root,'scripts/qa/fixtures/crown-showcase/stubs.tsx');
export async function startMotionFixture(port=0,{sourceRoot=root,stateStub=stub,boardStub}={}){
 const cacheId=createHash('sha256').update(JSON.stringify({sourceRoot,stateStub,boardStub})).digest('hex').slice(0,12)+'-'+process.pid;
 const server=await createServer({configFile:false,root:fixture,publicDir:resolve(root,'public'),cacheDir:resolve(root,'scratch/crown-motion-vite-cache-'+cacheId),
  server:{host:'127.0.0.1',port,fs:{allow:[root,sourceRoot]}},resolve:{alias:[
   {find:/^\.\.\/\.\.\/\.\.\/\.\.\/src\/components\/CampaignMode$/,replacement:resolve(sourceRoot,'src/components/CampaignMode.tsx')},
   {find:/^\.\.\/\.\.\/\.\.\/\.\.\/src\/app\/globals.css$/,replacement:resolve(sourceRoot,'src/app/globals.css')},
   ...['useCampaignProgress','useCircuitAccess'].map(name=>({find:new RegExp(`^\\.\\./hooks/${name}$`),replacement:stateStub})),
   ...['circuitAccess','stripeMembership','crownAdmission','adPolicy'].map(name=>({find:new RegExp(`^\\.\\./lib/${name}$`),replacement:stateStub})),
   {find:/^\.\.\/config\/crownAdmission$/,replacement:stateStub},
   ...(boardStub?[{find:/^\.\/LocalGameBoard$/,replacement:boardStub}]:[]),
  ]},define:{'process.env.NEXT_PUBLIC_SERVER_URL':JSON.stringify('http://127.0.0.1:19999'),'process.env':{}},optimizeDeps:{include:['react','react-dom/client','lucide-react']},css:{postcss:{plugins:[tailwind({base:sourceRoot})]}},
 });await server.listen();return{server,base:`http://127.0.0.1:${server.httpServer.address().port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const {base}=await startMotionFixture(Number(process.env.PORT??4206));console.log(`Crown motion fixture: ${base}. Actual local engine/board; only identity/progress/ad transport are synthetic.`);}
