// Export the same six-entry presentation catalogue used by the client/server.
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {resolve,dirname}=require('node:path');
const ts=require('typescript');
const root=resolve(__dirname,'../..');
const source=readFileSync(resolve(root,'server/src/presentation/crownEnemies.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const moduleObject={exports:{}};
new Function('exports','module',compiled)(moduleObject.exports,moduleObject);
const catalogue=moduleObject.exports.CROWN_ENEMIES;
if(catalogue.length!==6||new Set(catalogue.map(enemy=>enemy.id)).size!==6)throw new Error('Expected six unique characters');
const output=resolve(root,process.argv[2]??'scratch/crown-character-catalogue.json');
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(catalogue,null,2)+'\n');
console.log(`Six-character render catalogue: ${output}`);
