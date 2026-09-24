import { cpuDifficulty, type CPULevel, type CPUSearchProfile } from './cpuDifficulty';
import type { QoppeliaWeights } from '../quantum-engine/ai/evalQoppelia';
import { championshipReward, CHAMPIONSHIP_REWARDS, referencePieceForBoard, type ChampionBoardId, type ChampionEffectId, type ChampionPieceId, type ChampionMusicId } from './championshipRewards';
import { circuitMusic, type MusicReward } from './circuitMusic';
import { avatarFrame,type AvatarFrameId } from './avatarFrames';
import { parseStageStars } from './circuitStages';
import type { TimeControl } from '../types/game';
import {isFoundersItem,FOUNDERS_PIECE_ID} from './founders';

export type BossId = 'nox' | 'ember' | 'oracle' | 'sovereign';
export type CPUPersonality = 'balanced' | 'attacker' | 'guardian';
export type BoardFinish = 'standard' | 'slate' | 'obsidian' | 'walnut' | 'mahogany' | 'marble' | ChampionBoardId;
export type PieceFinish = 'standard' | 'iceglass' | 'neonglass' | 'copper' | 'jade' | 'boxwood' | 'ebony' | 'alabaster' | 'bronze' | 'silver' | 'gold' | 'crystal' | ChampionPieceId;
export type VictoryFinish = 'standard' | ChampionEffectId;
export const CAMPAIGN_STORAGE_KEY = 'qg_campaign_v1';
export const PERSONALITY_WEIGHTS: Record<CPUPersonality, Partial<QoppeliaWeights>> = {
    balanced: {},
    attacker: {pieceValue:1.35, originValue:.09, mobility:.055, safety:.4, candidateAllocation:.55},
    guardian: {pieceValue:1, originValue:.015, mobility:.025, safety:1.25, candidateAllocation:1.15, kingCandidate:1.6},
};
export const BOSSES: readonly {id:BossId; name:string; symbol:string; level:CPULevel; personality:CPUPersonality; reward:BoardFinish | PieceFinish; rewardKind:'board'|'piece'}[] = [
    {id:'nox', name:'CPU 01', symbol:'♞', level:1, personality:'balanced', reward:'mahogany', rewardKind:'board'},
    {id:'ember', name:'CPU 02', symbol:'♜', level:3, personality:'attacker', reward:'ebony', rewardKind:'piece'},
    {id:'oracle', name:'CPU 03', symbol:'♝', level:3, personality:'guardian', reward:'marble', rewardKind:'board'},
    {id:'sovereign', name:'CPU 04', symbol:'♛', level:5, personality:'balanced', reward:'alabaster', rewardKind:'piece'},
];

