import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const target = process.argv[2] ?? 'web';
if (!['web', 'android', 'itch'].includes(target) || process.argv.length > 3) {
  console.error('Usage: npm run release:status -- web|android|itch');
  process.exit(2);
}
const git = (...args) => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
try {
  const result = { target, root, head: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), changes: git('status', '--short'), verification: 'Not performed; inventory only' };
  if (target === 'android') {
    const gradle = readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
    result.versionCode = gradle.match(/\bversionCode\s+(\d+)/)?.[1] ?? 'unknown';
    result.versionName = gradle.match(/\bversionName\s+["']([^"']+)/)?.[1] ?? 'unknown';
    result.webOutputExists = existsSync(path.join(root, 'out/index.html'));
    result.bundleExists = existsSync(path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab'));
  } else {
    result.outputExists = existsSync(path.join(root, target === 'web' ? 'out/index.html' : 'itch-build/index.html'));
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Cannot inventory this checkout. Check Git ownership/access and run as the repository owner.');
  console.error(error.message.split('\n')[0]);
  process.exitCode = 1;
}
