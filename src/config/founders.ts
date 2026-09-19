import type {ChampionBoard,ChampionPiece} from './championshipRewards';

// A separate, permanent collection. Never insert these into the 100 stage slots.
export const FOUNDERS_PRODUCT_ID='qg_founders_preregister';
export const FOUNDERS_BOARD_ID='champion-board-founders';
export const FOUNDERS_PIECE_ID='champion-piece-founders';
export const FOUNDERS_FRAME_ID='avatar-frame-founders';
export const FOUNDERS_ITEMS=[{kind:'avatar',id:FOUNDERS_FRAME_ID},{kind:'board',id:FOUNDERS_BOARD_ID},{kind:'piece',id:FOUNDERS_PIECE_ID}] as const;
export const isFoundersItem=(id:unknown)=>FOUNDERS_ITEMS.some(item=>item.id===id);
export const FOUNDERS_BOARD:ChampionBoard={
    id:FOUNDERS_BOARD_ID,kind:'board',motif:'obsidian',profile:'gallery',tier:8,familyIndex:4,requiredWins:0,
    light:'#d5c6a4',dark:'#252e39',frameColor:'#101823',rim:'#b99350',label:'#f0dfba',accent:'#f1d398',
    frameMaterial:{metalness:0,roughness:.3,clearcoat:.8},surface:{metalness:0,roughness:.45,clearcoat:.25},inlay:{metalness:1,roughness:.29,clearcoat:.2},
};
export const FOUNDERS_PIECE:ChampionPiece={id:FOUNDERS_PIECE_ID,kind:'piece',motif:'alabaster',form:'crowned',tier:8,familyIndex:0,requiredWins:0};
export const FOUNDERS_FRAME={id:FOUNDERS_FRAME_ID,tier:15,requiredWins:Number.POSITIVE_INFINITY,motif:'crown',color:'#bd9450',accent:'#fff0c1'} as const;