export interface CampaignProgress {
    /** Runtime-only entitlement, never trusted from local saves. */
    foundersOwned?:boolean;
    version:2;
    stars:Partial<Record<BossId,number>>;
    ascensions:Partial<Record<BossId,number>>[];
    board:BoardFinish;
    piece:PieceFinish;
    effect:VictoryFinish;
    music:MusicReward;
    stageStars?:number[];
    avatar?:'standard'|AvatarFrameId;
}
export interface CampaignOutcome { won:boolean; draw:boolean; playerMoves:number; hintsUsed:number; initialSeconds:number; remainingSeconds:number; timeControl?:TimeControl }
export const emptyCampaign = (): CampaignProgress => ({version:2,stars:{},ascensions:[],board:'standard',piece:'standard',effect:'standard',music:'standard',stageStars:[],avatar:'standard'});
export const rewardClearCount=(progress:CampaignProgress)=>Math.max(progress.stageStars?.length??0,highestUnlockedLap(progress)-1);
/** Best score per stage, never a sum of attempts or the old four-boss records. */
export const totalCircuitStars=(progress:CampaignProgress)=>parseStageStars(progress.stageStars??[]).reduce((sum,stars)=>sum+stars,0);
export const lapStars = (progress:CampaignProgress, lap=1) => lap===1 ? progress.stars : progress.ascensions[lap-2] ?? {};
export const lapCleared = (progress:CampaignProgress, lap=1) => BOSSES.every(boss=>!!lapStars(progress,lap)[boss.id]);
export function highestUnlockedLap(progress:CampaignProgress) {
    let lap=1;
    while (lapCleared(progress,lap)) lap++;
    return lap;
}
export function bossUnlocked(progress: CampaignProgress, id: BossId, lap=1) {
    if (!Number.isSafeInteger(lap) || lap<1 || lap>highestUnlockedLap(progress)) return false;
    const index = BOSSES.findIndex(boss => boss.id === id);
    return index >= 0 && (index === 0 || !!lapStars(progress,lap)[BOSSES[index-1].id]);
}
export function rewardUnlocked(progress: CampaignProgress, reward: string) {
    if(isFoundersItem(reward))return progress.foundersOwned===true;
    if (reward==='standard'||reward==='walnut'||reward==='boxwood') return true;
    if(reward==='iceglass'||reward==='neonglass')return rewardClearCount(progress)>=(reward==='iceglass'?95:99);
    const frame=avatarFrame(reward);
    if(frame) return rewardClearCount(progress)>=frame.requiredWins;
    const legacyBoss={slate:'nox',copper:'ember',obsidian:'oracle',jade:'sovereign'} as const;
    if (reward in legacyBoss) return !!progress.stars[legacyBoss[reward as keyof typeof legacyBoss]];
    const music=circuitMusic(reward);
    if (music) return totalCircuitStars(progress)>=music.requiredStars || (music.boss ? !!progress.stars[music.boss] : music.requiredWins<=highestUnlockedLap(progress)-1);
    const championship=championshipReward(reward);
    if (reward === 'bronze') return highestUnlockedLap(progress)-1>=3;
    if (reward === 'silver') return highestUnlockedLap(progress)-1>=5;
    if (reward === 'gold') return highestUnlockedLap(progress)-1>=7;
    if (reward === 'crystal') return highestUnlockedLap(progress)-1>=10;
    return championship ? championship.requiredWins<=(CHAMPIONSHIP_REWARDS.some(item=>item.id===reward)?rewardClearCount(progress):highestUnlockedLap(progress)-1) : BOSSES.some(boss => boss.reward === reward && !!progress.stars[boss.id]);
}
export function outcomeStars(outcome: CampaignOutcome, timeControl=outcome.timeControl) {
    const thirdStar=timeControl==='10s'
        ? Number.isSafeInteger(outcome.playerMoves)&&outcome.playerMoves>=0&&outcome.playerMoves<=40
        : timeStarEarned(outcome);
    return outcome.won && !outcome.draw ? 1 + Number(outcome.hintsUsed === 0) + Number(thirdStar) : 0;
}
export function timeStarEarned({initialSeconds,remainingSeconds}: Pick<CampaignOutcome,'initialSeconds'|'remainingSeconds'>) {
    return Number.isFinite(initialSeconds) && initialSeconds>0 && Number.isFinite(remainingSeconds)
        && remainingSeconds<=initialSeconds && remainingSeconds>=initialSeconds/2;
}
export function finishBoss(progress: CampaignProgress, id: BossId, outcome: CampaignOutcome, lap=1): CampaignProgress {
    if (!outcome.won || outcome.draw || !bossUnlocked(progress,id,lap)) return progress;
    const stars={...lapStars(progress,lap),[id]:Math.max(lapStars(progress,lap)[id] ?? 0,outcomeStars(outcome))};
    if (lap===1) return {...progress, stars};
    const ascensions=[...progress.ascensions];
    ascensions[lap-2]=stars;
    return {...progress,ascensions};
}

