import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import test from 'node:test';
import {checkServiceHealth, inspectServiceStatus} from './check-service-health.mjs';

const friday = Date.parse('2026-10-23T02:00:00Z');
const statusAt = (now, overrides = {}) => ({
    maintenance: false, minimumAndroidBuild: 0, minimumProtocol: 0,
    revision: '2026-10-20T17:55:55.534382Z', serverTime: now, ...overrides,
});

test('an old revision alone does not report an outage', () => {
    assert.equal(inspectServiceStatus(statusAt(friday), friday).status, 'available');
});

test('detects the interrupted manual maintenance outside the scheduled window', () => {
    const report = inspectServiceStatus(statusAt(friday, {maintenance: true}), friday);
    assert.equal(report.status, 'attention_required');
    assert.deepEqual(report.issues, ['maintenance_needs_review']);
    assert.equal(report.scheduledWindow, false);
});

test('a recent operator maintenance change is reported without a stale warning', () => {
    const report = inspectServiceStatus(statusAt(friday, {
        maintenance: true, revision: new Date(friday - 29 * 60_000).toISOString(),
    }), friday);
    assert.equal(report.status, 'maintenance');
    assert.deepEqual(report.issues, []);
});

test('Tuesday 11:00–14:00 JST is evaluated at its exact UTC boundaries', () => {
    for (const [iso, scheduled] of [
        ['2026-10-27T01:59:59Z', false], ['2026-10-27T02:00:00Z', true],
        ['2026-10-27T04:59:59Z', true], ['2026-10-27T05:00:00Z', false],
    ]) {
        const now = Date.parse(iso);
        const report = inspectServiceStatus(statusAt(now, {maintenance: true}), now);
        assert.equal(report.scheduledWindow, scheduled, iso);
        assert.equal(report.issues.includes('maintenance_needs_review'), !scheduled, iso);
    }
});

test('invalid fields cannot be accepted as healthy', () => {
    for (const overrides of [
        {maintenance: 'false'}, {serverTime: undefined}, {revision: ''},
        {minimumProtocol: -1}, {minimumAndroidBuild: 1.5},
    ]) assert.throws(() => inspectServiceStatus(statusAt(friday, overrides), friday));
    assert.throws(() => inspectServiceStatus(null, friday));
});

test('stale responses and future status revisions need attention', () => {
    assert.deepEqual(inspectServiceStatus(statusAt(friday - 600_000), friday).issues,
        ['stale_or_incorrect_server_time']);
    assert.deepEqual(inspectServiceStatus(statusAt(friday, {
        revision: new Date(friday + 600_000).toISOString(),
    }), friday).issues, ['future_status_revision']);
});

test('uses only the public status GET and rejects unavailable or non-JSON responses', async t => {
    let kind = 'healthy';
    const requests = [];
    const server = createServer((req, res) => {
        requests.push({method: req.method, url: req.url, authorization: req.headers.authorization});
        res.setHeader('content-type', kind === 'html' ? 'text/html' : 'application/json');
        if (kind === 'unavailable') res.statusCode = 503;
        res.end(kind === 'html' ? '<html>Sign in</html>' : JSON.stringify(statusAt(friday)));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
    const origin = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await checkServiceHealth(origin, {now: () => friday})).status, 'available');
    kind = 'unavailable';
    await assert.rejects(checkServiceHealth(origin), /HTTP 503/);
    kind = 'html';
    await assert.rejects(checkServiceHealth(origin), /did not return JSON/);
    assert.deepEqual(requests, Array.from({length: 3}, () => ({
        method: 'GET', url: '/service/status', authorization: undefined,
    })));
});

test('unsafe origins are rejected before a request is sent', async () => {
    const fetchImpl = () => {throw new Error('unexpected network call');};
    await assert.rejects(checkServiceHealth('http://example.com', {fetchImpl}), /HTTPS origin/);
    await assert.rejects(checkServiceHealth('https://user:password@example.com', {fetchImpl}), /HTTPS origin/);
});
