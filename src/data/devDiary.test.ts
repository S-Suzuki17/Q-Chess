import {describe,it,expect} from 'vitest';
import {devDiaryTweets} from './devDiary';
import {readFileSync} from 'node:fs';
describe('development diary',()=>{
    it('keeps identifiable dated posts without duplicates',()=>{
        expect(new Set(devDiaryTweets.map(p=>p.id)).size).toBe(devDiaryTweets.length);
        for(const p of devDiaryTweets){expect(p.id.trim()).toBeTruthy();expect(p.content.trim()).toBeTruthy();expect(p.date).not.toBe('たった今');expect(p.authorName.trim()).toBeTruthy();expect(p.handle.startsWith('@')).toBe(true);}
    });
    it('records verified battle music restoration without overstating device checks',()=>{
        const post=devDiaryTweets.find(p=>p.id==='t2');expect(post).toBeDefined();
        expect(post?.authorName).toBe('QUBE');expect(post?.handle).toBe('@QUBIT4x');
        expect(post?.content).toContain('復元');expect(post?.content).toContain('対局中');expect(post?.hasAd).toBe(false);
    });
    it('keeps complaints generic, without quoting the private briefing',()=>{
        for(const post of devDiaryTweets.filter(p=>p.authorName==='QUBE')){
            expect(post.content).not.toMatch(/(?:ボス|上司|QUBE)\s*[「『]/);
            for(const removed of ['名前を普通にして','もっとチェスの勝利っぽく','全部ド派手に出して','審査合格まで言い切れ'])expect(post.content).not.toContain(removed);
        }
    });
    it('exports exactly the same text as the public diary',()=>{
        for(const post of devDiaryTweets.filter(p=>p.authorName==='QUBE')){
            const expected=[post.content,post.tags?.map(t=>'#'+t).join(' ')].filter(Boolean).join('\n').normalize('NFC');
            expect(readFileSync(`outputs/qube-drafts/${post.id}.txt`,'utf8').replace(/\r\n/g,'\n').trimEnd()).toBe(expected);
        }
    });
    it('keeps new text-only posts within the X limit including hashtags',()=>{
        for(const p of devDiaryTweets.filter(p=>p.id!=='t1')){
            const text=[p.content,p.tags?.map(t=>'#'+t).join(' ')].filter(Boolean).join('\n').normalize('NFC');
            const conservativeWeight=[...text].reduce((sum,char)=>sum+(char.codePointAt(0)!<128?1:2),0);
            expect(conservativeWeight,p.id).toBeLessThanOrEqual(280);
        }
    });
});
