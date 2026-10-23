import type {GameState,Move,QuantumPiece} from '../quantum-engine/types';
import {PIECE_KING as K,PIECE_QUEEN as Q,PIECE_ROOK as R,PIECE_BISHOP as B,PIECE_KNIGHT as N,PIECE_PAWN as P} from '../quantum-engine/constants';
import {getConcreteMoveChildren} from '../quantum-engine/ai/random';
import {resolveQuantumState} from '../quantum-engine/quantum/candidateSolver';
import {isCheckmate,isPlayerInCheck} from '../quantum-engine/terminal';
import {publishedProblemHistory} from './publishedProblemHistory';

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
export function isQuantumProblem(state:GameState):boolean {
    return state.pieces.some(p=>p.alive&&(p.state&(p.state-1))!==0);
}
function keepsKings(state:GameState,move:Move) {
    return !state.pieces.some(p=>p.alive&&p.state===K&&p.position.row===move.target.row&&p.position.col===move.target.col);
}
function isMateResult(next:GameState) {
    return next.pieces.some(p=>p.alive&&p.owner==='white'&&(p.state&K)!==0)
        &&!isPlayerInCheck('white',next)&&isCheckmate('black',next);
}
/** Validate only the selected piece and reuse its transition for immediate visual feedback.
 * The reward service independently replays exactly this proof before granting any credit. */
export function problemMoveResult(state:GameState,move:Move):GameState|null {
    try {
        if(state.sideToMove!=='white'||state.winner||!keepsKings(state,move))return null;
        const child=getConcreteMoveChildren(state,{allPromotions:true,playable:true,pieceId:move.pieceId,target:move.target})
            .find(({move:m})=>m.target.row===move.target.row&&m.target.col===move.target.col&&m.chosenType===move.chosenType&&m.promotionTarget===move.promotionTarget);
        return child&&isMateResult(child.next)?child.next:null;
    }catch{return null;}
}
export function isProblemMate(state:GameState,move:Move):boolean {
    return problemMoveResult(state,move)!==null;
}
export function mateSolutions(state:GameState):Move[] {
    if(state.sideToMove!=='white'||state.winner)return [];
    return getConcreteMoveChildren(state,{allPromotions:true,playable:true})
        .filter(({move,next})=>keepsKings(state,move)&&isMateResult(next)).map(({move})=>move);
}

/** Reproducible compositions, each independently checked for exactly one mate in one.
 * Persisted position keys exclude all previously published positions. No external puzzle license or API. */
export async function generateWeeklyProblems(now:number,previous:ReadonlySet<string>=new Set()):Promise<WeeklyProblemSet> {
    const period=learningWeek(now,true),random=seededRandom('qg-mixed-v2:'+period.week);
    const problems:WeeklyProblem[]=[];
    const used=new Set([...previous,...publishedProblemHistory]);
    for(let attempt=0;attempt<30000&&problems.length<10;attempt++){
        // Yield between candidates so maintenance does not block reconnects or active matches.
        if(attempt%20===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
        const squares=new Set<number>();
        const square=()=>{let s=random(64);while(squares.has(s))s=random(64);squares.add(s);return s;};
        const king=square();
        // Edge kings offer a useful range of beginner mating patterns.
        if(![0,7].includes(Math.floor(king/8))&&![0,7].includes(king%8))continue;
        const quantum=problems.length>=5;
        const masks=[R|Q,B|Q,R|B,R|N,B|N];
        const pieces=[piece('bk','black',K,king),piece('wk','white',K,square()),
            piece('attack','white',quantum?masks[random(masks.length)]:random(2)?Q:R,square()),
            piece('support','white',quantum?masks[random(masks.length)]:[R,B,N][random(3)],square())];
        if(random(2)){
            const s=square();
            if(Math.floor(s/8)>0&&Math.floor(s/8)<7)pieces.push(piece('blocker','black',P,s));
        }
        const state:GameState={pieces:resolveQuantumState(pieces),sideToMove:'white',ply:0,winner:null,captured:{white:0,black:0},hash:''};
        const key=problemPositionKey(state);
        if(used.has(key)||isPlayerInCheck('black',state)||isPlayerInCheck('white',state))continue;
        const solutions=mateSolutions(state);
        if(solutions.length!==1)continue;
        // Every Q-Gambit problem must actually ask the player to move an unresolved piece.
        const mover=state.pieces.find(p=>p.id===solutions[0].pieceId)!;
        if(quantum&&(mover.state&(mover.state-1))===0)continue;
        used.add(key);problems.push({id:String(problems.length+1),positionKey:key,state});
    }
    if(problems.length!==10)throw new Error('WEEKLY_GENERATION_INCOMPLETE');
    return {...period,problems};
}
