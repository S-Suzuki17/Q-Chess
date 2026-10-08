import { afterEach,describe,it,expect,vi } from 'vitest';
import { CPU_HINT_TICKETS_ENABLED,CpuPracticeClient,displayCpuPractice,officialCpuPractice } from './cpuPractice';
import { createInitialState } from '../quantum-engine/initialState';
import { applyPracticeMove,CPU_PRACTICE_RULES_VERSION,type CpuPracticeSnapshot } from '../quantum-engine/practice';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';
import { applyLocalMove,positionForDisplay } from './localGame';
import { legacyToQuantumState,quantumToLegacyMove } from '../quantum-engine/adapter';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT } from './dailyLoginRewards';

afterEach(() => vi.unstubAllGlobals());

const storage=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};};
const settings={playerSide:'white' as const,level:1 as const,seconds:600 as const};
const observeBalanceChanges = () => {
    const target = new EventTarget(), changes: unknown[] = [];
    target.addEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT, event => changes.push((event as CustomEvent).detail));
    vi.stubGlobal('window', target);
    return changes;
};
const paidReceipt = (client: CpuPracticeClient) => ({ sessionId: client.sessionId, revision: 2,
    rulesVersion: CPU_PRACTICE_RULES_VERSION, deliveryState: 'paid_retrievable',
    hint: { fromRow: 6, fromCol: 0, toRow: 5, toCol: 0 } });
