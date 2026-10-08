// Actual compiled entrypoint; only bind address and external HTTP are guarded.
// Product feature gates, handlers, authentication, stores and rules are untouched.
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
assert.equal(process.env.QG_SHARED_RUNTIME_FIXTURE, '1');
const target = new URL(process.env.SUPABASE_URL);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.protocol, 'http:');
assert.notEqual(process.cwd(), path.resolve(__dirname, '../..'), 'Use an empty fixture cwd, never project .env files');
const allow = url => {
    const value = new URL(url);
    assert.equal(value.origin, target.origin, 'External provider HTTP is forbidden in this fixture');
    assert.ok(value.pathname.startsWith('/rest/v1/'), 'Only the fixture PostgREST prefix is allowed');
    return value;
};
const fetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
    allow(typeof input === 'string' || input instanceof URL ? input : input.url);
    return fetch(input, { ...init, redirect: 'error' });
};
for (const protocol of [http, https]) {
    const request = protocol.request;
    protocol.request = function (input, ...args) {
        const url = typeof input === 'string' || input instanceof URL ? input
            : (input.protocol ?? (protocol === https ? 'https:' : 'http:')) + '//'
              + (input.hostname ?? input.host ?? 'localhost') + (input.port ? ':' + input.port : '') + (input.path ?? '/');
        allow(url);
        return request.call(this, input, ...args);
    };
    protocol.get = function (...args) { const req = protocol.request(...args); req.end(); return req; };
}
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
    const callback = typeof args.at(-1) === 'function' ? args.at(-1) : undefined;
    return listen.call(this, 0, '127.0.0.1', () => {
        callback?.();
        process.send?.({ ready: true, port: this.address().port });
    });
};
console.log('Local shared runtime bootstrap ready');
require(path.resolve(__dirname, '../../server/dist/index.js'));
console.log('Local shared runtime modules loaded');


