import { describe, expect, it } from 'vitest';
import { matchTimeControl, privateRoomConnection, privateRoomReady } from './privateRoom';
describe('private room client protocol',()=>{
    it('sends the creator selection once and never recreates on restored or acknowledged connections',()=>{
        expect(privateRoomConnection('create','10s',false)).toEqual({intent:'create',timeControl:10});
        expect(privateRoomConnection('create','3m',false)).toEqual({intent:'create',timeControl:180});
        expect(privateRoomConnection('join','10m',false)).toEqual({intent:'join'});
        for(const intent of ['create','join','reconnect',undefined] as const)expect(privateRoomConnection(intent,'10m',true)).toEqual({intent:'reconnect'});
        expect(privateRoomConnection(undefined,'10m',false)).toEqual({intent:'reconnect'});
    });
    it('uses only a matching authoritative room acknowledgement and supported clock values',()=>{
        expect(privateRoomReady({matchId:'ROOM01',timeControl:180},'ROOM01')).toEqual({matchId:'ROOM01',timeControl:180});
        expect(privateRoomReady({matchId:'OLD01',timeControl:180},'ROOM01')).toBeNull();
        expect(privateRoomReady({matchId:'ROOM01',timeControl:999},'ROOM01')).toBeNull();
        expect(matchTimeControl(30000,'10m')).toBe('10s');expect(matchTimeControl(10000,'10m')).toBe('10s');expect(matchTimeControl(180000,'10m')).toBe('3m');
        expect(matchTimeControl(600000,'10s')).toBe('10m');expect(matchTimeControl('10000','3m')).toBe('3m');
    });
});
