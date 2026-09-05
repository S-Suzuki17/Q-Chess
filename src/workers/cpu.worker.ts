import type { GameState } from '../quantum-engine/types';
import { EvalQoppelia } from '../quantum-engine/ai/evalQoppelia';
import { searchBestMove } from '../quantum-engine/ai/search';

self.onmessage = (event: MessageEvent<{ state: GameState; timeLimitMs: number }>) => {
    try {
        const result = searchBestMove(event.data.state, new EvalQoppelia(), {
            timeLimitMs: event.data.timeLimitMs, maxDepth: 6
        });
        self.postMessage({ result });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : 'CPU search failed' });
    }
};
