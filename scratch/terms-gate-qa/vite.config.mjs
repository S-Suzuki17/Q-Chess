import {defineConfig} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
export default defineConfig({root:here,publicDir:false,server:{host:'127.0.0.1',port:4195,strictPort:true,fs:{allow:[root]}},resolve:{alias:[
    {find:'../lib/accountTerms',replacement:path.join(here,'terms-mock.js')},
    {find:'./AccountDeletionPanel',replacement:path.join(here,'deletion-mock.jsx')},
]},esbuild:{jsx:'automatic'}});