describe('durable CPU practice transport and engine display',()=>{
    it('retains special choices when a paid hint is recovered, including earlier receipts with only move metadata', async () => {
        const send = vi.fn(), client = new CpuPracticeClient('Alice', settings, send, storage());
        const receipt = { ...paidReceipt(client), move: { pieceId: 'w_1', target: { row: 0, col: 0 }, promotionTarget: 2 } };
        send.mockResolvedValue(receipt);
        expect((await client.recover(2))?.promotionTarget).toBe(2);
        send.mockResolvedValue({ ...receipt, hint: { ...receipt.hint, intention: 'normal', declinePromotion: true }, move: undefined });
        expect(await client.recover(2)).toMatchObject({ intention: 'normal', declinePromotion: true });
        expect(send.mock.calls.every(call => call[2] === undefined)).toBe(true);
    });
    it('reuses request/session IDs after lost response and component reconstruction',async()=>{
        const saved=storage();const seen:unknown[]=[];
        const send=vi.fn(async (_user:string,_path:string,body:unknown)=>{seen.push(body);throw new Error('response lost');});
        const first=new CpuPracticeClient('Alice',settings,send,saved);
        await expect(first.hint(2)).rejects.toThrow('response lost');
        const reopened=new CpuPracticeClient('Alice',settings,send,saved);
        await expect(reopened.hint(2)).rejects.toThrow('response lost');
        expect(reopened.sessionId).toBe(first.sessionId);expect(seen[1]).toEqual(seen[0]);
        expect(Object.keys(seen[0] as object).sort()).toEqual(['requestId','revision']);
        await expect(reopened.hint(3)).rejects.toThrow();expect(seen[2]).not.toEqual(seen[0]);
        const other=new CpuPracticeClient('Bob',settings,send,saved);expect(other.sessionId).not.toBe(first.sessionId);
    });
    it('uses a read-only receipt endpoint for recovery without a debit payload',async()=>{
        const saved=storage();
        const move={fromRow:6,fromCol:0,toRow:5,toCol:0};
        const send=vi.fn(async (_user:string,path:string,body:unknown)=>path.endsWith('/hints')?
            Promise.reject(new Error('lost')):{sessionId:client.sessionId,revision:0,rulesVersion:CPU_PRACTICE_RULES_VERSION,
                deliveryState:'paid_retrievable',hint:move});
        const client:CpuPracticeClient=new CpuPracticeClient('Alice',settings,send,saved);
        await expect(client.hint(0)).rejects.toThrow();expect(await client.recover(0)).toEqual(move);
        expect(send.mock.calls[1][1]).toContain('/hints/0/');expect(send.mock.calls[1][2]).toBeUndefined();
    });
    it.each(['hint', 'recover'] as const)('refreshes only the receipt owner after a validated %s delivery', async method => {
        const changes = observeBalanceChanges(), send = vi.fn();
        const client = new CpuPracticeClient('Alice', settings, send, storage());
        const receipt = paidReceipt(client); send.mockResolvedValue(receipt);
        expect(await client[method](2)).toEqual(receipt.hint);
        expect(changes).toEqual([{ userId: 'Alice' }]);
        expect(send).toHaveBeenCalledTimes(1);
        if (method === 'recover') expect(send.mock.calls[0][2]).toBeUndefined();
    });
    it('does not refresh balances for a missing hint or recovery receipt', async () => {
        const changes = observeBalanceChanges(), send = vi.fn().mockResolvedValue(null);
        const client = new CpuPracticeClient('Alice', settings, send, storage());
        await expect(client.hint(2)).rejects.toThrow('CPU_PRACTICE_UNAVAILABLE');
        expect(await client.recover(2)).toBeNull();
        expect(changes).toEqual([]);
    });
    it.each(['hint', 'recover'] as const)('does not refresh balances for malformed or rejected %s receipts', async method => {
        const changes = observeBalanceChanges(), send = vi.fn();
        const client = new CpuPracticeClient('Alice', settings, send, storage());
        const receipt = paidReceipt(client);
        for (const invalid of [
            {}, { ...receipt, sessionId: crypto.randomUUID() }, { ...receipt, revision: 3 },
            { ...receipt, rulesVersion: 'old' }, { ...receipt, deliveryState: 'pending' },
            ...[undefined, null, {}, { fromRow: 8, fromCol: 0, toRow: 5, toCol: 0 },
                { fromRow: 6, fromCol: 0, toRow: 6, toCol: 0 }].map(hint => ({ ...receipt, hint })),
        ]) {
            send.mockResolvedValueOnce(invalid);
            await expect(client[method](2)).rejects.toThrow('CPU_PRACTICE_UNAVAILABLE');
            expect(changes).toEqual([]);
        }
        send.mockRejectedValueOnce(new Error('RECEIPT_UNAVAILABLE'));
        await expect(client[method](2)).rejects.toThrow('RECEIPT_UNAVAILABLE');
        expect(changes).toEqual([]);
    });
    it.each(['hint', 'recover'] as const)('ignores a late %s receipt after cancellation', async method => {
        const changes = observeBalanceChanges();
        let complete!: (receipt: unknown) => void;
        const send = vi.fn(() => new Promise(resolve => { complete = resolve; }));
        const client = new CpuPracticeClient('Alice', settings, send, storage());
        const controller = new AbortController();
        const pending = client[method](2, controller.signal);
        controller.abort(new Error('CANCELED')); complete(paidReceipt(client));
        await expect(pending).rejects.toThrow('CANCELED');
        expect(changes).toEqual([]);
    });
    it('keeps the release gate OFF and excludes ranked, online and campaign hint UI',()=>{
        expect(CPU_HINT_TICKETS_ENABLED).toBe(false);expect(officialCpuPractice({})).toBe(true);
        for(const props of [{roomId:'private'}, {matchMode:'ranked'}, {matchMode:'random'}, {campaignLabel:'Circuit'},
            {onComplete:()=>{}},{cpuPersonality:'balanced'},{cpuSearchProfile:{}},{onlineRole:'spectator'}]) {
            expect(officialCpuPractice(props)).toBe(false);
        }
    });
    it('replays both sides with identical movement, candidates, capture and last-move state',()=>{
        let state=createInitialState();let display=positionForDisplay(state);
        const history:ReturnType<typeof displayCpuPractice>['history']=[];
        const moves=[];
        for(let ply=0;ply<12;ply++){
            const legal=getAllConcreteMoves(state);if(!legal.length||state.winner)break;
            const move=legal[(ply*7)%legal.length];const legacy=quantumToLegacyMove(move,state);
            const local=applyLocalMove(display.tokens,display.pool,legacy,state.sideToMove,history);
            const next=applyPracticeMove(state,move);moves.push(next.lastMove!);
            expect(local.state.pieces).toEqual(next.pieces);expect(local.state.captured).toEqual(next.captured);
            const snapshot={sessionId:crypto.randomUUID(),userId:'Alice',kind:'cpu_practice',rulesVersion:CPU_PRACTICE_RULES_VERSION,
                playerSide:'white',level:1,seconds:600,revision:moves.length,stateHash:'hash',state:next,history:[...moves],
                status:'active',whiteMs:600000,blackMs:600000} as CpuPracticeSnapshot;
            const restored=displayCpuPractice(snapshot);
            const rebuilt=legacyToQuantumState(restored.tokens,restored.pool,next.sideToMove,moves.length,restored.history.at(-1)??null);
            expect(rebuilt.pieces).toEqual(next.pieces);expect(rebuilt.lastMove).toEqual(next.lastMove);
            history.splice(0,history.length,...restored.history);state=next;display=restored;
        }
        expect(moves.length).toBeGreaterThan(4);
    });
});
