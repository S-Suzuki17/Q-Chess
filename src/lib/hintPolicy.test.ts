import { describe, expect, it } from 'vitest';
import { canRequestHint, hintAccess, type HintMode } from './hintPolicy';
describe('hint availability follows the requested game mode',()=>{
    it.each(['practice','tutorial'] as HintMode[])('keeps %s free including guests, regardless of ticket release readiness',mode=>expect(hintAccess(mode)).toBe('free'));
    it.each(['ranked','random','private','crown'] as HintMode[])('uses tickets in %s even when the opponent is a CPU',mode=>expect(hintAccess(mode)).toBe('ticket'));
    it.each([
        {ready:false,finished:false,spectator:false,playerSide:'white',currentTurn:'white'},
        {ready:true,finished:true,spectator:false,playerSide:'white',currentTurn:'white'},
        {ready:true,finished:false,spectator:true,playerSide:'white',currentTurn:'white'},
        {ready:true,finished:false,spectator:false,playerSide:'white',currentTurn:'black'},
    ] as const)('blocks unavailable state %j',state=>expect(canRequestHint(state)).toBe(false));
    it.each(['white','black'] as const)('allows only the active participant on their %s turn',side=>expect(canRequestHint({ready:true,finished:false,spectator:false,playerSide:side,currentTurn:side})).toBe(true));
});
