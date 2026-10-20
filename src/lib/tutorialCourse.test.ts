import {describe,expect,it} from 'vitest';
import {tutorialCourse,tutorialReferenceMove,attemptTutorialMove,tutorialPosition,unresolvedAttackers,tutorialMoves} from './tutorialCourse';
import {isCheckmate,isPlayerInCheck,getWinner} from '../quantum-engine/terminal';
import {applyPracticeMove} from '../quantum-engine/practice';
import {PIECE_PAWN as P,PIECE_KNIGHT as N,PIECE_KING as K,PIECE_QUEEN as Q,PIECE_ROOK as R,PIECE_BISHOP as B} from '../quantum-engine/constants';
import {positionForDisplay,applyLocalMove} from './localGame';
import {quantumToLegacyMove} from '../quantum-engine/adapter';

describe('progressive tutorial through the playable Q-Gambit engine',()=>{
 it.each(tutorialCourse.map(lesson=>[lesson.id,lesson] as const))('%s replays every exercise through real rules',(id,lesson)=>{
  let state=lesson.create();
  expect(getWinner(state)).toBeNull();
  for(const task of lesson.tasks){
   const original=JSON.stringify(state),move=tutorialReferenceMove(state,task),result=attemptTutorialMove(state,task,move);
   expect(result.accepted,`${id}: ${task.from}→${task.to}`).toBe(true);
   expect(JSON.stringify(state)).toBe(original);
   if(task.kind==='reject'){expect(result.state).toBe(state);expect(()=>applyPracticeMove(state,move)).toThrow();}
   else {
    // The renderer/local board sees exactly the same candidates and special-move side effects.
    const view=positionForDisplay(state),legacy=quantumToLegacyMove(move,state),last=state.lastMove;
    const history=last?.from?[{turn:state.ply,player:state.pieces.find(p=>p.id===last.pieceId)!.owner,tokenId:last.pieceId,
     from:[last.from.row,last.from.col] as [number,number],to:[last.target.row,last.target.col] as [number,number],
     possibleTypes:quantumToLegacyMove(last,state).possibleTypes}]:[];
    expect(applyLocalMove(view.tokens,view.pool,legacy,state.sideToMove,history).state.pieces).toEqual(result.state.pieces);
   }
   state=result.state;
  }
  const at=(pieceId:string)=>state.pieces.find(piece=>piece.id===pieceId)!;
  if(id==='candidates')expect(at('mystery').state).toBe(B|Q);
  if(id==='deduction-chain'){expect(at('mystery').state).toBe(Q);expect(at('other').state).toBe(R);}
  if(id==='captured-slots'){expect(at('queen').alive).toBe(false);expect(at('queen').state).toBe(Q);expect(at('other').state).toBe(R);}
  if(id==='castle'){expect(at('castle').state).toBe(K);expect(at('rook').position).toEqual(tutorialPosition('f1'));expect(at('other').state).toBe(R);}
  if(id==='promotion'){expect(at('pawn').promotedType).toBe(N);expect(at('pawn').state).toBe(P);}
  if(id==='decline-promotion'){expect(at('mystery').state).toBe(R);expect(at('mystery').promoted).toBe(false);}
  if(id==='en-passant'){expect(at('reply').alive).toBe(false);expect(state.captured.white).toBe(1);}
  if(['check-block','self-check','king-escape'].includes(id))expect(isPlayerInCheck('white',state)).toBe(false);
  if(id==='king-candidates'){expect(state.winner).toBeNull();expect(at('other').state&K).toBe(K);}
  if(id==='last-king'){expect(state.winner).toBe('white');expect(isCheckmate('black',state)).toBe(false);}
  if(id==='stalemate'){expect(state.winner).toBe('draw');expect(isPlayerInCheck('black',state)).toBe(false);}
  if(id==='checkmate'||id==='quantum-mate'){expect(state.winner).toBe('white');expect(isCheckmate('black',state)).toBe(true);expect(at('bk').alive).toBe(true);}
  if(id==='quantum-mate')expect(unresolvedAttackers(state)).toHaveLength(2);
 });
 it('does not advance for a different legal move or illegal opponent control',()=>{
  const lesson=tutorialCourse[0],state=lesson.create(),task=lesson.tasks[0];
  const wrong=attemptTutorialMove(state,task,{pieceId:'pawn',target:tutorialPosition('e4'),chosenType:P});
  expect(wrong).toMatchObject({state,accepted:false,feedback:'different'});
  expect(attemptTutorialMove(state,task,{pieceId:'bk',target:tutorialPosition('g8'),chosenType:K})).toMatchObject({state,accepted:false,feedback:'illegal'});
 });
 it('requires both genuine checkmate and unresolved attacking pieces in the final challenge',()=>{
  const lesson=tutorialCourse.find(item=>item.id==='quantum-mate')!;let state=lesson.create();
  for(const task of lesson.tasks.slice(0,-1))state=attemptTutorialMove(state,task,tutorialReferenceMove(state,task)).state;
  const task=lesson.tasks.at(-1)!,wrong=tutorialMoves(state,'attacker').find(move=>move.target.row===2&&move.target.col===4)!;
  expect(attemptTutorialMove(state,task,wrong)).toMatchObject({state,accepted:false,feedback:'tryMate'});
  const resolved={...state,pieces:state.pieces.map(piece=>piece.id==='attacker'?{...piece,state:R}:piece)};
  expect(attemptTutorialMove(resolved,task,tutorialReferenceMove(resolved,task)).accepted).toBe(false);
 });
 it('offers actual castling/normal and all four promotion choices without auto-selecting',()=>{
  const castle=tutorialCourse.find(lesson=>lesson.id==='castle')!.create();
  expect(tutorialMoves(castle,'castle').filter(move=>move.target.col===6&&move.target.row===7).map(move=>move.chosenType)).toEqual([K,R]);
  const promotion=tutorialCourse.find(lesson=>lesson.id==='promotion')!.create();
  expect(tutorialMoves(promotion,'pawn').map(move=>move.promotionTarget)).toEqual([Q,R,B,N]);
 });
 it('removes en passant after the immediate reply window',()=>{
  const lesson=tutorialCourse.find(lesson=>lesson.id==='en-passant')!,initial=lesson.create();
  const after=applyPracticeMove(initial,tutorialReferenceMove(initial,lesson.tasks[0]));
  expect(tutorialMoves(after,'pawn').some(move=>move.target.col===5&&move.target.row===2)).toBe(true);
  expect(tutorialMoves({...after,lastMove:undefined},'pawn').some(move=>move.target.col===5&&move.target.row===2)).toBe(false);
 });
});
