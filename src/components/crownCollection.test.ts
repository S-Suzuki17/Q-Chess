import { expect, it } from 'vitest';
import { emptyCampaign, rewardUnlocked } from '../config/campaign';
import { CHAMPIONSHIP_REWARDS, ARCHIVED_REWARDS } from '../config/championshipRewards';
import { CROWN_CATEGORIES, crownCollectionItems, crownEncounterForStage, crownPage, crownPageLayout } from './crownCollection';

it('keeps every actual stage reward in exactly one category without mutating progression',()=>{
 const progress=emptyCampaign(),before=JSON.stringify(progress);
 const catalogue=CROWN_CATEGORIES.flatMap(kind=>crownCollectionItems(progress,kind));
 for(const reward of CHAMPIONSHIP_REWARDS) expect(catalogue.filter(item=>item.id===reward.id)).toHaveLength(1);
 expect(JSON.stringify(progress)).toBe(before);
});
it('includes only acquired legacy cosmetics and retains the 95/99 paired pieces',()=>{
 const progress={...emptyCampaign(),stageStars:Array(99).fill(1)};
 const pieces=crownCollectionItems(progress,'piece');
 expect(pieces.map(item=>item.id)).toContain('iceglass');
 expect(pieces.map(item=>item.id)).toContain('neonglass');
 const legacy={...progress,stars:{nox:3,ember:3,oracle:3,sovereign:3},ascensions:Array.from({length:19},()=>({nox:3,ember:3,oracle:3,sovereign:3}))};
 const catalogue=CROWN_CATEGORIES.flatMap(kind=>crownCollectionItems(legacy,kind));
 for(const item of ARCHIVED_REWARDS) expect(catalogue.some(value=>value.id===item.id)).toBe(rewardUnlocked(legacy,item.id));
});
it('paginates every category without gaps or duplicate items',()=>{
 for(const category of CROWN_CATEGORIES){
  const items=crownCollectionItems(emptyCampaign(),category);
  for(const size of [1,2,3,4,6,8]){
   const {pageCount}=crownPage(items,0,size);
   expect(Array.from({length:pageCount},(_,page)=>crownPage(items,page,size).items).flat()).toEqual(items);
   expect(crownPage(items,999,size).page).toBe(pageCount-1);
  }
 }
});
it('uses fewer cards when width or height is constrained',()=>{
 expect(crownPageLayout(320,300)).toEqual({columns:1,rows:1,size:1});
 expect(crownPageLayout(366,510)).toEqual({columns:2,rows:2,size:4});
 expect(crownPageLayout(1080,500)).toEqual({columns:4,rows:2,size:8});
 expect(crownPageLayout(1080,200).size).toBe(4);
});
it('reserves the King boss for the real final stage and keeps every stage mapped',()=>{
 for(let stageId=1;stageId<=100;stageId++){
  const encounter=crownEncounterForStage(stageId);
  expect(encounter.stageId).toBe(stageId);
  expect(encounter.finalBoss).toBe(stageId===100);
  expect(encounter.foe==='king').toBe(stageId===100);
 }
 expect(crownEncounterForStage(1).foe).toBe('pawn');
 expect(crownEncounterForStage(99).foe).toBe('queen');
 expect(crownEncounterForStage(100)).toEqual({stageId:100,foe:'king',finalBoss:true});
});
