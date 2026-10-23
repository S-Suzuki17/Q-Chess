import path from 'node:path';
import {pathToFileURL} from 'node:url';

const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const MAX_UNSCHEDULED_MAINTENANCE_MS = 30 * 60_000;

// The API combines the operator flag and Tuesday 11:00–14:00 JST maintenance.
// Its revision timestamps the stored status, not necessarily maintenance start.
export function inspectServiceStatus(value, now = Date.now()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || typeof value.maintenance !== 'boolean'
        || !Number.isSafeInteger(value.serverTime)
        || !['minimumAndroidBuild', 'minimumProtocol'].every(key =>
            Number.isSafeInteger(value[key]) && value[key] >= 0)
        || typeof value.revision !== 'string'
        || !Number.isFinite(Date.parse(value.revision))) {
        throw new Error('Invalid service-status response');
    }
    const clockSkewMs = value.serverTime - now;
    const revisionAgeMs = now - Date.parse(value.revision);
    const date = new Date(now);
    const scheduledWindow = date.getUTCDay() === 2
        && date.getUTCHours() >= 2 && date.getUTCHours() < 5;
    const issues = [];
    if (Math.abs(clockSkewMs) > MAX_CLOCK_SKEW_MS) issues.push('stale_or_incorrect_server_time');
    if (revisionAgeMs < -MAX_CLOCK_SKEW_MS) issues.push('future_status_revision');
    if (value.maintenance && !scheduledWindow
        && revisionAgeMs >= MAX_UNSCHEDULED_MAINTENANCE_MS) {
        issues.push('maintenance_needs_review');
    }
    return {
        status: issues.length ? 'attention_required' : value.maintenance ? 'maintenance' : 'available',
        maintenance: value.maintenance,
        scheduledWindow,
        revision: value.revision,
        statusRevisionAgeMinutes: Math.floor(revisionAgeMs / 60_000),
        minimumAndroidBuild: value.minimumAndroidBuild,
        minimumProtocol: value.minimumProtocol,
        issues,
        productionDataWritten: false,
    };
}

export async function checkServiceHealth(origin, {fetchImpl = fetch, now = Date.now} = {}) {
    const url = new URL('/service/status', origin);
    if (url.username || url.password
        || (url.protocol !== 'https:' && !(url.protocol === 'http:'
            && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
        throw new Error('Use an HTTPS origin (HTTP is allowed only for local tests)');
    }
    const response = await fetchImpl(url, {
        method: 'GET', redirect: 'error', cache: 'no-store',
        headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Service status HTTP ${response.status}`);
    if (!/\bapplication\/json\b/i.test(response.headers.get('content-type') ?? '')) {
        throw new Error('Service status did not return JSON');
    }
    return {origin: url.origin, ...inspectServiceStatus(await response.json(), now())};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        if (process.argv.length > 3) throw new Error('Usage: npm run release:health -- [https-origin]');
        const report = await checkServiceHealth(process.argv[2] ?? 'https://q-chess.onrender.com');
        console.log(JSON.stringify(report, null, 2));
        if (report.issues.length) process.exitCode = 1;
    } catch (error) {
        console.error(JSON.stringify({status: 'unavailable', error: error.message, productionDataWritten: false}));
        process.exitCode = 1;
    }
}
