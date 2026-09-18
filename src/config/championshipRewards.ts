import { AVATAR_FRAMES,type AvatarFrameId } from './avatarFrames';
import { rewardTrackForTier } from './musicTracks';
export type ChampionBoardId = `champion-board-${string}`;
export type ChampionEffectId = `champion-effect-${string}`;
export type ChampionPieceId = `champion-piece-${string}`;
export type ChampionMusicId = `champion-music-${string}`;
export type BoardMotif = 'walnut' | 'marble' | 'brass' | 'crystal' | 'obsidian' | 'gold';
export type PieceMotif = 'boxwood' | 'ebony' | 'alabaster' | 'bronze' | 'silver' | 'gold' | 'crystal';
export type EffectMotif = 'rings' | 'shards' | 'starfall' | 'corona';
export type PieceForm='staunton'|'crowned'|'spire'|'citadel'|'fluted'|'faceted';
export type BoardProfile='inlaid'|'stepped'|'floating'|'armored'|'gallery';
export type CraftFinish = {metalness:number;roughness:number;clearcoat:number};
type RewardBase = {requiredWins:number;tier:number;familyIndex:number};
export type ChampionBoard = RewardBase & {
    id:ChampionBoardId;kind:'board';motif:BoardMotif;profile?:BoardProfile;
    light:string;dark:string;frameColor:string;rim:string;label:string;accent:string;
    frameMaterial:CraftFinish;surface:CraftFinish;inlay:CraftFinish;
};
export type ChampionEffect = RewardBase & {
    id:ChampionEffectId;kind:'effect';motif:EffectMotif;
    color:string;accent:string;count:number;layers:number;duration:number;
};
export type ChampionPiece = RewardBase & {id:ChampionPieceId;kind:'piece';motif:PieceMotif;form?:PieceForm};
export type ChampionMusic = RewardBase & {id:ChampionMusicId;kind:'music';motif:'score';url:string};
export type ChampionAvatar=RewardBase & {id:AvatarFrameId;kind:'avatar';motif:'frame'};
export type ChampionshipReward = ChampionBoard | ChampionEffect | ChampionPiece | ChampionMusic | ChampionAvatar;

