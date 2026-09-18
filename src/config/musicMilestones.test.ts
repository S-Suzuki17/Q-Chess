import {expect,it} from 'vitest';
import {CIRCUIT_MUSIC} from './circuitMusic';
import {CHAMPIONSHIP_REWARDS} from './championshipRewards';
import {emptyCampaign,equipReward,parseCampaign,rewardUnlocked,totalCircuitStars} from './campaign';
import {finishStage} from './circuitStages';
const withStars=(total:number)=>({...emptyCampaign(),stageStars:[...Array(Math.floor(total/3)).fill(3),...(total%3?[total%3]:[])]});
it('makes all 15 unique music rewards reachable in the current circuit',()=>{
 const progress=withStars(300);
 const all=[...CIRCUIT_MUSIC,...CHAMPIONSHIP_REWARDS.filter(r=>r.kind==='music')];
 expect(all).toHaveLength(15);expect(new Set(all.map(r=>r.url)).size).toBe(15);
 for(const track of all)expect(rewardUnlocked(progress,track.id)).toBe(true);
});
it('unlocks exactly at each threshold and preserves selection after save/load',()=>{
 for(const track of CIRCUIT_MUSIC){
  expect(rewardUnlocked(withStars(track.requiredStars-1),track.id)).toBe(false);
  const progress=withStars(track.requiredStars);
  expect(rewardUnlocked(progress,track.id)).toBe(true);
  expect(parseCampaign(JSON.stringify(equipReward(progress,'music',track.id))).music).toBe(track.id);
 }
});
it('does not farm stars by repeating a stage, but awards the improvement',()=>{
 const base={...emptyCampaign(),stageStars:[1]};
 const result={won:true,draw:false,playerMoves:12,hintsUsed:0,initialSeconds:600,remainingSeconds:400};
 const better=finishStage(base,1,result);
 expect(totalCircuitStars(better)).toBe(3);
 expect(totalCircuitStars(finishStage(better,1,result))).toBe(3);
 expect(totalCircuitStars(finishStage(better,1,{...result,hintsUsed:1}))).toBe(3);
});
it('keeps previously earned boss music',()=>{
 const legacy={...emptyCampaign(),stars:{nox:1}};
 expect(rewardUnlocked(legacy,'midnight')).toBe(true);
 expect(parseCampaign(JSON.stringify({...legacy,music:'midnight'})).music).toBe('midnight');
});
