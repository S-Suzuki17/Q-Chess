import { expect, it } from 'vitest';
import { isCheckmateFinish } from './checkmatePresentation';
import { PIECE_KING, PIECE_QUEEN } from '../quantum-engine/constants';
import type { GameState, QuantumPiece } from '../quantum-engine/types';
const piece=(id:string,owner:'white'|'black',row:number,col:number,state:number):QuantumPiece=>({id,owner,position:{row,col},origin:{row,col},state,alive:true,promoted:false,hasMoved:true});
const mate:GameState={pieces:[piece('bk','black',0,0,PIECE_KING),piece('wk','white',2,2,PIECE_KING),piece('wq','white',1,1,PIECE_QUEEN)],sideToMove:'black',ply:10,captured:{white:0,black:0},hash:'fixture',winner:null};
it('triggers only for a confirmed winning checkmate',()=>{
    expect(isCheckmateFinish('white_wins',mate)).toBe(true);
    expect(isCheckmateFinish(null,mate)).toBe(false);
    expect(isCheckmateFinish('draw',mate)).toBe(false);
    expect(isCheckmateFinish('black_wins',mate)).toBe(false);
});
it('does not turn a win by resignation or timeout in a non-mated position into a mate',()=>{
    const state={...mate,pieces:[mate.pieces[0],mate.pieces[1],piece('wq','white',3,3,PIECE_QUEEN)]};
    expect(isCheckmateFinish('white_wins',state)).toBe(false);
});
