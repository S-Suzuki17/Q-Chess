import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CHAMPIONSHIP_REWARDS } from '../../src/config/championshipRewards.ts';
import { championshipName } from '../../src/locales/championshipText.ts';
const output=resolve('../../outputs/championship-100');
await mkdir(output,{recursive:true});
const rewards=CHAMPIONSHIP_REWARDS.map(reward=>({...reward,nameJa:championshipName('ja',reward),nameEn:championshipName('en',reward)}));
await writeFile(resolve(output,'catalog.json'),JSON.stringify(rewards,null,2));
const rows=rewards.map(reward=>`| ${reward.requiredWins} | ${reward.kind==='board'?'3D盤面':'勝利エフェクト'} | ${reward.nameJa} | ${reward.id} |`);
await writeFile(resolve(output,'catalog.md'),[
    '# Q-Gambit 優勝報酬100種',
    '',
    '盤面60種（6系統×10段階）＋勝利エフェクト40種（4系統×10段階）。各周回の4連戦をすべて勝利すると、対応する優勝報酬を1種解放します。',
    '基本3D盤・Classic/Marble/Neonは最初から利用可能。ボス個別報酬（青石・銅・黒曜石・翡翠）は別枠として保持しています。',
    '',
    '| 必要優勝回数 | 分類 | 名前 | ID |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '同一周回の最終ボスだけを再撃破しても優勝回数は増えません。2周目以降の記録は別に保存され、既存の報酬は失われません。',
    '',
].join('\n'));
console.log(`Exported ${rewards.length} rewards to ${output}`);
