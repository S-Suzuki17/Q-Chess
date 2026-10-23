import {describe,it,expect} from 'vitest';
import {tutorialCourse,TUTORIAL_PATH,TUTORIAL_SECTIONS,verifyTutorialSolution,tutorialReferenceMove,attemptTutorialMove} from './tutorialCourse';
import {generateWeeklyProblems,learningWeek,mateSolutions,isProblemMate,isQuantumProblem,problemMoveResult} from '../../server/src/learning/weeklyProblems';
import {getAllConcreteMoves} from '../quantum-engine/ai/random';
import {resolveQuantumState} from '../quantum-engine/quantum/candidateSolver';
import {parseLearningSubmission} from '../../server/src/learning/protocol';
import {learningText} from '../locales/learningText';
import {weeklyProblemText} from '../locales/weeklyProblemText';
import {LANGUAGES} from '../locales/dict';

describe('learning course and weekly composition',()=>{
 it('separates ordinary chess from quantum rules without losing stable lesson identities',()=>{
  expect(new Set(TUTORIAL_PATH).size).toBe(tutorialCourse.length);
  expect(TUTORIAL_SECTIONS[0].indices).toHaveLength(16);
  for(const index of TUTORIAL_SECTIONS[0].indices){
   const lesson=tutorialCourse[index];
   expect(lesson.create().pieces.every(p=>(p.state&(p.state-1))===0),lesson.id).toBe(true);
  }
 });
 it.each(tutorialCourse)('server replays the complete $id proof and rejects missing or forged moves',lesson=>{
  let state=lesson.create();
  const moves=lesson.tasks.map(task=>{const move=tutorialReferenceMove(state,task);state=attemptTutorialMove(state,task,move).state;return move;});
  expect(verifyTutorialSolution(lesson.id,moves)).toBe(true);
  expect(verifyTutorialSolution(lesson.id,moves.slice(1))).toBe(false);
  expect(verifyTutorialSolution(lesson.id,[...moves,moves[0]])).toBe(false);
  expect(parseLearningSubmission({kind:'tutorial',lessonId:lesson.id,moves})).not.toBeNull();
  expect(parseLearningSubmission({kind:'tutorial',lessonId:lesson.id,moves,amount:999})).toBeNull();
 });
 it('uses the Tuesday maintenance boundary independently of the browser clock',()=>{
  expect(learningWeek(Date.parse('2026-10-20T04:59:59Z')).week).toBe('2026-10-13');
  expect(learningWeek(Date.parse('2026-10-20T05:00:00Z')).week).toBe('2026-10-20');
  expect(learningWeek(Date.parse('2026-10-20T01:59:59Z'),true).week).toBe('2026-10-13');
  expect(learningWeek(Date.parse('2026-10-20T02:00:00Z'),true).opensAt).toBe('2026-10-20T05:00:00.000Z');
  for(const week of ['2026-10-19','2026-02-31','2026-99-99']){
   expect(parseLearningSubmission({kind:'weekly',week,problemId:1,moves:[tutorialReferenceMove(tutorialCourse[0].create(),tutorialCourse[0].tasks[0])]})).toBeNull();
  }
 });
 it('publishes ten distinct verified mates and excludes all previous positions the next week',async()=>{
  const first=await generateWeeklyProblems(Date.parse('2026-10-20T02:00:00Z'));
  const keys=new Set(first.problems.map(p=>p.positionKey));
  expect(keys.size).toBe(10);
  expect(first.problems.map(p=>isQuantumProblem(p.state))).toEqual([false,false,false,false,false,true,true,true,true,true]);
  for(const problem of first.problems){
   expect(resolveQuantumState(problem.state.pieces)).toEqual(problem.state.pieces);
   const moves=mateSolutions(problem.state);expect(moves).toHaveLength(1);
   expect(isProblemMate(problem.state,moves[0])).toBe(true);
   expect(isProblemMate(problem.state,{...moves[0],pieceId:'forged'})).toBe(false);
   expect(problemMoveResult(problem.state,moves[0])).not.toBeNull();
   if(isQuantumProblem(problem.state)){
    const mover=problem.state.pieces.find(p=>p.id===moves[0].pieceId)!;
    expect(mover.state&(mover.state-1)).not.toBe(0);
    // A browser cannot silently discard otherwise valid candidates to manufacture mate.
    const mask=moves[0].chosenType!;
    if((mask&(mask-1))!==0)
     expect(isProblemMate(problem.state,{...moves[0],chosenType:mask&-mask})).toBe(false);
   }
  }
  const repeat=await generateWeeklyProblems(Date.parse('2026-10-20T02:00:00Z'));
  expect(repeat).toEqual(first);
  const second=await generateWeeklyProblems(Date.parse('2026-10-27T02:00:00Z'),keys);
  expect(second.problems).toHaveLength(10);
  expect(second.problems.every(p=>!keys.has(p.positionKey))).toBe(true);
 },60000);
 it.each(tutorialCourse)('selected-piece generation preserves the legal moves of $id, including special moves',lesson=>{
  const state=lesson.create(),all=getAllConcreteMoves(state,{allPromotions:true,playable:true});
  for(const piece of state.pieces){
   const selected=getAllConcreteMoves(state,{allPromotions:true,playable:true,pieceId:piece.id});
   expect(selected).toEqual(all.filter(move=>move.pieceId===piece.id));
   for(const move of selected)
    expect(getAllConcreteMoves(state,{allPromotions:true,playable:true,pieceId:piece.id,target:move.target}))
     .toEqual(selected.filter(m=>m.target.row===move.target.row&&m.target.col===move.target.col));
  }
 });
 it.each(LANGUAGES)('has complete localized learning controls in $code',({code})=>{
  for(const text of Object.values(learningText(code)))expect(typeof text==='string'&&text.trim().length>0).toBe(true);
  for(const text of Object.values(weeklyProblemText(code)))expect(typeof text==='string'&&text.trim().length>0).toBe(true);
 });
});
