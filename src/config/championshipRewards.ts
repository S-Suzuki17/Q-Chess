export type ChampionBoardId = `champion-board-${string}`;
export type ChampionEffectId = `champion-effect-${string}`;
export type BoardMotif = 'artisan' | 'stone' | 'forge' | 'crystal' | 'obsidian' | 'imperial';
export type EffectMotif = 'rings' | 'shards' | 'starfall' | 'corona';
type RewardBase = { requiredWins:number; tier:number; familyIndex:number };
export type ChampionBoard = RewardBase & {
    id:ChampionBoardId; kind:'board'; motif:BoardMotif;
    light:string; dark:string; frame:string; rim:string; label:string;
    accent:string; metalness:number; roughness:number;
};
export type ChampionEffect = RewardBase & {
    id:ChampionEffectId; kind:'effect'; motif:EffectMotif;
    color:string; accent:string; count:number; layers:number; duration:number;
};
export type ChampionshipReward = ChampionBoard | ChampionEffect;

// Six constructed frame families and four animated victory families, in ten grades.
const boards:BoardMotif[]=['artisan','stone','forge','crystal','obsidian','imperial'];
const effects:EffectMotif[]=['rings','shards','starfall','corona'];
const palettes = [
    ['#c3c4aa','#485142','#263129','#c6ad75','#dce2c4'],
    ['#b5c8d0','#3a5064','#1c2a3b','#9ebfcb','#dbedf5'],
    ['#d4bda9','#654639','#352822','#d4a272','#f8dac0'],
    ['#c1c9bd','#3b574b','#152e27','#8cbba5','#d9f3dd'],
    ['#c3bbd2','#4a3c64','#282037','#b29dd1','#ece0fa'],
    ['#ddc8b4','#66444c','#36202b','#dcad94','#fff0de'],
    ['#babfcc','#343f5c','#18233c','#bab9e6','#e7eafa'],
    ['#c1d4ce','#255153','#122e32','#b9ddc0','#e2fff2'],
    ['#dbcfb0','#4e4446','#292533','#e8c885','#fff0c5'],
    ['#e2d4b2','#3b3d51','#1b2134','#f1ce75','#fff5c8'],
] as const;
const layout = ['board','board','effect','board','effect','board','effect','board','effect','board'] as const;

export const CHAMPIONSHIP_REWARDS:readonly ChampionshipReward[] = Array.from({length:100},(_,index)=>{
    const tier=Math.floor(index/10)+1, position=index%10, kind=layout[position];
    const familyIndex=layout.slice(0,position).filter(value=>value===kind).length;
    const [light,dark,frame,rim,label]=palettes[(tier-1+familyIndex)%palettes.length];
    const base={requiredWins:index+1,tier,familyIndex};
    const suffix=String(index+1).padStart(3,'0');
    if (kind==='board') return {...base,id:`champion-board-${suffix}` as ChampionBoardId,kind,motif:boards[familyIndex],
        light,dark,frame,rim: tier>=7 ? palettes[tier-1][3] : rim,label,
        accent:palettes[tier-1][4],metalness:.12+(tier-1)*.075,roughness:.64-(tier-1)*.038};
    return {...base,id:`champion-effect-${suffix}` as ChampionEffectId,kind,motif:effects[familyIndex],
        color:rim,accent:label,count:12+tier*4,layers:1+Math.floor((tier-1)/3),duration:2+tier*.12};
});
const byId=new Map(CHAMPIONSHIP_REWARDS.map(reward=>[reward.id,reward]));
export const championshipReward = (id:string) => byId.get(id as ChampionshipReward['id']);
