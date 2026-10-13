/** Presentation only. No admission, stage, strength, clock or reward data lives here. */
import {crownEnemyForStage} from './crownEnemies';
const rooms=[
    {id:'gatehouse',wall:'#253444',stone:'#354858',face:'#506575',floor:'#172530',tile:'#3a4a55',motif:'windows'},
    {id:'moss-gallery',wall:'#263b37',stone:'#3b5149',face:'#5b7563',floor:'#192a26',tile:'#41584d',motif:'ivy'},
    {id:'archive',wall:'#342c40',stone:'#4a3d54',face:'#71617a',floor:'#261f30',tile:'#514350',motif:'shelves'},
    {id:'forge',wall:'#382d2a',stone:'#50403a',face:'#786156',floor:'#2a211f',tile:'#56443b',motif:'furnace'},
    {id:'banner-hall',wall:'#263044',stone:'#3c4862',face:'#647493',floor:'#1b2436',tile:'#46516b',motif:'banners'},
    {id:'crystal-vault',wall:'#2f304a',stone:'#454968',face:'#757d9d',floor:'#21263c',tile:'#4d5777',motif:'crystal'},
    {id:'sentinel-hall',wall:'#303a38',stone:'#46534f',face:'#717d6c',floor:'#232b28',tile:'#556057',motif:'pillars'},
    {id:'star-vault',wall:'#252943',stone:'#393d5f',face:'#646c91',floor:'#161e35',tile:'#3e496d',motif:'stars'},
    {id:'royal-approach',wall:'#302c3c',stone:'#484257',face:'#7b7184',floor:'#261e2e',tile:'#574758',motif:'banners'},
    {id:'throne-hall',wall:'#333743',stone:'#515060',face:'#85808b',floor:'#271f32',tile:'#665465',motif:'royal'},
] as const;
export function castleRoomForStage(id:number){
    const stage=Number.isFinite(id)?Math.max(1,Math.min(100,Math.trunc(id))):1,chapter=Math.ceil(stage/10),boss=stage%10===0;
    const foe=crownEnemyForStage(stage).foe;
    const chamber={pawn:'watch-courtyard',knight:'tower-gallery',bishop:'ritual-chamber',rook:'stone-bastion',queen:'mirror-salon',king:'royal-throne'}[foe];
    return {...rooms[chapter-1],foe,chamber,stage,chapter,variant:(stage-1)%10,boss,final:stage===100};
}
