import { describe, expect, it } from 'vitest';
import { BOSSES, emptyCampaign, bossUnlocked, rewardUnlocked, outcomeStars, finishBoss, equipReward, parseCampaign } from './campaign';
const win = {won:true,draw:false,playerMoves:14,hintsUsed:0};
describe('campaign progression and cosmetic rewards', () => {
    it('starts with only the opening round available', () => {
        expect(BOSSES.map(boss=>bossUnlocked(emptyCampaign(),boss.id))).toEqual([true,false,false,false]);
    });
    it('does not grant rewards for losses, draws or locked opponents', () => {
        const initial=emptyCampaign();
        expect(finishBoss(initial,'nox',{...win,won:false})).toBe(initial);
        expect(finishBoss(initial,'nox',{...win,won:false,draw:true})).toBe(initial);
        expect(finishBoss(initial,'sovereign',win)).toBe(initial);
    });
    it('advances through every round and keeps previous unlocks', () => {
        let progress=emptyCampaign();
        for (const boss of BOSSES) {
            expect(bossUnlocked(progress,boss.id)).toBe(true);
            progress=finishBoss(progress,boss.id,win);
            expect(rewardUnlocked(progress,boss.reward)).toBe(true);
        }
        expect(Object.values(progress.stars)).toEqual([3,3,3,3]);
    });
    it('is idempotent and never replaces a better medal with a worse one', () => {
        const progress=finishBoss(emptyCampaign(),'nox',win);
        expect(finishBoss(progress,'nox',win)).toEqual(progress);
        expect(finishBoss(progress,'nox',{...win,hintsUsed:1,playerMoves:30})).toEqual(progress);
    });
    it('makes medals optional for unlocking the next boss', () => {
        const progress=finishBoss(emptyCampaign(),'nox',{...win,hintsUsed:2,playerMoves:40});
        expect(progress.stars.nox).toBe(1);
        expect(bossUnlocked(progress,'ember')).toBe(true);
        expect(outcomeStars({...win,won:false})).toBe(0);
    });
    it('only equips unlocked rewards of the matching category', () => {
        const initial=emptyCampaign();
        expect(equipReward(initial,'piece','jade')).toBe(initial);
        const cleared=finishBoss(initial,'nox',win);
        expect(equipReward(cleared,'board','slate').board).toBe('slate');
        expect(equipReward(cleared,'piece','slate')).toBe(cleared);
    });
    it('recovers from corrupt or unsupported saves and strips invalid unlocks', () => {
        for (const raw of [null,'bad','null','{}','{"version":2}']) expect(parseCampaign(raw)).toEqual(emptyCampaign());
        expect(parseCampaign(JSON.stringify({version:1,stars:{sovereign:3},piece:'jade',board:'unknown'}))).toEqual(emptyCampaign());
    });
    it('round-trips unlocked progress and equipped cosmetics', () => {
        const progress=equipReward(finishBoss(emptyCampaign(),'nox',win),'board','slate');
        expect(parseCampaign(JSON.stringify(progress))).toEqual(progress);
    });
});
