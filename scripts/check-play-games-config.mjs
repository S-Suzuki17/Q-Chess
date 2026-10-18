import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve('docs/play-games');
async function csv(name) {
    const [header, ...rows] = (await readFile(resolve(root, name), 'utf8')).trim().split(/\r?\n/).map(line => line.split(','));
    assert(rows.length, `Empty ${name}`);
    return rows.map(row => {
        assert.equal(row.length, header.length, `Column count in ${name}`);
        return Object.fromEntries(header.map((key, index) => [key, row[index]]));
    });
}
const events = await csv('PlayerGameEvent.csv'), repetitive = await csv('RepetitiveStatsConfig.csv'), progression = await csv('ProgressionStatConfig.csv');
const properties = new Map();
for (const event of events) {
    assert(/^[A-Za-z0-9_]{1,50}$/.test(event['Event Name']));
    assert(/^[A-Za-z0-9_]{1,50}$/.test(event['Property Name']));
    assert(!['id','count','key','value','where','from','and','or','true','false'].includes(event['Property Name']));
    assert(['INT64','DOUBLE','STRING','BOOL'].includes(event['Property Type']));
    const key = `${event['Event Name']}.${event['Property Name']}`;
    assert(!properties.has(key)); properties.set(key, event['Property Type']);
}
assert(repetitive.length >= 5); assert(repetitive.some(row => row['Is Competitive'] === 'TRUE'));
for (const row of repetitive) {
    assert(properties.has(`${row['Event Name']}.${row['Event Property Name']}`));
    assert(['SUM','MIN','MAX','COUNT'].includes(row['Aggregation Type']));
    assert(['TRUE','FALSE'].includes(row['Is Competitive']));
    if (row['Filter Property']) {
        assert(properties.has(`${row['Event Name']}.${row['Filter Property']}`));
        assert(['=','!=','>','<','>=','<='].includes(row['Filter Operator']));
        assert(row['Filter Value']);
    }
    if (row['Is Competitive'] === 'TRUE') {
        assert(row['Min limit'] && row['Max limit']); assert(Number(row['Min limit']) < Number(row['Max limit']));
    }
}
assert.equal(progression.length, 1); assert.equal(progression[0]['Event Property Name'], 'currentProgress');
assert.equal(properties.get('progressUpdate.currentProgress'), 'INT64');
assert(progression[0]['Stat Description'].length <= 50);
const ids = new Set(), names = new Set(), icons = new Set();
for (const row of [...repetitive, ...progression]) {
    assert(/^[A-Za-z0-9_]{1,100}$/.test(row['Stat Id'])); assert(!ids.has(row['Stat Id'])); ids.add(row['Stat Id']);
    assert(row['Stat Display Name'].length <= 50); assert(!names.has(row['Stat Display Name'])); names.add(row['Stat Display Name']);
    assert(row['Stat Description'].length <= 500); assert(['INCREASING','DECREASING'].includes(row['Good value direction']));
    const icon = row['Icon File Name']; assert(!icons.has(icon)); icons.add(icon);
    const path = resolve(root, icon), metadata = await sharp(path).metadata();
    assert.equal(metadata.width, 512); assert.equal(metadata.height, 512); assert.equal(metadata.format, 'png');
    assert((await stat(path)).size < 1024 * 1024);
}
assert.deepEqual((await readdir(root)).filter(name => name.endsWith('.png')).sort(), [...icons].sort());
console.log(`PASS: ${new Set(events.map(row => row['Event Name'])).size} events, ${repetitive.length} repetitive stats, ${progression.length} progression stat, ${icons.size} icons`);
