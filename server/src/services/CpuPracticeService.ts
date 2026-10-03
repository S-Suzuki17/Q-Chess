import type { SupabaseClient } from '@supabase/supabase-js';
import { GameState, Move } from '../quantum-engine/types';
import { searchBestMove, TacticalSearchResult } from '../quantum-engine/ai/search';
import { EvalV3 } from '../quantum-engine/ai/evalV3';
import { createInitialState } from '../quantum-engine/initialState';
import { applyMove } from '../quantum-engine/stateTransition';
import { createHash } from 'crypto';

function hashGameState(state: GameState): string {
    return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

export class CpuPracticeService {
    constructor(private supabaseClient: SupabaseClient, private enabled = false) {}

    async requestHint(
        requestId: string,
        userId: string,
        moveHistory: Move[],
        pool: 'white' | 'black'
    ) {
        if (!this.enabled) throw new Error('CPU_PRACTICE_DISABLED');

        let state = createInitialState();
        for (const move of moveHistory) {
            const nextState = applyMove(state, move);
            if (!nextState) throw new Error('INVALID_MOVE_HISTORY');
            state = nextState;
        }

        if (state.sideToMove !== pool) {
            throw new Error('NOT_YOUR_TURN');
        }

        const sessionHash = hashGameState(state);

        // Calculate the hint BEFORE debiting
        const evalFn = new EvalV3();
        const searchResult: TacticalSearchResult = searchBestMove(state, evalFn, { maxDepth: 4, timeLimitMs: 1500 });
        const hintMove = searchResult.move;

        if (!hintMove) {
            throw new Error('NO_LEGAL_HINT');
        }

        const piece = state.pieces.find(p => p.id === hintMove.pieceId);
        if (!piece) {
            throw new Error('INVALID_HINT_GENERATED');
        }

        // Call the RPC in one atomic transaction
        const { data, error } = await this.supabaseClient.rpc('buy_cpu_hint', {
            p_request_id: requestId,
            p_user_id: userId,
            p_session_hash: sessionHash,
            p_from_row: piece.position.row,
            p_from_col: piece.position.col,
            p_to_row: hintMove.target.row,
            p_to_col: hintMove.target.col
        }).abortSignal(AbortSignal.timeout(5000));

        if (error) {
            console.error('buy_cpu_hint error:', error);
            throw new Error('HINT_PURCHASE_FAILED');
        }

        if (data && data.success === false) {
            throw new Error(data.reason || 'INSUFFICIENT_FUNDS');
        }

        return data.hint;
    }
}
