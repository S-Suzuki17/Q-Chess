import {describe,it,expect} from 'vitest';
import {emptyCampaign,equipReward,parseCampaign,rewardUnlocked} from './campaign';
import {CHAMPIONSHIP_REWARDS,championshipReward} from './championshipRewards';
import {FOUNDERS_ITEMS,FOUNDERS_BOARD_ID,FOUNDERS_FRAME_ID} from './founders';
import {acquiredCosmetics} from '../lib/cosmeticOptions';
import {createCampaignStore} from '../lib/campaignStore';
import {foundersRewardName,foundersText} from '../locales/foundersText';
import {LANGUAGES} from '../locales/dict';
describe('separate verified founders collection',()=>{
 it('does not occupy or unlock through any of the 100 stage slots',()=>{
  expect(CHAMPIONSHIP_REWARDS).toHaveLength(100);
  for(const item of FOUNDERS_ITEMS){
   expect(CHAMPIONSHIP_REWARDS.some(reward=>reward.id===item.id)).toBe(false);
   expect(rewardUnlocked({...emptyCampaign(),stageStars:Array(100).fill(3)},item.id)).toBe(false);
   expect(acquiredCosmetics(emptyCampaign(),item.kind)).not.toContain(item.id);
  }
  expect(championshipReward(FOUNDERS_BOARD_ID)?.kind).toBe('board');
 });
 it('ignores forged saved ownership and restores verified equipment',()=>{
  const owned={...emptyCampaign(),foundersOwned:true};
  let progress=owned;
  for(const item of FOUNDERS_ITEMS)progress=equipReward(progress,item.kind,item.id) as typeof owned;
  const raw=JSON.stringify(progress),unverified=parseCampaign(raw),verified=parseCampaign(raw,true);
  for(const item of FOUNDERS_ITEMS){
   expect(unverified[item.kind]).not.toBe(item.id);expect(verified[item.kind]).toBe(item.id);
   expect(acquiredCosmetics(verified,item.kind)).toContain(item.id);
  }
  expect(unverified.foundersOwned).toBeUndefined();
 });
 it('never serializes ownership; logout revokes even after a storage error',()=>{
  let saved:string|null=null,fail=false;
  const store=createCampaignStore(()=>({getItem:()=>saved,setItem:(_key,value)=>{if(fail)throw new Error('quota');saved=value;}}));
  store.load();store.setFoundersAccess(true);store.update(value=>equipReward(value,'board',FOUNDERS_BOARD_ID));
  expect(saved).not.toContain('foundersOwned');
  fail=true;store.update(value=>equipReward(value,'avatar',FOUNDERS_FRAME_ID));
  store.setFoundersAccess(false);
  expect(store.getSnapshot().progress.foundersOwned).toBeUndefined();
  expect(store.getSnapshot().progress.board).not.toBe(FOUNDERS_BOARD_ID);
  expect(store.getSnapshot().progress.avatar).not.toBe(FOUNDERS_FRAME_ID);
  store.setFoundersAccess(true);
  expect(store.getSnapshot().progress.board).toBe(FOUNDERS_BOARD_ID);
 });
 it('does not write during authentication restore, and clears forged updates',()=>{
  let saved=JSON.stringify({...emptyCampaign(),board:FOUNDERS_BOARD_ID});
  const before=saved,store=createCampaignStore(()=>({getItem:()=>saved,setItem:(_key,value)=>{saved=value;}}));
  store.load();store.setFoundersAccess(false);expect(saved).toBe(before);
  store.setFoundersAccess(true);expect(store.getSnapshot().progress.board).toBe(FOUNDERS_BOARD_ID);
  store.setFoundersAccess(false);store.update(value=>({...value,foundersOwned:true}));
  expect(store.getSnapshot().progress.foundersOwned).toBeUndefined();
 });
 it('names all three rewards in every supported locale',()=>{
  for(const {code} of LANGUAGES){
   expect(foundersText(code,'delivery')).toBeTruthy();
   for(const item of FOUNDERS_ITEMS)expect(foundersRewardName(code,item.id)).toBeTruthy();
  }
 });
});
