import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const normalize = path => path.replaceAll('\\', '/');
const ignored = path => /(?:^|\/)(?:fixtures|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/.test(path);

export function affectedGroups(map, paths) {
  return map.groups.map(group => ({ ...group, changed: paths.filter(path => !ignored(path) && group.sources.some(pattern => new RegExp(pattern).test(normalize(path)))) }))
    .filter(group => group.changed.length);
}

export function assessReviews(map, changes, records, baseRevision) {
  const groups = affectedGroups(map, changes.map(change => change.path));
  const problems = [];
  for (const group of groups) {
    const accepted = records.some(record => {
      if (record.schemaVersion !== 1 || record.status !== 'completed' || record.baseRevision !== baseRevision || !record.reviewer?.trim()) return false;
      const review = record.reviews?.find(item => item.group === group.id);
      if (!review || !['updated', 'no-change-needed'].includes(review.decision) || !review.reason?.trim()) return false;
      if (!Array.isArray(review.evidence) || !review.evidence.length || review.evidence.some(item => typeof item !== 'string' || !item.trim())) return false;
      if (!group.pages.every(page => review.checkedPages?.includes(page))) return false;
      if (review.decision === 'updated' && !changes.some(change => group.guidance.includes(change.path))) return false;
      return group.changed.every(path => {
        const current = changes.find(change => change.path === path);
        return record.changes?.some(change => change.path === path && change.gitBlob === current.gitBlob);
      });
    });
    if (!accepted) problems.push({ group: group.id, changed: group.changed, checkPages: group.pages });
  }
  return { ok: !problems.length, groups: groups.map(group => group.id), problems };
}

function run() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    if (!['--root', '--base', '--head', '--map', '--draft'].includes(process.argv[i]) || !process.argv[i + 1]) throw new Error('Usage: node content-maintenance.mjs --base <revision> [--head <revision>] [--root <repo>] [--map <json>] [--draft <output.json>]');
    args[process.argv[i]] = process.argv[i + 1];
  }
  const root = resolve(args['--root'] || '.');
  const base = args['--base'];
  const head = args['--head'];
  if (!base || [base, head].filter(Boolean).some(ref => !/^[A-Za-z0-9][A-Za-z0-9_./~^:-]*$/.test(ref))) throw new Error('A valid base revision is required.');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  const baseSha = git('rev-parse', '--verify', `${base}^{commit}`).trim();
  const headSha = head ? git('rev-parse', '--verify', `${head}^{commit}`).trim() : null;
  const map = JSON.parse(readFileSync(resolve(args['--map'] || resolve(root, 'docs/public-content-map.json')), 'utf8'));
  const changed = git('diff', '--name-only', '-z', baseSha, ...(headSha ? [headSha] : [])).split('\0').filter(Boolean);
  if (!headSha) changed.push(...git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean));
  const relevant = [...new Set(affectedGroups(map, [...new Set(changed)]).flatMap(group => group.changed))].sort();
  const changes = relevant.map(path => {
    let gitBlob = 'deleted';
    if (headSha) {
      try { gitBlob = execFileSync('git', ['-C', root, 'rev-parse', '--verify', `${headSha}:${path}`], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Deleted files require a review too. */ }
    } else if (existsSync(resolve(root, path))) {
      // Apply the same clean/line-ending rules used by commit, without writing objects.
      gitBlob = execFileSync('git', ['-C', root, 'hash-object', `--path=${path}`, '--stdin'], {input: readFileSync(resolve(root, path)), encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']}).trim();
    }
    return { path, gitBlob };
  });
  if (args['--draft']) {
    const draft = { schemaVersion: 1, status: 'pending', baseRevision: baseSha, reviewer: '', changes,
      reviews: affectedGroups(map, relevant).map(group => ({ group: group.id, decision: null, reason: '', checkedPages: group.pages, evidence: [] })) };
    const output = resolve(args['--draft']); mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(draft, null, 2) + '\n');
    console.log(`Pending review template: ${output}; ${draft.reviews.length} groups. This does not approve any content.`);
    return;
  }
  const directory = resolve(root, 'docs/public-content-reviews');
  let recordFiles = [];
  if (headSha) recordFiles = git('ls-tree', '-r', '--name-only', headSha, 'docs/public-content-reviews').split('\n').filter(path => path.endsWith('.json'));
  else if (existsSync(directory)) recordFiles = readdirSync(directory).filter(name => name.endsWith('.json')).map(name => normalize(relative(root, resolve(directory, name))));
  const records = recordFiles.map(path => JSON.parse(headSha ? git('show', `${headSha}:${path}`) : readFileSync(resolve(root, path), 'utf8')));
  const result = assessReviews(map, changes, records, baseSha);
  console.log(JSON.stringify({ base: baseSha, head: headSha || 'working-tree', ...result }, null, 2));
  if (!result.ok) {
    console.error('Public guidance review is missing, incomplete or stale. Update the affected pages or record a concrete no-change-needed reason, evidence and the exact source hashes. A pending template cannot pass.');
    process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
