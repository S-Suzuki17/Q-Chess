import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { affectedGroups, assessReviews } from './content-maintenance.mjs';
const map = JSON.parse(readFileSync(new URL('../../docs/public-content-map.json', import.meta.url)));
const base = 'a'.repeat(40);
const path = 'src/hooks/useMoveHint.ts';
const change = { path, gitBlob: 'b'.repeat(40) };
const group = map.groups.find(group => group.id === 'hints-and-clock');
const record = () => ({ schemaVersion: 1, status: 'completed', baseRevision: base, reviewer: 'Test reviewer', changes: [change], reviews: [{ group: group.id, decision: 'no-change-needed', reason: 'Only cancellation handling changed; the shown source/destination and availability remain the same.', checkedPages: group.pages, evidence: ['Reviewed UI and FAQ; relevant hint tests passed.'] }] });

test('hint changes require the exact guide and FAQ review, not an unrelated contact review', () => {
  const result = assessReviews(map, [change], [], base);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems[0].checkPages, ['/guide/#start', '/faq/#clock', '/faq/#hints']);
});
test('an explicit evidenced no-copy-change decision passes for the exact source bytes', () => assert.equal(assessReviews(map, [change], [record()], base).ok, true));
test('source changes after review, deletion, and a different base invalidate the record', () => {
  for (const changed of [{ ...change, gitBlob: 'c'.repeat(40) }, { ...change, gitBlob: 'deleted' }]) assert.equal(assessReviews(map, [changed], [record()], base).ok, false);
  assert.equal(assessReviews(map, [change], [record()], 'd'.repeat(40)).ok, false);
});
test('pending or unexplained reviews never clear a gate', () => {
  for (const field of ['status', 'reviewer']) { const r = record(); r[field] = ''; assert.equal(assessReviews(map, [change], [r], base).ok, false); }
  for (const field of ['reason', 'evidence', 'checkedPages']) { const r = record(); r.reviews[0][field] = field === 'reason' ? '' : []; assert.equal(assessReviews(map, [change], [r], base).ok, false); }
});
test('claiming to update guidance requires a changed guidance file too', () => {
  const r = record(); r.reviews[0].decision = 'updated';
  assert.equal(assessReviews(map, [change], [r], base).ok, false);
});
test('a completed update can cover every affected group for the exact code and copy', () => {
  const changes = [change, {path: 'src/locales/siteContent.ts', gitBlob: 'e'.repeat(40)}];
  const reviewed = {schemaVersion: 1, status: 'completed', baseRevision: base, reviewer: 'Fixture reviewer', changes,
    reviews: affectedGroups(map, changes.map(item => item.path)).map(group => ({group: group.id, decision: 'updated', reason: 'Updated the public hint conditions for this fixture.', checkedPages: group.pages, evidence: ['Fixture verification passed.']}))};
  assert.equal(assessReviews(map, changes, [reviewed], base).ok, true);
  assert.equal(assessReviews(map, changes.map(item => item.path === path ? {...item, gitBlob: 'f'.repeat(40)} : item), [reviewed], base).ok, false);
});
test('all affected groups must be covered when a shared service changes', () => {
  const changes = [{ path: 'src/components/LocalGameBoard.tsx', gitBlob: 'e'.repeat(40) }, { path: 'server/src/quantum-engine/stateTransition.ts', gitBlob: 'f'.repeat(40) }];
  assert.deepEqual(assessReviews(map, changes, [], base).groups.sort(), ['candidates-and-outcomes', 'hints-and-clock', 'qube-teaching']);
});
test('ordinary tests, fixtures and unrelated changes do not force content edits', () => {
  const paths = ['src/hooks/useMoveHint.test.ts', 'server/src/services/fixtures/Cpu.ts', 'README.md'];
  assert.deepEqual(affectedGroups(map, paths), []);
  assert.equal(assessReviews(map, [], [], base).ok, true);
});
test('new or removed guide pages require the public-navigation review', () => {
  assert.equal(affectedGroups(map, ['src/app/guide/page.tsx'])[0].id, 'public-guidance-and-navigation');
});
test('the common teacher and game explanations require a teaching-surface review', () => {
  assert.ok(affectedGroups(map, ['src/components/QubeTeacher.tsx']).some(group => group.id === 'qube-teaching'));
  assert.ok(affectedGroups(map, ['src/components/InteractiveTutorial.tsx']).some(group => group.id === 'start-and-controls'));
});
test('working-tree records survive Git line-ending conversion and still reject later changes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'qg-public-content-test-'));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], {encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']});
  const cli = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('./content-maintenance.mjs', import.meta.url)), '--root', directory, '--map', fileURLToPath(new URL('../../docs/public-content-map.json', import.meta.url)), ...args], {encoding: 'utf8', windowsHide: true});
  try {
    git('init'); git('config', 'core.autocrlf', 'true');
    writeFileSync(join(directory, '.gitattributes'), '*.ts text eol=lf\n');
    mkdirSync(join(directory, 'src/hooks'), {recursive: true});
    writeFileSync(join(directory, path), 'export const fixture = 1;\n');
    git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@users.noreply.github.com', 'commit', '-m', 'fixture baseline');
    const revision = git('rev-parse', 'HEAD').trim();
    writeFileSync(join(directory, path), 'export const fixture = 2;\r\n');
    const draftFile = join(directory, 'draft.json');
    assert.equal(cli('--base', revision, '--draft', draftFile).status, 0);
    const review = JSON.parse(readFileSync(draftFile, 'utf8'));
    assert.equal(review.status, 'pending');
    review.status = 'completed'; review.reviewer = 'Fixture reviewer';
    for (const item of review.reviews) { item.decision = 'no-change-needed'; item.reason = 'Fixture changes an internal constant only.'; item.evidence = ['Fixture inspection completed.']; }
    mkdirSync(join(directory, 'docs/public-content-reviews'), {recursive: true});
    writeFileSync(join(directory, 'docs/public-content-reviews/fixture.json'), JSON.stringify(review));
    git('add', 'src', 'docs'); git('-c', 'user.name=Test', '-c', 'user.email=test@users.noreply.github.com', 'commit', '-m', 'fixture reviewed change');
    assert.equal(cli('--base', revision, '--head', 'HEAD').status, 0, 'Committed LF must match reviewed CRLF');
    writeFileSync(join(directory, path), 'export const fixture = 3;\r\n');
    assert.equal(cli('--base', revision).status, 1);
    rmSync(join(directory, path));
    assert.equal(cli('--base', revision).status, 1);
  } finally {
    const absolute = resolve(directory);
    assert.ok(absolute.startsWith(resolve(tmpdir()) + '/qg-public-content-test-') || absolute.startsWith(resolve(tmpdir()) + '\\qg-public-content-test-'));
    rmSync(absolute, {recursive: true, force: true});
  }
});
