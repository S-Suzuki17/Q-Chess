import { legacyToQuantumState } from '../src/quantum-engine/adapter';
import { generateLegalMoves } from '../src/quantum-engine/moveGenerator';
import { applyMove } from '../src/quantum-engine/stateTransition';
import { IdentityPool } from '../src/lib/IdentityPool';
import { calculateProbabilities } from '../src/lib/GameEngine';
import { GameState } from '../src/quantum-engine/types';
import { getWinner } from '../src/quantum-engine/terminal';
import { EvalQoppelia, QoppeliaWeights } from '../src/quantum-engine/ai/evalQoppelia';

function createInitState() {
    const pool = new IdentityPool();
    const initialTokens: any[] = [];
    let idCounter = 1;
    [0, 1, 6, 7].forEach(row => {
        const player = row <= 1 ? 'black' : 'white';
        for (let col = 0; col < 8; col++) {
            const id = `token_${idCounter++}`;
            pool.registerPiece(id);
            initialTokens.push({
                id, player, row, col,
                probabilities: calculateProbabilities(pool, id)
            });
        }
    });
    return legacyToQuantumState(initialTokens, pool, 'white');
}

function getGreedyMove(state: GameState, evaluator: EvalQoppelia): any {
    const pieces = state.pieces.filter(p => p.owner === state.sideToMove && p.alive);
    let bestScore = -Infinity;
    let bestMoves: any[] = [];

    for (const p of pieces) {
        const moves = generateLegalMoves(state, p.id);
        for (const m of moves) {
            try {
                const nextState = applyMove(state, { pieceId: p.id, target: m.target });
                const score = evaluator.evaluate(nextState, state.sideToMove);
                
                // Introduce tiny randomness to break ties and create variety
                const jitter = Math.random() * 0.0001; 
                const finalScore = score + jitter;

                if (finalScore > bestScore) {
                    bestScore = finalScore;
                    bestMoves = [{ pieceId: p.id, target: m.target }];
                } else if (Math.abs(finalScore - bestScore) < 0.0002) {
                    bestMoves.push({ pieceId: p.id, target: m.target });
                }
            } catch (e) {
                // Ignore invalid moves
            }
        }
    }
    
    if (bestMoves.length === 0) return null;
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function playMatch(whiteEval: EvalQoppelia, blackEval: EvalQoppelia, maxMoves = 100): 'white' | 'black' | 'draw' {
    let state = createInitState();
    let moves = 0;

    while (moves < maxMoves) {
        const winner = getWinner(state);
        if (winner) return winner;

        const currentEval = state.sideToMove === 'white' ? whiteEval : blackEval;
        const move = getGreedyMove(state, currentEval);

        if (!move) {
            return state.sideToMove === 'white' ? 'black' : 'white';
        }

        state = applyMove(state, move);
        moves++;
    }
    return 'draw';
}

function runArena(weightsA: Partial<QoppeliaWeights>, weightsB: Partial<QoppeliaWeights>, games: number) {
    console.log(`\n=== Running Arena (${games} games) ===`);
    console.log(`AI_A:`, weightsA);
    console.log(`AI_B:`, weightsB);
    
    const evalA = new EvalQoppelia(weightsA);
    const evalB = new EvalQoppelia(weightsB);

    let winsA = 0, winsB = 0, draws = 0;

    for (let i = 0; i < games; i++) {
        const isAWhite = i % 2 === 0;
        const whiteEval = isAWhite ? evalA : evalB;
        const blackEval = isAWhite ? evalB : evalA;

        const result = playMatch(whiteEval, blackEval);
        
        if (result === 'draw') {
            draws++;
        } else if ((result === 'white' && isAWhite) || (result === 'black' && !isAWhite)) {
            winsA++;
        } else {
            winsB++;
        }
    }

    console.log(`\nResults:`);
    console.log(`AI_A Wins: ${winsA}`);
    console.log(`AI_B Wins: ${winsB}`);
    console.log(`Draws: ${draws}`);
}

// 1. Pure Material (Current Greedy) vs Candidate Allocation AI
runArena(
    { pieceValue: 1.0 }, // Base Greedy
    { pieceValue: 1.0, candidateAllocation: 0.5 }, // Values maintaining candidates highly
    10
);

// 2. Candidate Allocation vs Mobility + Origin AI
runArena(
    { pieceValue: 1.0, candidateAllocation: 0.5 },
    { pieceValue: 1.0, candidateAllocation: 0.5, mobility: 0.1, originValue: 0.2 },
    10
);

