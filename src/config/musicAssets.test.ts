import {describe,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {REWARD_TRACKS} from './musicTracks';
import {CIRCUIT_MUSIC,battleMusicUrl,battleMusicTitle} from './circuitMusic';
import {CHAMPIONSHIP_REWARDS} from './championshipRewards';

const root=resolve(process.cwd(),'public');
const bytes=(url:string)=>readFileSync(resolve(root,url.replace(/^\//,'')));
describe('released reward recordings',()=>{
    it.each(REWARD_TRACKS)('$title contains an MP3 recording, not an empty WAV header',track=>{
        const data=bytes(track.url);
        expect(data.length).toBeGreaterThan(100_000);
        expect(data.subarray(0,4).toString('ascii')).not.toBe('RIFF');
        expect(data.subarray(0,3).toString('ascii')==='ID3'||(data[0]===0xff&&(data[1]&0xe0)===0xe0)).toBe(true);
    });
    it('keeps all fifteen recordings distinct',()=>{
        expect(REWARD_TRACKS).toHaveLength(15);
        expect(new Set(REWARD_TRACKS.map(t=>t.url)).size).toBe(15);
        expect(new Set(REWARD_TRACKS.map(t=>createHash('sha256').update(bytes(t.url)).digest('hex'))).size).toBe(15);
    });
    it('exposes every recording through a stage or legacy reward without duplicates',()=>{
        const rewards=[...CHAMPIONSHIP_REWARDS.filter(r=>r.kind==='music'),...CIRCUIT_MUSIC];
        expect(rewards).toHaveLength(15);
        expect(rewards.map(r=>battleMusicUrl(r.id)).sort()).toEqual(REWARD_TRACKS.map(t=>t.url).sort());
        for(const reward of rewards) expect(battleMusicTitle(reward.id)).toBeTruthy();
    });
    it('retains nonempty audio for older WAV paths',()=>{
        const folder=resolve(root,'audio/rewards');
        for(const name of readdirSync(folder).filter(n=>n.endsWith('.wav'))){
            const data=readFileSync(resolve(folder,name));
            expect(data.length,name).toBeGreaterThan(44);
            expect(data.subarray(0,4).toString('ascii'),name).toBe('RIFF');
            const chunk=data.indexOf(Buffer.from('data'),12);
            expect(chunk,name).toBeGreaterThanOrEqual(12);
            expect(data.readUInt32LE(chunk+4),name).toBeGreaterThan(0);
        }
    });
});