/** More demanding rematches, bounded to 6 seconds / depth 8 on every device. */
export function campaignOpponent(index:number, lap=1): {level:CPULevel;personality:CPUPersonality;strength:number;search:CPUSearchProfile} {
    const boss=BOSSES[index] ?? BOSSES[0];
    const circuit=Number.isSafeInteger(lap)&&lap>0 ? lap : 1;
    const strength=Math.min(circuit,5);
    const base=cpuDifficulty(boss.level);
    const personalities:CPUPersonality[]=['balanced','attacker','guardian'];
    return {
        level:strength===1 ? boss.level : strength===2&&boss.level===1 ? 3 : 5,
        personality:personalities[(personalities.indexOf(boss.personality)+circuit-1)%personalities.length],
        strength,
        search:{
            timeLimitMs:Math.min(6000,base.timeLimitMs+(strength-1)*(boss.level===5?500:1000)),
            maxDepth:Math.min(8,base.maxDepth+(strength-1)*2),
            // Change equal-scoring opening choices without random blunders or hidden advantages.
            tieBreakSeed:circuit===1 ? 0 : (Math.imul(circuit,2654435761)+index*97)>>>0,
        },
    };
}

/** Merge concurrent local saves without losing medals from either tab. */
export function mergeCampaignProgress(current:CampaignProgress,saved:CampaignProgress):CampaignProgress {
    const mergeStars=(a:CampaignProgress['stars'],b:CampaignProgress['stars'])=>Object.fromEntries(BOSSES.flatMap(boss=>{
        const best=Math.max(a[boss.id]??0,b[boss.id]??0);
        return best ? [[boss.id,best]] : [];
    }));
    return {...saved,stageStars:Array.from({length:Math.max(current.stageStars?.length??0,saved.stageStars?.length??0)},(_,index)=>Math.max(current.stageStars?.[index]??0,saved.stageStars?.[index]??0)),stars:mergeStars(current.stars,saved.stars),ascensions:Array.from({length:Math.max(current.ascensions.length,saved.ascensions.length)},(_,index)=>mergeStars(current.ascensions[index]??{},saved.ascensions[index]??{}))};
}
export function equipReward(progress: CampaignProgress, kind:'board'|'piece'|'effect'|'music'|'avatar', value: string): CampaignProgress {
    if(kind==='avatar') return (value==='standard'||avatarFrame(value))&&rewardUnlocked(progress,value)?{...progress,avatar:value as CampaignProgress['avatar']}:progress;
    const championship=championshipReward(value);
    if (championship) {
        if(championship.kind!==kind||!rewardUnlocked(progress,value))return progress;
        const paired=kind==='board'?referencePieceForBoard(value):undefined;
        return {...progress,[kind]:value,...(paired?{piece:paired}:{})};
    }
    if (kind==='music') return (value==='standard'||circuitMusic(value)) && rewardUnlocked(progress,value) ? {...progress,music:value as MusicReward} : progress;
    if (kind==='effect') return value==='standard' ? {...progress,effect:'standard'} : progress;
    const valid = kind === 'board' ? ['standard','slate','obsidian','walnut','mahogany','marble'] : ['standard','iceglass','neonglass','copper','jade','boxwood','ebony','alabaster','bronze','silver','gold','crystal'];
    return valid.includes(value) && rewardUnlocked(progress,value) ? {...progress,[kind]:value} : progress;
}
/** Defensive parsing; old, corrupt, locked or unknown equipment never enters rendering. */
export function parseCampaign(raw: string | null, foundersOwned=false): CampaignProgress {
    const fresh=()=>({...emptyCampaign(),...(foundersOwned?{foundersOwned:true}:{})});
    if (!raw) return fresh();
    try {
        const input = JSON.parse(raw);
        if (!input || ![1,2].includes(input.version)) return fresh();
        let progress = fresh();
        const parseStars=(value:unknown)=>{
            const result:CampaignProgress['stars']={};
            if (!value || typeof value!=='object') return result;
            for (const boss of BOSSES) {
                const stars=(value as Record<string,unknown>)[boss.id];
                if (typeof stars!=='number' || !Number.isInteger(stars) || stars<1 || stars>3) break;
                result[boss.id]=stars;
            }
            return result;
        };
        progress.stars=parseStars(input.stars);
        if (input.version===2 && lapCleared(progress) && Array.isArray(input.ascensions)) {
            for (const entry of input.ascensions.slice(0,100)) {
                const stars=parseStars(entry);
                if (!Object.keys(stars).length) break;
                progress.ascensions.push(stars);
                if (Object.keys(stars).length<BOSSES.length) break;
            }
        }
        progress.stageStars=Array.isArray(input.stageStars)?parseStageStars(input.stageStars):Array.from({length:Math.min(100,highestUnlockedLap(progress)-1)},()=>1);
        progress = equipReward(progress,'avatar',input.avatar);
        progress = equipReward(progress,'board',input.board);
        progress = equipReward(progress,'piece',input.piece);
        progress = equipReward(progress,'effect',input.effect);
        return equipReward(progress,'music',input.music);
    } catch { return fresh(); }
}

