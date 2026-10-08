import type { GameState } from '../quantum-engine/types';
import { EvalQoppelia } from '../quantum-engine/ai/evalQoppelia';
import { searchBestMove } from '../quantum-engine/ai/search';
import { PERSONALITY_WEIGHTS, type CPUPersonality } from '../config/cpuPersonalities';
import type { TacticalSearchOptions } from '../quantum-engine/ai/search';

self.onmessage = (event: MessageEvent<TacticalSearchOptions & { state: GameState; personality?: CPUPersonality }>) => {
    try {
        const result = searchBestMove(event.data.state, new EvalQoppelia(PERSONALITY_WEIGHTS[event.data.personality ?? 'balanced']), {
            timeLimitMs: event.data.timeLimitMs, maxDepth: event.data.maxDepth, tieBreakSeed:event.data.tieBreakSeed,
            quiescenceDepth:event.data.quiescenceDepth, transpositionEntries:event.data.transpositionEntries,
            playableRoot:event.data.playableRoot
        });
        self.postMessage({ result });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : 'CPU search failed' });
    }
};
