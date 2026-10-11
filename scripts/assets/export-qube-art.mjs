import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
fs.mkdirSync('scratch/qube',{recursive:true});
fs.mkdirSync('public/assets/qube-companion',{recursive:true});
const source=fs.readFileSync('src/components/qubeArtwork.tsx','utf8');
const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
fs.writeFileSync('scratch/qube/qubeArtwork.mjs',output.outputText);
const {QubeArtwork}=await import(pathToFileURL(path.resolve('scratch/qube/qubeArtwork.mjs')).href);
const states=['neutral','confident','joy','encouraging'];
for(const expression of states){const svg=renderToStaticMarkup(React.createElement(QubeArtwork,{expression,width:300,height:310}));fs.writeFileSync(`public/assets/qube-companion/qube-${expression}.svg`,svg);}
const groups=states.map((expression,i)=>{
 const body=fs.readFileSync(`public/assets/qube-companion/qube-${expression}.svg`,'utf8').replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
 return `<g fill="none" transform="translate(${i*300} 0)">${body}<text x="150" y="328" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="17" fill="#e7dfc0">${expression}</text></g>`;
}).join('');
fs.writeFileSync('scratch/qube/expression-contact-sheet.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="345" viewBox="0 0 1200 345"><path fill="#17302a" d="M0 0H1200V345H0Z"/>${groups}</svg>`);
console.log('Exported four expression SVGs and contact sheet.');