const finish=(metalness:number,roughness:number,clearcoat=0):CraftFinish=>({metalness,roughness,clearcoat});
const woods=finish(0,.5,.22),stone=finish(0,.57,.06),metal=finish(1,.38,.1);
// Stable material families: grades add joinery and engraving, not arbitrary hue shifts.
const families=[
    {motif:'walnut',light:'#d1b992',dark:'#574132',frameColor:'#30261f',rim:'#b69a64',label:'#eee0bf',accent:'#dbc6a3',frameMaterial:woods,surface:finish(0,.58,.12),inlay:finish(0,.48,.15)},
    {motif:'marble',light:'#cbd0c8',dark:'#51625c',frameColor:'#303e39',rim:'#a7b7a7',label:'#e3e8d7',accent:'#dde0ce',frameMaterial:stone,surface:stone,inlay:finish(0,.48)},
    {motif:'brass',light:'#c7c5b9',dark:'#484f51',frameColor:'#303839',rim:'#b97d58',label:'#e4dbc6',accent:'#d0bd95',frameMaterial:metal,surface:finish(0,.6),inlay:metal},
    {motif:'crystal',light:'#c3d3ca',dark:'#375a52',frameColor:'#193d35',rim:'#86b1a0',label:'#daf0da',accent:'#c2dfcc',frameMaterial:finish(0,.33,.65),surface:finish(0,.48,.25),inlay:finish(0,.35,.45)},
    {motif:'obsidian',light:'#c6c7c4',dark:'#373b40',frameColor:'#171d24',rim:'#a8adb6',label:'#e6e8e7',accent:'#d8d6c8',frameMaterial:finish(0,.34,.7),surface:finish(0,.52,.2),inlay:metal},
    {motif:'gold',light:'#d9cead',dark:'#43464f',frameColor:'#202935',rim:'#b9a068',label:'#f1e3bb',accent:'#e4d5b5',frameMaterial:finish(0,.42,.45),surface:finish(0,.52,.15),inlay:finish(1,.36,.12)},
] as const;
export function craftedBoard(index:number,familyIndex:number):ChampionBoard {
    return {...families[familyIndex],id:`champion-board-${String(index+1).padStart(3,'0')}`,kind:'board',requiredWins:index+1,tier:Math.floor(index/10)+1,familyIndex};
}
const effects:EffectMotif[]=['rings','shards','starfall','corona'];
const effect=(index:number,familyIndex:number):ChampionEffect=>{
    const tier=Math.floor(index/10)+1;
    return {id:`champion-effect-${String(index+1).padStart(3,'0')}`,kind:'effect',motif:effects[familyIndex],requiredWins:index+1,tier,familyIndex,
        color:['#bca770','#a2c6bc','#aebbd4','#d7b66c'][familyIndex],accent:'#eee3c9',count:12+tier*4,layers:1+Math.floor((tier-1)/3),duration:2+tier*.12};
};
// Keep every previously-issued ID resolvable, even if its slot now grants another kind.
const previousLayout=['board','board','effect','board','effect','board','effect','board','effect','board'] as const;
export const LEGACY_CHAMPIONSHIP_REWARDS=Array.from({length:100},(_,index)=>{
    const position=index%10,kind=previousLayout[position];
    const family=previousLayout.slice(0,position).filter(value=>value===kind).length;
    return kind==='board'?craftedBoard(index,family):effect(index,family);
});
const layout=['board','piece','effect','board','piece','board','music','piece','effect','board'] as const;
const pieceFamilies:PieceMotif[][]=[['boxwood','ebony','alabaster'],['boxwood','alabaster','bronze'],['ebony','bronze','silver'],['alabaster','silver','gold'],['bronze','gold','crystal']];
const previousMixedRewards:readonly ChampionshipReward[]=Array.from({length:100},(_,index)=>{
    const position=index%10,kind=layout[position],tier=Math.floor(index/10)+1;
    const slot=layout.slice(0,position).filter(value=>value===kind).length;
    const base={requiredWins:index+1,tier,familyIndex:slot};
    if(kind==='board') return craftedBoard(index,[0,1,4,5][slot]);
    if(kind==='effect') return effect(index,slot===0?(tier%2===1?0:1):(tier%2===1?3:2));
    if(kind==='piece') return {...base,id:`champion-piece-${String(index+1).padStart(3,'0')}` as ChampionPieceId,kind,motif:pieceFamilies[Math.floor((tier-1)/2)][slot]};
    return {...base,id:`champion-music-${String(index+1).padStart(3,'0')}` as ChampionMusicId,kind,motif:'score',url:rewardTrackForTier(tier).url};
});
const visualLayout=['board','piece','effect','board','piece','effect','board','piece','effect','board','piece','board','piece','effect','board'] as const;
let visualIndex=0,boardIndex=0,pieceIndex=0,effectIndex=0;
const pieceMotifs:PieceMotif[]=['boxwood','ebony','alabaster','bronze','silver','gold','crystal'];
const generatedRewards:readonly ChampionshipReward[]=Array.from({length:100},(_,index)=>{
    const tier=Math.floor(index/10)+1,base={requiredWins:index+1,tier,familyIndex:0};
    const frame=AVATAR_FRAMES.find(value=>value.requiredWins===index+1);
    if(frame) return {...base,id:frame.id,kind:'avatar',motif:'frame'};
    if(index%10===6) return {...base,id:`champion-music-${String(index+1).padStart(3,'0')}` as ChampionMusicId,kind:'music',motif:'score',url:rewardTrackForTier(tier).url};
    const kind=visualLayout[visualIndex++%15];
    if(kind==='board') {const slot=boardIndex++;return {...craftedBoard(index,slot%6),profile:(['inlaid','stepped','floating','armored','gallery'] as const)[Math.floor(slot/6)]};}
    if(kind==='effect') return effect(index,effectIndex++%4);
    const slot=pieceIndex++;
    return {...base,id:`champion-piece-${String(index+1).padStart(3,'0')}` as ChampionPieceId,kind:'piece',motif:pieceMotifs[slot%7],form:(['crowned','spire','citadel','fluted','faceted'] as const)[slot%5]};
});
export const REFERENCE_BOARDS:readonly ChampionBoard[]=[
    {...craftedBoard(94,0),id:'champion-board-reference-wood',requiredWins:95,profile:'gallery',light:'#d4b587',dark:'#4d3020',frameColor:'#2d1b12',rim:'#bd9760',surface:finish(0,.38,.5)},
    {...craftedBoard(98,4),id:'champion-board-reference-neon',requiredWins:99,profile:'floating',light:'#627b8a',dark:'#101c28',frameColor:'#0c1420',rim:'#39bfcf',label:'#a1d4df',accent:'#cf50c2',surface:finish(0,.3,.85),frameMaterial:finish(0,.3,.8)},
];
export const CHAMPIONSHIP_REWARDS:readonly ChampionshipReward[]=generatedRewards.map(reward=>REFERENCE_BOARDS.find(board=>board.requiredWins===reward.requiredWins)??reward);
export const ARCHIVED_REWARDS=[...new Map([...LEGACY_CHAMPIONSHIP_REWARDS,...previousMixedRewards,...generatedRewards].map(reward=>[reward.id,reward])).values()].filter(reward=>!CHAMPIONSHIP_REWARDS.some(current=>current.id===reward.id));
export const referencePieceForBoard=(id:string)=>id==='champion-board-reference-wood'?'iceglass':id==='champion-board-reference-neon'?'neonglass':undefined;
const byId=new Map<string,ChampionshipReward>([...LEGACY_CHAMPIONSHIP_REWARDS,...previousMixedRewards,...generatedRewards,...CHAMPIONSHIP_REWARDS,...REFERENCE_BOARDS].map(reward=>[reward.id,reward]));
export const championshipReward=(id:string)=>byId.get(id);
