import {describe,it,expect,vi,afterEach} from 'vitest';
import {GameEngine} from './GameEngine';
import {createInitialBoard} from './quantumChess';
afterEach(()=>vi.useRealTimers());
describe('authoritative intro deadline',()=>{
 it('holds both clocks until both intros finish; duplicate acknowledgements cannot reset a game',()=>{
  vi.useFakeTimers();vi.setSystemTime(100000);
  const engine=new GameEngine('m','h','j',createInitialBoard(),10,undefined,4000,true);
  vi.setSystemTime(110000);
  expect(engine.checkTimeout()).toBe(false);
  expect(engine.getPublicState('h')).toMatchObject({introPending:true,clock:{white:10000,black:10000}});
  expect(engine.acknowledgeIntro('spectator')).toBe(false);
  expect(engine.acknowledgeIntro('h')).toBe(false);
  expect(engine.acknowledgeIntro('j')).toBe(true);
  expect(engine.getPublicState('h')).toMatchObject({introPending:false,startsAt:110250});
  vi.setSystemTime(111000);expect(engine.acknowledgeIntro('h')).toBe(false);
  expect(engine.getPublicState('h').clock!.white).toBe(9250);
 });
 it('rejects moves during intro, preserves time and exposes a fresh clock snapshot',()=>{
  vi.useFakeTimers();vi.setSystemTime(100000);
  const engine=new GameEngine('m','host','joiner',createInitialBoard(),10,undefined,4000);
  const pieceId=engine.getPublicState('host').board[8]!;
  const action={actionId:'move-1',version:0,playerId:'host',action:{type:'MOVE' as const,payload:{pieceId,toX:0,toY:2}}};
  expect(engine.processAction(action).success).toBe(false);
  expect(engine.getPublicState('host')).toMatchObject({startsAt:104000,serverNow:100000,clock:{white:10000}});
  vi.setSystemTime(103999);expect(engine.checkTimeout()).toBe(false);
  expect(engine.getPublicState('host').clock!.white).toBe(10000);
  vi.setSystemTime(105500);expect(engine.getPublicState('host').clock!.white).toBe(8500);
  expect(engine.processAction(action).success).toBe(true);
  expect(engine.getPublicState('host')).toMatchObject({moveCount:1,turn:1,clock:{black:10000}});
 });
 it('only accepts known frames and HTTPS avatar URLs',()=>{
  const engine=new GameEngine('m','h','j',createInitialBoard());
  engine.setPlayerAppearance('host','javascript:alert(1)','avatar-frame-99');
  expect(engine.getPublicState('h').playerFrames).toBeUndefined();
  engine.setPlayerAppearance('host','https://example.com/avatar.png','avatar-frame-15');
  expect(engine.getPublicState('h')).toMatchObject({playerFrames:{host:'avatar-frame-15'},playerAvatars:{host:'https://example.com/avatar.png'}});
 });
});
