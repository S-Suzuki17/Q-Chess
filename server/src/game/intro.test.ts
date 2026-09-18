import {describe,it,expect,vi,afterEach} from 'vitest';
import {GameEngine} from './GameEngine';
import {createInitialBoard} from './quantumChess';
import {MatchmakingService} from '../matchmaking/MatchmakingService';
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
describe('authoritative intro deadline',()=>{
 it('scopes idempotency to the verified participant so humans cannot poison CPU action IDs',()=>{
  const engine=new GameEngine('m','cpu','human',createInitialBoard());
  expect(engine.processAction({actionId:'cpu:0',version:0,playerId:'human',action:{type:'MOVE',payload:{pieceId:16,toX:0,toY:5}}}).success).toBe(false);
  const action={actionId:'cpu:0',version:0,playerId:'cpu',action:{type:'MOVE' as const,payload:{pieceId:1,toX:0,toY:2}}};
  expect(engine.processAction(action).success).toBe(true);
  expect(engine.processAction(action).success).toBe(true);
  expect(engine.getPublicState('human').moveCount).toBe(1);
 });
 it('reserves private colors before async lookups and includes both ratings in the very first emission',()=>{
  vi.useFakeTimers();
  const emit=vi.fn();
  const io={emit,to:()=>({emit}),sockets:{sockets:new Map([['sa',{emit}],['sb',{emit}]])}};
  const service=new MatchmakingService(io as never);
  service.registerSocket('a','sa');service.registerSocket('b','sb');
  expect(service.reserveMatch('a','room')?.players.host).toBe('a');
  expect(service.reserveMatch('b','room')?.players.joiner).toBe('b');
  expect(service.reserveMatch('intruder','room')).toBeUndefined();
  service.connectMatch('b','room','Black',undefined,'avatar-frame-15',1,2400);
  expect(emit).not.toHaveBeenCalledWith('sync_state',expect.anything());
  const result=service.connectMatch('a','room','White',undefined,'avatar-frame-01',1,1800);
  expect(result.engine?.getPublicState('a')).toMatchObject({players:{host:'a',joiner:'b'},playerRatings:{host:1800,joiner:2400},introPending:true,clock:{white:600000,black:600000}});
  const first=emit.mock.calls.find(args=>args[0]==='sync_state')?.[1];
  expect(first?.playerRatings).toEqual({host:1800,joiner:2400});
  service.connectMatch('a','room','White',undefined,undefined,1,1000);
  expect(result.engine?.getPublicState('a')).toMatchObject({playerRatings:{host:1800,joiner:2400},playerFrames:{host:'avatar-frame-01',joiner:'avatar-frame-15'}});
 });
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
