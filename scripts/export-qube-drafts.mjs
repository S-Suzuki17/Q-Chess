import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { devDiaryTweets } from '../src/data/devDiary.ts';

const output = resolve('outputs/qube-drafts');
await mkdir(output, { recursive: true });
for (const post of devDiaryTweets.filter(post => post.authorName === 'QUBE')) {
    const text = [post.content, post.tags?.map(tag => `#${tag}`).join(' ')].filter(Boolean).join('\n').normalize('NFC');
    if ([...text].reduce((sum, char) => sum + (char.codePointAt(0) < 128 ? 1 : 2), 0) > 280) throw new Error(`Draft exceeds limit: ${post.id}`);
    if (!/^[a-z0-9-]+$/i.test(post.id)) throw new Error('Unsafe draft ID');
    await writeFile(resolve(output, `${post.id}.txt`), text + '\n', 'utf8');
}
console.log(`Exported QUBE drafts from the public diary to ${output}. No X posting.`);
