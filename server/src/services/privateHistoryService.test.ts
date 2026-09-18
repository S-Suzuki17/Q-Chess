import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { SupabaseService } from './SupabaseService';
import { parseLocalGameRecord } from './PrivateGameRecords';

afterEach(()=>vi.restoreAllMocks());
const sample=()=>parseLocalGameRecord({id:'9e477b83-4213-4d82-b9dc-f7dcae5a028b',white_id:'Alice',black_id:'ai',mode:'cpu',cpu_level:1,time_control:'10m',winner:'draw',moves:[],total_moves:0},'Alice')!;
describe('private history service wrappers',()=>{
    it('uses only service RPCs with identity and capped count, retaining replay metadata',async()=>{
        const rows=[{id:'mine',white_id:'Alice',moves:[{replayVersion:2,changes:[]}],replay_expired:false},{id:'other',white_id:'Bob'}];
        const rpc=vi.fn(()=>({abortSignal:vi.fn().mockResolvedValue({data:rows,error:null})}));
        const service=new SupabaseService({rpc} as unknown as SupabaseClient);
        expect(await service.getPrivateGameRecords('Alice',50)).toEqual([rows[0]]);
        expect(rpc).toHaveBeenCalledExactlyOnceWith('get_private_game_records',{p_user_id:'Alice',p_limit:10});
    });
    it('fails closed when history RPC fails and only returns validated lifetime statistics',async()=>{
        let response:unknown={error:{message:'forbidden'},data:null};
        const rpc=vi.fn(()=>({abortSignal:vi.fn().mockImplementation(async()=>response)}));
        const service=new SupabaseService({rpc} as unknown as SupabaseClient);
        await expect(service.getPrivateGameRecords('Alice')).rejects.toThrow('Private history unavailable');
        await expect(service.getPrivateGameStats('Alice')).rejects.toThrow('Private statistics unavailable');
        const stats={totalGames:100,wins:50,losses:40,draws:10,whiteGames:60,whiteWins:30,blackGames:40,blackWins:20};
        response={data:{...stats,unneeded:'secret'},error:null};
        expect(await service.getPrivateGameStats('Alice')).toEqual(stats);
        expect(rpc).toHaveBeenLastCalledWith('get_private_game_stats',{p_user_id:'Alice'});
    });
    it('namespaces and deduplicates local IDs, binds stored names to profile and never updates ratings',async()=>{
        const writes:unknown[]=[];
        const chain={select:vi.fn(),eq:vi.fn(),abortSignal:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:{name:'Real Alice'},error:null})};
        chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);chain.abortSignal.mockReturnValue(chain);
        const upsert=vi.fn((record,options)=>{writes.push(record);return {abortSignal:vi.fn().mockResolvedValue({error:null})};});
        const from=vi.fn(table=>table==='profiles'?chain:{upsert});
        const service=new SupabaseService({from} as unknown as SupabaseClient);
        const first=await service.saveLocalGameRecord('Alice',sample());
        const second=await service.saveLocalGameRecord('Alice',sample());
        expect(first).toBe(second);expect(first).not.toBe(sample().id);
        expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({id:first,white_id:'Alice',black_id:'ai',white_player:'Real Alice',black_player:'CPU',mode:'cpu'}),{onConflict:'id',ignoreDuplicates:true});
        const other={...sample(),white_id:'Bob'};
        const third=await service.saveLocalGameRecord('Bob',other);expect(third).not.toBe(first);
        expect(from.mock.calls.map(call=>call[0])).toEqual(['profiles','game_records','profiles','game_records','profiles','game_records']);
        const ownPrivate={...sample(),mode:'private' as const,black_id:null,cpu_level:null};
        const privateId=await service.saveLocalGameRecord('Alice',ownPrivate);
        expect(privateId).not.toBe(first);
        expect(await service.saveLocalGameRecord('Alice',ownPrivate)).toBe(privateId);
        expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({id:privateId,white_id:'Alice',black_id:null,white_player:'Real Alice',black_player:'Opponent',mode:'private',cpu_level:null}),{onConflict:'id',ignoreDuplicates:true});
        await expect(service.saveLocalGameRecord('Mallory',sample())).rejects.toThrow('Invalid local record');
    });
    it('rejects unavailable profiles / failed inserts, without reporting false save success',async()=>{
        const chain={select:vi.fn(),eq:vi.fn(),abortSignal:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};
        chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);chain.abortSignal.mockReturnValue(chain);
        const upsert=vi.fn(()=>({abortSignal:vi.fn().mockResolvedValue({error:{message:'fail'}})}));
        const service=new SupabaseService({from:vi.fn(table=>table==='profiles'?chain:{upsert})} as unknown as SupabaseClient);
        await expect(service.saveLocalGameRecord('Alice',sample())).rejects.toThrow('Profile unavailable');expect(upsert).not.toHaveBeenCalled();
        chain.maybeSingle.mockResolvedValue({data:{name:'Alice'},error:null});
        await expect(service.saveLocalGameRecord('Alice',sample())).rejects.toThrow('Local history save unavailable');
    });
    it('removes both startup/daily row deletion and the destructive cleanup method',()=>{
        const index=readFileSync(new URL('../index.ts',import.meta.url),'utf8');
        const service=readFileSync(new URL('./SupabaseService.ts',import.meta.url),'utf8');
        expect(index).not.toContain('cleanupOldRecords');expect(service).not.toContain('cleanupOldRecords');
        expect(index.indexOf('app.use(createPrivateGameRecordRouter')).toBeLessThan(index.indexOf("app.use(express.json({limit:'4kb'}))"));
    });
});