export const REWARD_BOARDS = {
    slate:{light:'#bec3ba',dark:'#566362',frameColor:'#25363b',rim:'#a1b7bc',label:'#dde8dd'},
    obsidian:{light:'#c6c7c4',dark:'#373b40',frameColor:'#171d24',rim:'#a8adb6',label:'#e6e8e7'},
    walnut:{light:'#d1b992',dark:'#574132',frameColor:'#30261f',rim:'#b69a64',label:'#eee0bf'},
    mahogany:{light:'#c4a482',dark:'#6a2c20',frameColor:'#2b130e',rim:'#a67c52',label:'#e8d8c8'},
    marble:{light:'#cbd0c8',dark:'#51625c',frameColor:'#303e39',rim:'#a7b7a7',label:'#e3e8d7'},
} as const;
export function rewardBoard(finish:BoardFinish) {
    const championship=championshipReward(finish);
    if (championship?.kind==='board') return championship;
    return finish in REWARD_BOARDS ? REWARD_BOARDS[finish as keyof typeof REWARD_BOARDS] : undefined;
}
export const REWARD_PIECES = {
    iceglass:{white:'#e2f6fa',black:'#9bbad7',metalness:0,roughness:.07,clearcoat:1},
    neonglass:{white:'#b0e4ea',black:'#ddabd4',metalness:0,roughness:.07,clearcoat:1},
    boxwood: { white: '#d3c4a1', black: '#323232', metalness: 0, roughness: 0.5, clearcoat: 0.1 },
    ebony: { white: '#d9cdaa', black: '#232b30', metalness: 0, roughness: 0.34, clearcoat: 0.3 },
    alabaster: { white: '#f0f0f0', black: '#2b302c', metalness: 0, roughness: 0.25, clearcoat: 1.0 },
    bronze: { white: '#cd7f32', black: '#3d2b1f', metalness: 1.0, roughness: 0.2, clearcoat: 0.1 },
    silver: { white: '#dbe0e3', black: '#394750', metalness: 1, roughness: 0.3, clearcoat: 0.1 },
    gold: { white: '#dfbc76', black: '#443628', metalness: 1, roughness: 0.28, clearcoat: 0.12 },
    crystal: { white: '#c3e0d9', black: '#214f49', metalness: 0, roughness: 0.24, clearcoat: 0.85 },
} as const;
export function rewardPiece(finish: PieceFinish) {
    if(finish===FOUNDERS_PIECE_ID)return {white:'#e9dec2',black:'#172536',metalness:.12,roughness:.28,clearcoat:.8};
    const championship = championshipReward(finish);
    const motif = championship?.kind === 'piece' ? championship.motif : finish;
    const alias=motif==='copper'?'bronze':motif==='jade'?'crystal':motif==='standard'?'boxwood':motif;
    const base=REWARD_PIECES[alias as keyof typeof REWARD_PIECES] ?? REWARD_PIECES.boxwood;
    // Grades refine a finish; they never make wood metallic or dark pieces pure black.
    const grade=championship?.kind==='piece'?championship.tier:1;
    return {...base,roughness:Math.max(motif==='iceglass'||motif==='neonglass'?.15:.23,base.roughness-(grade-1)*.008),clearcoat:Math.min(.9,base.clearcoat+(grade-1)*.018)};
}
