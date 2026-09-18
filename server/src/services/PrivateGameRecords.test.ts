import { describe, expect, it } from 'vitest';
import { parseLocalGameRecord, MAX_LOCAL_MOVES } from './PrivateGameRecords';

export const sampleMove = () => ({ turn: 1, player: 'white', tokenId: 'token_17', from: [6, 0], to: [4, 0], possibleTypes: ['Pawn'], replayVersion: 2, changes: [[17,32,32,1,0]], extra: { precise: 'preserved' } });
export const sampleRecord = () => ({ id: '9e477b83-4213-4d82-b9dc-f7dcae5a028b', white_id: 'Alice', black_id: 'ai', white_player: 'spoof', black_player: 'spoof', winner: 'white_wins', mode: 'cpu', cpu_level: 3, time_control: '3m', moves: [sampleMove()], total_moves: 1 });

describe('private local record boundary', () => {
    it('binds both colors to the authenticated owner and preserves precise replay / additional move metadata', () => {
        const record = sampleRecord();
        expect(parseLocalGameRecord(record,'Alice')).toMatchObject({ mode: 'cpu', white_player:'', black_player:'', moves: record.moves });
        expect(parseLocalGameRecord({...record,white_id:'ai',black_id:'Alice'},'Alice')?.black_id).toBe('Alice');
    });
    it('rejects missing identity, impersonation, self-play, and server-owned online results', () => {
        for (const changes of [{white_id:'Bob'},{black_id:'Bob'},{black_id:'Alice'},{white_id:undefined},{mode:'ranked'},{mode:'random'},{mode:'private'},{mode:'ranked_cpu'}]) {
            expect(parseLocalGameRecord({...sampleRecord(),...changes},'Alice')).toBeNull();
        }
        expect(parseLocalGameRecord({...sampleRecord(),white_id:'GUEST-Alice'},'GUEST-Alice')).toBeNull();
    });
    it('requires stable UUID, completed result, valid time control and count', () => {
        for (const changes of [{id:'raw-id'},{winner:null},{winner:'playing'},{time_control:'infinite'},{cpu_level:0},{cpu_level:101},{total_moves:2}]) {
            expect(parseLocalGameRecord({...sampleRecord(),...changes},'Alice')).toBeNull();
        }
        expect(parseLocalGameRecord({...sampleRecord(),moves:[],total_moves:0,winner:'draw'},'Alice')).not.toBeNull();
    });
    it('rejects invalid base moves and malformed exact-replay deltas', () => {
        for (const changes of [{turn:2},{player:'black'},{tokenId:'other'},{from:[9,0]},{possibleTypes:[]},{possibleTypes:['Pawn','Pawn']},{promotedTo:'King'},{changes:[[33,2,3,1,0]]},{changes:[[17,64,3,1,0]]},{changes:[[17,2,64,1,0]]},{changes:[[17,2,3,2,0]]},{changes:[[17,2,3,1,1]]},{changes:[[17,2,3,1,0],[17,3,3,1,0]]},{replayVersion:3},{changes:undefined}]) {
            expect(parseLocalGameRecord({...sampleRecord(),moves:[{...sampleMove(),...changes}]},'Alice')).toBeNull();
        }
    });
    it('retains promotion/capture metadata including zero candidate masks for captured pieces', () => {
        const move = {...sampleMove(),capturedTokenId:'token_1',promotedTo:'Queen',changes:[[17,0,2,1,2],[1,-1,0,1,0]]};
        expect(parseLocalGameRecord({...sampleRecord(),moves:[move]},'Alice')?.moves).toEqual([move]);
    });
    it('accepts modern local IDs and captured IDs without rewriting them', () => {
        const first={...sampleMove(),tokenId:'w_17',capturedTokenId:'b_9',changes:[[17,32,32,1,0],[9,-1,0,0,0]]};
        const second={...sampleMove(),turn:2,player:'black',tokenId:'b_1',capturedTokenId:'w_32',changes:[[1,8,4,1,0],[32,-1,0,0,0]]};
        expect(parseLocalGameRecord({...sampleRecord(),moves:[first,second],total_moves:2},'Alice')?.moves).toEqual([first,second]);
        for(const tokenId of ['w_1','w_16','w_33','b_0','b_17','b_32','token_0','token_33']) {
            expect(parseLocalGameRecord({...sampleRecord(),moves:[{...sampleMove(),tokenId}]},'Alice')).toBeNull();
        }
    });
    it('accepts private self-history for either color and never attaches another identity', () => {
        const value={...sampleRecord(),mode:'private',black_id:null,cpu_level:null};
        expect(parseLocalGameRecord(value,'Alice')).toMatchObject({mode:'private',white_id:'Alice',black_id:null,cpu_level:null});
        expect(parseLocalGameRecord({...value,white_id:null,black_id:'Alice',cpu_level:undefined},'Alice')).toMatchObject({mode:'private',white_id:null,black_id:'Alice',cpu_level:null});
        for(const changes of [{black_id:'Bob'},{black_id:'ai'},{black_id:'Alice'},{black_id:undefined},{white_id:'Bob'},{cpu_level:1}]) {
            expect(parseLocalGameRecord({...value,...changes},'Alice')).toBeNull();
        }
    });
    it('bounds count, UTF-8 bytes and nesting', () => {
        const moves = Array.from({length:MAX_LOCAL_MOVES},(_,i)=>({...sampleMove(),turn:i+1,player:i%2?'black':'white'}));
        expect(parseLocalGameRecord({...sampleRecord(),moves,total_moves:moves.length},'Alice')).not.toBeNull();
        expect(parseLocalGameRecord({...sampleRecord(),moves:[...moves,sampleMove()],total_moves:moves.length+1},'Alice')).toBeNull();
        expect(parseLocalGameRecord({...sampleRecord(),moves:[{...sampleMove(),extra:'あ'.repeat(750_000)}]},'Alice')).toBeNull();
        let deep:unknown = 1; for(let i=0;i<25;i++)deep={deep};
        expect(parseLocalGameRecord({...sampleRecord(),moves:[{...sampleMove(),extra:deep}]},'Alice')).toBeNull();
    });
});
