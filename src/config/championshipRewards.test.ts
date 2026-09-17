import { describe, expect, it } from 'vitest';
import { CHAMPIONSHIP_REWARDS,LEGACY_CHAMPIONSHIP_REWARDS, championshipReward } from './championshipRewards';
import { BOSSES, campaignOpponent, emptyCampaign, equipReward, finishBoss, highestUnlockedLap, lapStars, mergeCampaignProgress, parseCampaign, rewardBoard, rewardUnlocked } from './campaign';
import { cpuSearchProfile } from './cpuDifficulty';
import { LANGUAGES } from '../locales/dict';
import { championshipKeys, championshipName, championshipText } from '../locales/championshipText';
import { moveTiePriority } from '../quantum-engine/ai/search';
import { rewardFrameParts } from '../components/rewardCraft';
import { rewardCraftText } from '../locales/rewardCraftText';

const victory={won:true,draw:false,playerMoves:16,hintsUsed:0,initialSeconds:600,remainingSeconds:420};
const clearLap=(progress:ReturnType<typeof emptyCampaign>,lap:number)=>BOSSES.reduce((value,boss)=>finishBoss(value,boss.id,victory,lap),progress);

describe('100 championship rewards',()=>{
    it('contains 30 boards, 25 materials, 20 effects, 15 frames and 10 scores in ten grades',()=>{
        expect(CHAMPIONSHIP_REWARDS).toHaveLength(100);
        expect(CHAMPIONSHIP_REWARDS.filter(item=>item.kind==='board')).toHaveLength(30);
        expect(CHAMPIONSHIP_REWARDS.filter(item=>item.kind==='piece')).toHaveLength(25);
        expect(CHAMPIONSHIP_REWARDS.filter(item=>item.kind==='effect')).toHaveLength(20);
        expect(CHAMPIONSHIP_REWARDS.filter(item=>item.kind==='music')).toHaveLength(10);
        expect(CHAMPIONSHIP_REWARDS.filter(item=>item.kind==='avatar')).toHaveLength(15);
        expect(new Set(CHAMPIONSHIP_REWARDS.map(item=>item.id)).size).toBe(100);
        expect(CHAMPIONSHIP_REWARDS.map(item=>item.requiredWins)).toEqual(Array.from({length:100},(_,i)=>i+1));
        for(let tier=1;tier<=10;tier++) expect(CHAMPIONSHIP_REWARDS.filter(item=>item.tier===tier)).toHaveLength(10);
        expect(championshipReward('champion-board-999')).toBeUndefined();
    });
    it('unlocks one reward per completed circuit, not per replay of the final boss',()=>{
        let progress=emptyCampaign();
        for(let lap=1;lap<=100;lap++) {
            const reward=CHAMPIONSHIP_REWARDS[lap-1];
            expect(rewardUnlocked(progress,reward.id)).toBe(false);
            progress=clearLap(progress,lap);
            expect(highestUnlockedLap(progress)).toBe(lap+1);
            expect(rewardUnlocked(progress,reward.id)).toBe(true);
            progress=finishBoss(progress,'sovereign',victory,lap);
            expect(highestUnlockedLap(progress)).toBe(lap+1);
        }
        expect(CHAMPIONSHIP_REWARDS.every(item=>rewardUnlocked(progress,item.id))).toBe(true);
        expect(parseCampaign(JSON.stringify(progress))).toEqual(progress);
    });
    it('keeps previous unlocks, denies skips and preserves medals on a loss',()=>{
        let progress=clearLap(emptyCampaign(),1);
        expect(finishBoss(progress,'nox',victory,3)).toBe(progress);
        expect(finishBoss(progress,'sovereign',victory,2)).toBe(progress);
        progress=finishBoss(progress,'nox',victory,2);
        expect(finishBoss(progress,'nox',{...victory,won:false},2)).toBe(progress);
        expect(lapStars(progress,1).sovereign).toBe(3);
        expect(lapStars(progress,2)).toEqual({nox:3});
    });
    it('equips only earned rewards of the correct kind',()=>{
        const initial=emptyCampaign(), complete=clearLap(clearLap(clearLap(initial,1),2),3);
        const board=CHAMPIONSHIP_REWARDS[0],effect=CHAMPIONSHIP_REWARDS[2];
        expect(equipReward(initial,'board',board.id)).toBe(initial);
        expect(equipReward(complete,'effect',effect.id).effect).toBe(effect.id);
        expect(equipReward(complete,'piece',effect.id)).toBe(complete);
        expect(equipReward(complete,'board',board.id).board).toBe(board.id);
        expect(rewardBoard(board.id as 'champion-board-001')).toEqual(board);
    });
    it('migrates original saves, protects incomplete circuits and merges two tabs',()=>{
        const old=JSON.stringify({version:1,stars:{nox:3,ember:3,oracle:3,sovereign:3},board:'slate',piece:'jade'});
        const migrated=parseCampaign(old);
        expect(migrated.version).toBe(2);
        expect(migrated.board).toBe('slate');
        expect(highestUnlockedLap(migrated)).toBe(2);
        const a=finishBoss(migrated,'nox',victory,2),b=clearLap(migrated,2);
        expect(highestUnlockedLap(mergeCampaignProgress(a,b))).toBe(3);
        const corrupt=parseCampaign(JSON.stringify({...a,ascensions:[{nox:2},{sovereign:3}]}));
        expect(corrupt.ascensions).toEqual([{nox:2}]);
    });
    it('increases search limits through circuit 5 while later circuits keep bounded variation',()=>{
        for(let boss=0;boss<4;boss++) {
            const first=campaignOpponent(boss,1),second=campaignOpponent(boss,2),fifth=campaignOpponent(boss,5),later=campaignOpponent(boss,100);
            expect(second.search.maxDepth).toBeGreaterThan(first.search.maxDepth);
            expect(second.search.timeLimitMs).toBeGreaterThan(first.search.timeLimitMs);
            expect(second.personality).not.toBe(first.personality);
            expect(later.search.maxDepth).toBe(fifth.search.maxDepth);
            expect(later.search.timeLimitMs).toBeLessThanOrEqual(6000);
            expect(later.search.tieBreakSeed).not.toBe(fifth.search.tieBreakSeed);
        }
        expect(cpuSearchProfile(5,{maxDepth:100,timeLimitMs:999999})).toEqual({maxDepth:8,timeLimitMs:6000});
    });
    it('uses deterministic tie-breaking without altering the default search',()=>{
        const move={pieceId:'test',target:{row:2,col:3},chosenType:2};
        expect(moveTiePriority(move)).toBe(0);
        expect(moveTiePriority(move,123)).toBe(moveTiePriority(move,123));
        expect(moveTiePriority(move,123)).not.toBe(moveTiePriority(move,456));
    });
    it('makes each grade richer without unbounded effect cost',()=>{
        for(let family=0;family<6;family++) {
            const presets=LEGACY_CHAMPIONSHIP_REWARDS.filter(item=>item.kind==='board'&&item.familyIndex===family);
            expect(presets).toHaveLength(10);
            expect(new Set(presets.map(item=>JSON.stringify(item))).size).toBe(10);
            let previous=0;
            for(const preset of presets) if(preset.kind==='board') {
                const parts=rewardFrameParts(preset);
                expect(parts.length).toBeGreaterThan(previous);
                previous=parts.length;
                expect(parts.length).toBeLessThanOrEqual(128);
                if(preset.motif==='walnut'||preset.motif==='marble') expect(preset.surface.metalness).toBe(0);
            }
        }
        for(const preset of CHAMPIONSHIP_REWARDS) if(preset.kind==='effect') {
            expect(preset.count).toBeLessThanOrEqual(52);
            expect(preset.layers).toBeLessThanOrEqual(4);
            expect(preset.duration).toBeLessThanOrEqual(3.2);
        }
    });
    it.each(LANGUAGES.map(item=>item.code))('translates 100 distinct reward names and all circuit labels in %s',lang=>{
        const names=CHAMPIONSHIP_REWARDS.map(item=>championshipName(lang,item));
        expect(new Set(names).size).toBe(100);
        expect(names.every(name=>name&&!name.includes('undefined'))).toBe(true);
        for(const key of championshipKeys) expect(championshipText(lang,key).length).toBeGreaterThan(0);
        for(const reward of CHAMPIONSHIP_REWARDS) if(reward.kind==='board') expect(rewardCraftText(lang,reward.motif)).toBeTruthy();
    });
});
