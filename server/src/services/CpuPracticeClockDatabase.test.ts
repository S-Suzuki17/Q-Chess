import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCpuPracticeFixture } from '../../../scripts/qa/cpu-practice-fixture.mjs';
import { CpuPracticeService, hashPracticeState } from './CpuPracticeService';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';
import { applyPracticeMove } from '../quantum-engine/practice';

describe('clock and revision recheck in actual hint purchase SQL', () => {
    let fixture: Awaited<ReturnType<typeof createCpuPracticeFixture>>;
    beforeAll(async () => { fixture = await createCpuPracticeFixture(); }, 15000);
    afterAll(async () => { await fixture.db.close(); });
    it.each(['expired', 'advanced'] as const)('does not debit if the session becomes %s during analysis', async condition => {
        const search = async (state: Parameters<typeof getAllConcreteMoves>[0]) => {
            const move = getAllConcreteMoves(state)[0];
            if (condition === 'expired') {
                await fixture.db.query("update public.cpu_practice_sessions set turn_started_at=clock_timestamp()-interval '11 seconds' where session_id=$1", [session.sessionId]);
            } else {
                const next = applyPracticeMove(state, move);
                await fixture.call('cpu_practice_commit_move', { p_operation_id: randomUUID(), p_session_id: session.sessionId,
                    p_user_id: 'Alice', p_revision: 0, p_intent_hash: 'clock-race', p_actor: 'human',
                    p_state_hash: session.stateHash, p_next_state: next, p_next_hash: hashPracticeState(next), p_move: next.lastMove });
            }
            return move;
        };
        const service = new CpuPracticeService(fixture.client as never, true, search, () => 'buy_cpu_hint');
        const session = await service.open('Alice', randomUUID(), 'white', 1, 10), id = randomUUID();
        const before = await fixture.wallet('Alice');
        await expect(service.requestHint(id, 'Alice', session.sessionId, 0)).rejects.toThrow(condition === 'expired' ? 'SESSION_FINISHED' : 'STALE_REVISION');
        expect(await fixture.wallet('Alice')).toEqual(before);
        expect(await service.receipt('Alice', session.sessionId, 0, id)).toBeNull();
        await service.close('Alice', session.sessionId);
    });
});
