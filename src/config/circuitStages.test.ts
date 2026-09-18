import {describe,it,expect} from 'vitest';
import {CIRCUIT_STAGES,finishStage,parseStageStars,stageUnlocked} from './circuitStages';
import {emptyCampaign,equipReward,parseCampaign,rewardUnlocked,mergeCampaignProgress,outcomeStars} from './campaign';
import {CHAMPIONSHIP_REWARDS,REFERENCE_BOARDS} from './championshipRewards';
import {AVATAR_FRAMES} from './avatarFrames';
const win={won:true,draw:false,playerMoves:8,hintsUsed:0,initialSeconds:600,remainingSeconds:300};
describe('100-stage Crown Circuit',()=>{
 it('awards the 10-second third star for at most 40 own moves, regardless of remaining time',()=>{
  const progress={...emptyCampaign(),stageStars:[3,3]};
  for(const moves of [0,1,39,40]) {
   const outcome={...win,timeControl:'10s' as const,playerMoves:moves,remainingSeconds:0};
   expect(outcomeStars(outcome)).toBe(3);
   expect(finishStage(progress,3,outcome).stageStars).toEqual([3,3,3]);
  }
  for(const moves of [41,80,-1,1.5,NaN,Infinity]) {
   const outcome={...win,timeControl:'10s' as const,playerMoves:moves};
   expect(outcomeStars(outcome)).toBe(2);
   expect(finishStage(progress,3,outcome).stageStars).toEqual([3,3,2]);
  }
  expect(outcomeStars({...win,timeControl:'10s',playerMoves:40,hintsUsed:1})).toBe(2);
  expect(outcomeStars({...win,timeControl:'10s',playerMoves:40,won:false})).toBe(0);
  expect(outcomeStars({...win,timeControl:'10s',playerMoves:40,draw:true})).toBe(0);
  expect(finishStage({...progress,stageStars:[3,3,3]},3,{...win,playerMoves:41}).stageStars).toEqual([3,3,3]);
 });
 it('uses the real stage control and retains half-clock stars for timed games',()=>{
  const progress={...emptyCampaign(),stageStars:[3,3]};
  expect(finishStage(progress,3,{...win,playerMoves:41,timeControl:'10m'}).stageStars?.[2]).toBe(2);
  expect(finishStage(emptyCampaign(),1,{...win,playerMoves:80,remainingSeconds:300,timeControl:'10s'}).stageStars?.[0]).toBe(3);
  expect(finishStage(emptyCampaign(),1,{...win,playerMoves:1,remainingSeconds:299}).stageStars?.[0]).toBe(2);
 });
 it('cycles 10m / 3m / 10s with identical search profiles in each trio',()=>{
  expect(CIRCUIT_STAGES).toHaveLength(100);
  CIRCUIT_STAGES.forEach((stage,i)=>{
   expect(stage.timeControl).toBe(['10m','3m','10s'][i%3]);
   expect(stage.search).toEqual(CIRCUIT_STAGES[Math.floor(i/3)*3].search);
   expect(stage.search.timeLimitMs).toBeLessThanOrEqual(6000);
   if(i%3===0&&i>0)expect(stage.search.timeLimitMs).toBeGreaterThan(CIRCUIT_STAGES[i-1].search.timeLimitMs);
  });
  expect(CIRCUIT_STAGES[99]).toMatchObject({id:100,strength:34,timeControl:'10m'});
 });
 it('awards exactly one catalogue item per first clear, blocks skipping and ends at 100',()=>{
  let progress=emptyCampaign();
  for(let id=1;id<=100;id++){
   expect(stageUnlocked(progress,id)).toBe(true);
   expect(finishStage(progress,id+1,win)).toBe(progress);
   const before=CHAMPIONSHIP_REWARDS.filter(r=>rewardUnlocked(progress,r.id)).length;
   progress=finishStage(progress,id,win);
   expect(CHAMPIONSHIP_REWARDS.filter(r=>rewardUnlocked(progress,r.id))).toHaveLength(before+1);
   expect(finishStage(progress,id,win).stageStars).toHaveLength(id);
  }
  expect(stageUnlocked(progress,101)).toBe(false);
  expect(parseCampaign(JSON.stringify(progress))).toEqual(progress);
  const first=finishStage(emptyCampaign(),1,win);
  for(const legacy of ['slate','mahogany','midnight','bronze'])expect(rewardUnlocked(first,legacy)).toBe(false);
 });
 it('preserves better stars, requires actual remaining time and merges tabs',()=>{
  const first=finishStage(emptyCampaign(),1,win);
  expect(finishStage(first,1,{...win,hintsUsed:1,remainingSeconds:1}).stageStars).toEqual([3]);
  expect(finishStage(first,2,{...win,won:false})).toBe(first);
  expect(finishStage(first,2,{...win,initialSeconds:40,remainingSeconds:20}).stageStars).toEqual([3,3]);
  expect(finishStage(first,2,{...win,initialSeconds:40,remainingSeconds:19}).stageStars).toEqual([3,2]);
  expect(finishStage(first,2,{...win,initialSeconds:0,remainingSeconds:10}).stageStars).toEqual([3,2]);
  expect(mergeCampaignProgress(first,finishStage(first,2,win)).stageStars).toEqual([3,3]);
  expect(parseStageStars([3,2,0,3])).toEqual([3,2]);
 });
 it('previews freely but equips only earned frames; original saved unlocks remain',()=>{
  const initial=emptyCampaign(),all={...initial,stageStars:Array(100).fill(3)};
  expect(AVATAR_FRAMES).toHaveLength(15);
  for(const frame of AVATAR_FRAMES) {
   expect(equipReward(initial,'avatar',frame.id)).toBe(initial);
   expect(parseCampaign(JSON.stringify(equipReward(all,'avatar',frame.id))).avatar).toBe(frame.id);
  }
  const old=parseCampaign(JSON.stringify({version:2,stars:{nox:3,ember:3,oracle:3,sovereign:3},ascensions:[],board:'slate',piece:'jade'}));
  expect(old.stageStars).toEqual([1]);expect(old.board).toBe('slate');expect(old.piece).toBe('jade');
  REFERENCE_BOARDS.forEach(board=>{
   expect(rewardUnlocked(initial,board.id)).toBe(false);
   expect(rewardUnlocked({...initial,stageStars:Array(board.requiredWins-1).fill(1)},board.id)).toBe(false);
   const earned={...initial,stageStars:Array(board.requiredWins).fill(1)};
   expect(rewardUnlocked(earned,board.id)).toBe(true);
   expect(equipReward(earned,'board',board.id).piece).toBe(board.requiredWins===95?'iceglass':'neonglass');
  });
  expect(rewardUnlocked(initial,'iceglass')).toBe(false);
 });
});
