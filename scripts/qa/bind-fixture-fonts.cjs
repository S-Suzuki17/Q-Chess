// Bind a local compiled QA fixture to the actual next/font definitions in a saved export.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function bindFixtureFonts(fixtureArg,exportArg){
assert(fixtureArg&&exportArg,'Provide a compiled fixture and a saved Next export with its font CSS and media.');
const fixture=path.resolve(fixtureArg),exportRoot=path.resolve(exportArg),htmlPath=path.join(fixture,'index.html');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const html=fs.readFileSync(htmlPath,'utf8');assert(!html.includes('data-qg-qa-fonts'),'Font fixture already applied.');
const definitions=[],variables=new Map(),fonts=new Map(),inputs=[];
for(const name of fs.readdirSync(path.join(exportRoot,'_next/static/css'))){
 if(!name.endsWith('.css'))continue;
 const file=path.join(exportRoot,'_next/static/css',name),css=fs.readFileSync(file,'utf8');
 const faces=[...css.matchAll(/@font-face\{[^}]+\}/g)].map(m=>m[0]);
 if(!faces.length)continue;
 inputs.push({path:file,sha256:sha(css)});
 for(const declaration of css.matchAll(/--font-(?:geist-sans|geist-mono|playfair|cinzel):[^;}]+/g)){
  const [key,...value]=declaration[0].split(':');variables.set(key,value.join(':'));
 }
 for(const face of faces){
  definitions.push(face.replace(/url\(([^)]+)\)/g,(match,raw)=>{
   const reference=raw.replace(/^['"]|['"]$/g,'');
   if(!reference.endsWith('.woff2'))throw new Error('Unexpected font format: '+reference);
   const absolute=reference.startsWith('/')?path.resolve(exportRoot,'.'+reference):path.resolve(path.dirname(file),reference),relative=path.relative(exportRoot,absolute);
   assert(!relative.startsWith('..')&&!path.isAbsolute(relative),'Font escaped the saved export.');
   const basename=path.basename(absolute),bytes=fs.readFileSync(absolute);
   if(fonts.has(basename))assert.equal(fonts.get(basename).sha256,sha(bytes),'Ambiguous font filename.');
   fonts.set(basename,{path:absolute,sha256:sha(bytes),bytes});
   return `url(/qa-fonts/${basename})`;
  }));
 }
}
for(const key of ['--font-geist-sans','--font-geist-mono','--font-playfair','--font-cinzel'])assert(variables.has(key),'Missing '+key);
const directory=path.join(fixture,'qa-fonts');fs.mkdirSync(directory,{recursive:false});
for(const [name,file]of fonts)fs.writeFileSync(path.join(directory,name),file.bytes,{flag:'wx'});
const css=[...new Set(definitions),':root{'+[...variables].map(([k,v])=>k+':'+v).join(';')+'}'].join('\n');
fs.writeFileSync(path.join(directory,'fonts.css'),css,{flag:'wx'});
const after=html.replace('</head>','<link rel="stylesheet" href="/qa-fonts/fonts.css" data-qg-qa-fonts></head>');
assert.notEqual(after,html,'Fixture head was not found.');fs.writeFileSync(htmlPath,after);
const result={preparedAt:new Date().toISOString(),fixture,exportRoot,inputCss:inputs,variables:Object.fromEntries(variables),fontFiles:[...fonts].map(([name,file])=>({name,source:file.path,sha256:file.sha256,bytes:file.bytes.length})),fixtureHtmlBeforeSha256:sha(html),fixtureHtmlAfterSha256:sha(after),fontCssSha256:sha(css),boundary:'Local QA artifact only. Existing font-face declarations and four Next font variables copied; no production CSS rules or product behavior changed.'};
fs.writeFileSync(path.join(fixture,'font-binding.json'),JSON.stringify(result,null,2)+'\n');
return result;
}
module.exports={bindFixtureFonts};
if(require.main===module){
 const result=bindFixtureFonts(...process.argv.slice(2));
 console.log(JSON.stringify({fonts:result.fontFiles.length,variables:Object.keys(result.variables).length,fontCssSha256:result.fontCssSha256,fixture:result.fixture}));
}
