import type { QuantumPiece } from '../types';
import { PIECE_PAWN as P, PIECE_KNIGHT as N, PIECE_BISHOP as B, PIECE_ROOK as R, PIECE_QUEEN as Q, PIECE_KING as K, MAX_PIECES } from '../constants';

export const IDENTITY_TYPES = [P,N,B,R,Q,K] as const;
const LIMITS = [MAX_PIECES.PAWN,MAX_PIECES.KNIGHT,MAX_PIECES.BISHOP,MAX_PIECES.ROOK,MAX_PIECES.QUEEN,MAX_PIECES.KING];
const RADIX = [1,9,27,81,243,486];
const CODES = 972;
export type IdentityProbabilities = readonly number[];

/** Uniform weighting of feasible identity allocations is an evaluation model,
 * NOT a claim about a physical measurement probability. Include captured pieces:
 * their original identities still consume quotas; promotion consumes Pawn. */
export function identityMask(piece:QuantumPiece) { return piece.promoted ? P : piece.state; }
export function feasibleIdentityMarginals(masks:readonly number[]):Map<number,IdentityProbabilities> {
    if (masks.length > 16 || masks.some(mask => !Number.isSafeInteger(mask) || mask <= 0 || mask > 63)) {
        throw new Error('Invalid identity allocation');
    }
    const memo=new Float64Array((masks.length+1)*CODES).fill(-1);
    const canAdd=(code:number,type:number)=>Math.floor(code/RADIX[type])%(LIMITS[type]+1)<LIMITS[type];
    const ways=(index:number,used:number):number=>{
        if (index===masks.length) return 1;
        const key=index*CODES+used;
        if (memo[key]>=0) return memo[key];
        let count=0;
        for(let type=0;type<6;type++) if((masks[index]&IDENTITY_TYPES[type])&&canAdd(used,type)) count+=ways(index+1,used+RADIX[type]);
        memo[key]=count;return count;
    };
    const total=ways(0,0),result=new Map<number,IdentityProbabilities>();
    if (!total) throw new Error('No feasible identity allocation');
    let prefixes=new Map<number,number>([[0,1]]);
    for(let index=0;index<masks.length;index++) {
        const probabilities=Array(6).fill(0) as number[],next=new Map<number,number>();
        for(const [used,count] of prefixes) for(let type=0;type<6;type++) {
            if(!(masks[index]&IDENTITY_TYPES[type])||!canAdd(used,type)) continue;
            const code=used+RADIX[type];
            probabilities[type]+=count*ways(index+1,code)/total;
            next.set(code,(next.get(code)??0)+count);
        }
        // Equal masks are exchangeable under this model, so one table covers
        // all their board locations and survives position-only moves.
        result.set(masks[index],probabilities);prefixes=next;
    }
    return result;
}

export function identityEntropy(probabilities:IdentityProbabilities):number {
    return probabilities.reduce((sum,p)=>sum-(p>0?p*Math.log2(p):0),0);
}
