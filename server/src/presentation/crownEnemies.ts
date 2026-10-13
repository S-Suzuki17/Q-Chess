export type CrownEnemyFoe = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type CrownEnemyEntrance = 'advance' | 'vault' | 'glide' | 'descend' | 'turn' | 'coronation';
export const CROWN_ENEMIES = [
 {id:'crown-pawn',stageId:1,foe:'pawn',finalBoss:false,crest:0,name:{ja:'セイア',en:'Seia'},color:'#a3b6b9',pose:'vanguard',entrance:'advance'},
 {id:'crown-knight',stageId:2,foe:'knight',finalBoss:false,crest:3,name:{ja:'カイル',en:'Kyle'},color:'#9acbd7',pose:'duelist',entrance:'vault'},
 {id:'crown-bishop',stageId:3,foe:'bishop',finalBoss:false,crest:7,name:{ja:'ソル',en:'Sol'},color:'#d6cab0',pose:'oracle',entrance:'glide'},
 {id:'crown-rook',stageId:4,foe:'rook',finalBoss:false,crest:2,name:{ja:'ドルン',en:'Dorn'},color:'#b6c6af',pose:'warden',entrance:'descend'},
 {id:'crown-queen',stageId:5,foe:'queen',finalBoss:false,crest:6,name:{ja:'アステル',en:'Aster'},color:'#d5adb7',pose:'sentinel',entrance:'turn'},
 {id:'crown-king',stageId:100,foe:'king',finalBoss:true,crest:19,name:{ja:'アウレウス',en:'Aureus'},color:'#e9cf97',pose:'sovereign',entrance:'coronation'},
] as const;
export type CrownEnemy = typeof CROWN_ENEMIES[number];
/** Presentation assignment only. All 100 stage/search/reward contracts remain separate. */
export function crownEnemyForStage(stageId:number):CrownEnemy {
 const bounded=Math.min(100,Math.max(1,Math.trunc(stageId)||1));
 return CROWN_ENEMIES[bounded===100?5:(bounded-1)%5];
}
export const crownEnemyName=(lang:string,enemy:CrownEnemy)=>enemy.name[lang==='ja'?'ja':'en'];
export const crownRivalName=(lang:string,level=1)=>crownEnemyName(lang,CROWN_ENEMIES[level>=5?4:level>=3?1:0]);
/** A server-random match UUID supplies the draw; never consume gameplay randomness. */
export function crownEnemyForMatch(matchId:string):CrownEnemy {
 let hash=2166136261;
 for(let index=0;index<matchId.length;index++)hash=Math.imul(hash^matchId.charCodeAt(index),16777619)>>>0;
 return CROWN_ENEMIES[hash%CROWN_ENEMIES.length];
}
export function confirmedCrownEnemyForMatch(matchId:string,cpu:unknown):CrownEnemy|null {
 if(!cpu||typeof cpu!=='object')return null;
 const value=cpu as {side?:unknown;rating?:unknown};
 return (value.side==='host'||value.side==='joiner')&&typeof value.rating==='number'&&Number.isFinite(value.rating)&&value.rating>=0?crownEnemyForMatch(matchId):null;
}
const knownNames=new Set<string>(CROWN_ENEMIES.flatMap(enemy=>[enemy.name.ja,enemy.name.en]));
export const knownCrownEnemyName=(value:unknown):string|null=>typeof value==='string'&&knownNames.has(value)?value:null;
