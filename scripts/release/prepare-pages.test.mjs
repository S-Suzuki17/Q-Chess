import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkFiles} from './prepare-pages.mjs';

test('accepts ordinary static content and public anon credentials', () => {
    const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')}.signature`;
    assert.doesNotThrow(() => checkFiles([{name:'_next/static/app.js',size:100}], () => token));
});
test('rejects oversized assets and too many dashboard files', () => {
    assert.throws(() => checkFiles([{name:'audio.mp3',size:25*1024*1024+1}], () => ''), /25 MiB/);
    assert.throws(() => checkFiles(Array.from({length:1000}, () => ({name:'x',size:1})), () => ''), /1000 files/);
});
test('refuses secrets and executable server assets without exposing their values', () => {
    for (const name of ['.env.local','functions/api.js','_worker.js','upload.jks','bundle.js.map']) {
        assert.throws(() => checkFiles([{name,size:1}], () => ''), /Forbidden release file/);
    }
    const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.signature`;
    assert.throws(() => checkFiles([{name:'app.js',size:100}], () => token), /Privileged key/);
    assert.throws(() => checkFiles([{name:'app.js',size:100}], () => 'sb_secret_example'), /Secret material/);
});
