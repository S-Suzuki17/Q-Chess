import {describe,expect,it,vi} from 'vitest';
import {gameOverDialogDelay,hasVictoryPresentation,showPlayerVictory} from './checkmatePresentation';

describe('result timing after victory presentation',()=>{
 it('mounts a normal player win but keeps spectator, Campaign and non-winning paths separate',()=>{
  expect(showPlayerVictory(true,false,false)).toBe(true);
  expect(showPlayerVictory(true,false,true)).toBe(false);
  expect(showPlayerVictory(true,true,false)).toBe(false);
  expect(showPlayerVictory(false,false,false)).toBe(false);
 });
 it.each([
  ['standard',true,true,3200],['standard',false,true,1500],
  ['standard',true,false,1500],['champion-effect-1',true,true,3200],
  ['champion-effect-1',true,false,3200],['champion-effect-1',false,true,1500],
  ['unknown',true,true,1500],
 ] as const)('%s own-win=%s standard=%s keeps the expected transition', (effect,won,includeStandard,delay)=>{
  expect(gameOverDialogDelay(effect,won,includeStandard)).toBe(delay);
 });
 it('keeps the standard winner result closed until 3200ms',()=>{
  vi.useFakeTimers();
  try{
   const open=vi.fn();setTimeout(open,gameOverDialogDelay('standard',true));
   vi.advanceTimersByTime(1500);expect(open).not.toHaveBeenCalled();
   vi.advanceTimersByTime(1699);expect(open).not.toHaveBeenCalled();
   vi.advanceTimersByTime(1);expect(open).toHaveBeenCalledTimes(1);
  }finally{vi.useRealTimers();}
 });
 it('suppresses the old mate mark for standard and reward wins only',()=>{
  expect(hasVictoryPresentation('standard')).toBe(true);
  expect(hasVictoryPresentation('champion-effect-1')).toBe(true);
  expect(hasVictoryPresentation(undefined)).toBe(false);
  expect(hasVictoryPresentation('unknown')).toBe(false);
 });
});
