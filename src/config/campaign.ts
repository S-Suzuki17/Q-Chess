import { cpuDifficulty, type CPULevel, type CPUSearchProfile } from './cpuDifficulty';
import type { QoppeliaWeights } from '../quantum-engine/ai/evalQoppelia';
import { championshipReward, type ChampionBoardId, type ChampionEffectId } from './championshipRewards';

export type BossId = 'nox' | 'ember' | 'oracle' | 'sovereign';
export type CPUPersonality = 'balanced' | 'attacker' | 'guardian';
export type BoardFinish = 'standard' | 'slate' | 'obsidian' | ChampionBoardId;
export type PieceFinish = 'standard' | 'copper' | 'jade';
export type VictoryFinish = 'standard' | ChampionEffectId;
export const CAMPAIGN_STORAGE_KEY = 'qg_campaign_v1';
export const PERSONALITY_WEIGHTS: Record<CPUPersonality, Partial<QoppeliaWeights>> = {
    balanced: {},
    attacker: {pieceValue:1.35, originValue:.09, mobility:.055, safety:.4, candidateAllocation:.55},
    guardian: {pieceValue:1, originValue:.015, mobility:.025, safety:1.25, candidateAllocation:1.15, kingCandidate:1.6},
};
export const BOSSES: readonly {id:BossId; name:string; symbol:string; level:CPULevel; personality:CPUPersonality; reward:BoardFinish | PieceFinish; rewardKind:'board'|'piece'}[] = [
    {id:'nox', name:'NOX', symbol:'♞', level:1, personality:'balanced', reward:'slate', rewardKind:'board'},
    {id:'ember', name:'EMBER', symbol:'♜', level:3, personality:'attacker', reward:'copper', rewardKind:'piece'},
    {id:'oracle', name:'ORACLE', symbol:'♝', level:3, personality:'guardian', reward:'obsidian', rewardKind:'board'},
    {id:'sovereign', name:'SOVEREIGN', symbol:'♛', level:5, personality:'balanced', reward:'jade', rewardKind:'piece'},
];

export interface CampaignProgress {
    version:2;
    stars:Partial<Record<BossId,number>>;
    ascensions:Partial<Record<BossId,number>>[];
    board:BoardFinish;
    piece:PieceFinish;
    effect:VictoryFinish;
}
export interface CampaignOutcome { won:boolean; draw:boolean; playerMoves:number; hintsUsed:number }
export const emptyCampaign = (): CampaignProgress => ({version:2,stars:{},ascensions:[],board:'standard',piece:'standard',effect:'standard'});
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
    const championship=championshipReward(reward);
    return reward === 'standard' || (championship ? championship.requiredWins<highestUnlockedLap(progress) : BOSSES.some(boss => boss.reward === reward && !!progress.stars[boss.id]));
}
export function outcomeStars(outcome: CampaignOutcome) {
    return outcome.won ? 1 + Number(outcome.hintsUsed === 0) + Number(outcome.playerMoves <= 20) : 0;
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
    return {...saved,stars:mergeStars(current.stars,saved.stars),ascensions:Array.from({length:Math.max(current.ascensions.length,saved.ascensions.length)},(_,index)=>mergeStars(current.ascensions[index]??{},saved.ascensions[index]??{}))};
}
export function equipReward(progress: CampaignProgress, kind:'board'|'piece'|'effect', value: string): CampaignProgress {
    const championship=championshipReward(value);
    if (championship) return championship.kind===kind && rewardUnlocked(progress,value) ? {...progress,[kind]:value} : progress;
    if (kind==='effect') return value==='standard' ? {...progress,effect:'standard'} : progress;
    const valid = kind === 'board' ? ['standard','slate','obsidian'] : ['standard','copper','jade'];
    return valid.includes(value) && rewardUnlocked(progress,value) ? {...progress,[kind]:value} : progress;
}
/** Defensive parsing; old, corrupt, locked or unknown equipment never enters rendering. */
export function parseCampaign(raw: string | null): CampaignProgress {
    if (!raw) return emptyCampaign();
    try {
        const input = JSON.parse(raw);
        if (!input || ![1,2].includes(input.version)) return emptyCampaign();
        let progress = emptyCampaign();
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
            for (const entry of input.ascensions) {
                const stars=parseStars(entry);
                if (!Object.keys(stars).length) break;
                progress.ascensions.push(stars);
                if (Object.keys(stars).length<BOSSES.length) break;
            }
        }
        progress = equipReward(progress,'board',input.board);
        progress = equipReward(progress,'piece',input.piece);
        return equipReward(progress,'effect',input.effect);
    } catch { return emptyCampaign(); }
}

export const REWARD_BOARDS = {
    slate:{light:'#b6cad1',dark:'#415769',frame:'#172b38',rim:'#a9cbd8',label:'#dfedf4'},
    obsidian:{light:'#b7afc9',dark:'#373348',frame:'#201d2b',rim:'#b6a0d1',label:'#ece0ff'},
} as const;
export function rewardBoard(finish:BoardFinish) {
    const championship=championshipReward(finish);
    if (championship?.kind==='board') return championship;
    return finish==='slate'||finish==='obsidian' ? REWARD_BOARDS[finish] : undefined;
}
export const REWARD_PIECES = {
    standard:{white:'#f4e9d5',black:'#26374b',metalness:.16,roughness:.30,clearcoat:.55},
    copper:{white:'#f5dcc1',black:'#8c492f',metalness:.52,roughness:.28,clearcoat:.6},
    jade:{white:'#d6f1df',black:'#195246',metalness:.12,roughness:.24,clearcoat:.8},
} as const;
