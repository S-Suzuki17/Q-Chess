import type {GameState,Move,QuantumPiece} from '../quantum-engine/types';
import {PIECE_KING as K,PIECE_QUEEN as Q,PIECE_ROOK as R,PIECE_BISHOP as B,PIECE_KNIGHT as N,PIECE_PAWN as P} from '../quantum-engine/constants';
import {getAllConcreteMoves} from '../quantum-engine/ai/random';
import {applyMove} from '../quantum-engine/stateTransition';
import {isCheckmate,isPlayerInCheck} from '../quantum-engine/terminal';

export type WeeklyProblem = {id:string;positionKey:string;state:GameState};
export type WeeklyProblemSet = {week:string;opensAt:string;closesAt:string;problems:WeeklyProblem[]};
const WEEK = 7*86400000;

/** Tuesday maintenance starts at 02:00 UTC; the new set opens at 05:00 UTC (14:00 JST). */
export function learningWeek(now:number, preparing=false) {
    const date=new Date(now);
    const tuesday=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-((date.getUTCDay()+5)%7),preparing?2:5);
    const start=tuesday>now?tuesday-WEEK:tuesday;
    const opens=start+(preparing?3*3600000:0);
    return {week:new Date(opens).toISOString().slice(0,10),opensAt:new Date(opens).toISOString(),closesAt:new Date(opens+WEEK).toISOString()};
}
function seededRandom(seed:string) {
    let value=2166136261;
    for(const char of seed)value=Math.imul(value^char.charCodeAt(0),16777619);
    return (max:number)=>{
        value=(value+0x6d2b79f5)|0;
        let n=Math.imul(value^(value>>>15),1|value);
        n^=n+Math.imul(n^(n>>>7),61|n);
        return Math.floor(((n^(n>>>14))>>>0)/4294967296*max);
    };
}
function piece(id:string,owner:'white'|'black',state:number,square:number):QuantumPiece {
    const position={row:Math.floor(square/8),col:square%8};
    return {id,owner,state,position,origin:{...position},alive:true,hasMoved:true,promoted:false};
}
export function problemPositionKey(state:GameState) {
    return state.pieces.map(p=>`${p.owner[0]}:${p.state}:${p.position.row}${p.position.col}`).sort().join('|');
}
export function isProblemMate(state:GameState,move:Move):boolean {
    try {
        // Weekly problems use confirmed pieces and orthodox checkmate: never capture a king.
        if(state.pieces.some(p=>p.alive&&p.state===K&&p.position.row===move.target.row&&p.position.col===move.target.col))return false;
        const playable=getAllConcreteMoves(state,{allPromotions:true,playable:true})
            .some(m=>m.pieceId===move.pieceId&&m.target.row===move.target.row&&m.target.col===move.target.col&&m.chosenType===move.chosenType&&m.promotionTarget===move.promotionTarget);
        if(!playable)return false;
        const next=applyMove(state,move);
        return next.pieces.filter(p=>p.alive&&p.state===K).length===2&&!isPlayerInCheck('white',next)&&isCheckmate('black',next);
    }catch{return false;}
}
export function mateSolutions(state:GameState):Move[] {
    return getAllConcreteMoves(state,{allPromotions:true,playable:true}).filter(move=>{
        try {
            if(state.pieces.some(p=>p.owner==='black'&&p.state===K&&p.position.row===move.target.row&&p.position.col===move.target.col))return false;
            const next=applyMove(state,move);
            return !isPlayerInCheck('white',next)&&isCheckmate('black',next);
        }catch{return false;}
    });
}

/** Reproducible compositions, each independently checked for exactly one mate in one.
 * Persisted position keys exclude all previously published positions. No external puzzle license or API. */
export async function generateWeeklyProblems(now:number,previous:ReadonlySet<string>=new Set()):Promise<WeeklyProblemSet> {
    const period=learningWeek(now,true),random=seededRandom('qg-orthodox-v1:'+period.week);
    const problems:WeeklyProblem[]=[];
    const used=new Set(previous);
    for(let attempt=0;attempt<30000&&problems.length<10;attempt++){
        // Yield between candidates so maintenance does not block reconnects or active matches.
        if(attempt%20===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
        const squares=new Set<number>();
        const square=()=>{let s=random(64);while(squares.has(s))s=random(64);squares.add(s);return s;};
        const king=square();
        // Edge kings offer a useful range of beginner mating patterns.
        if(![0,7].includes(Math.floor(king/8))&&![0,7].includes(king%8))continue;
        const pieces=[piece('bk','black',K,king),piece('wk','white',K,square()),
            piece('attack','white',random(2)?Q:R,square()),piece('support','white',[R,B,N][random(3)],square())];
        if(random(2)){
            const s=square();
            if(Math.floor(s/8)>0&&Math.floor(s/8)<7)pieces.push(piece('blocker','black',P,s));
        }
        const state:GameState={pieces,sideToMove:'white',ply:0,winner:null,captured:{white:0,black:0},hash:''};
        const key=problemPositionKey(state);
        if(used.has(key)||isPlayerInCheck('black',state)||isPlayerInCheck('white',state))continue;
        if(mateSolutions(state).length!==1)continue;
        used.add(key);problems.push({id:String(problems.length+1),positionKey:key,state});
    }
    if(problems.length!==10)throw new Error('WEEKLY_GENERATION_INCOMPLETE');
    return {...period,problems};
}
