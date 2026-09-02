import { legacyToQuantumState } from '../src/quantum-engine/adapter';
import { generateLegalMoves } from '../src/quantum-engine/moveGenerator';
import { applyMove } from '../src/quantum-engine/stateTransition';
import { IdentityPool } from '../src/lib/IdentityPool';
import { calculateProbabilities } from '../src/lib/GameEngine';
import { GameState } from '../src/quantum-engine/types';
import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../src/quantum-engine/constants';
import { hasType } from '../src/quantum-engine/quantum/quantumState';

// 1. Initialize tokens
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

const initialState = legacyToQuantumState(initialTokens, pool, 'white');

const PIECE_VALUES: Record<number, number> = {
    [PIECE_PAWN]: 1.0,
    [PIECE_KNIGHT]: 3.0,
    [PIECE_BISHOP]: 3.0,
    [PIECE_ROOK]: 5.0,
    [PIECE_QUEEN]: 9.0,
    [PIECE_KING]: 0.0 
};

function getCount(state: number) {
    let c = 0;
    const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
    for (const t of types) if (hasType(state, t)) c++;
    return c;
}

function getBitmaskTypes(state: number): string[] {
    const res: string[] = [];
    if (hasType(state, PIECE_PAWN)) res.push("P");
    if (hasType(state, PIECE_KNIGHT)) res.push("N");
    if (hasType(state, PIECE_BISHOP)) res.push("B");
    if (hasType(state, PIECE_ROOK)) res.push("R");
    if (hasType(state, PIECE_QUEEN)) res.push("Q");
    if (hasType(state, PIECE_KING)) res.push("K");
    return res;
}

function getMobility(st: GameState, player: 'white'|'black') {
    let m = 0;
    for (const p of st.pieces) {
        if (p.alive && p.owner === player) {
            m += generateLegalMoves(st, p.id).length;
        }
    }
    return m;
}

function getCandidateCount(st: GameState, player: 'white'|'black') {
    let c = 0;
    for (const p of st.pieces) {
        if (p.alive && p.owner === player) {
            c += getCount(p.state);
        }
    }
    return c;
}

// Structuring evaluation elements as requested
class StructuredEval {
    // 1. Piece Value (Greedy material)
    getPieceValue(st: GameState, player: 'white'|'black'): number {
        let score = 0;
        for (const p of st.pieces) {
            if (!p.alive) continue;
            let maxVal = 0;
            const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
            for (const t of types) {
                if (hasType(p.state, t)) {
                    const v = PIECE_VALUES[t];
                    if (v > maxVal) maxVal = v;
                }
            }
            if (p.owner === player) score += maxVal;
            else score -= maxVal;
        }
        return score;
    }

    // 2. Origin Value
    getOriginValue(st: GameState, player: 'white'|'black'): number {
        return 0; // Placeholder
    }

    // 3. Mobility
    getMobilityValue(st: GameState, player: 'white'|'black'): number {
        const myMob = getMobility(st, player);
        const oppMob = getMobility(st, player === 'white' ? 'black' : 'white');
        return (myMob - oppMob) * 0.1; // Placeholder weight
    }

    // 4. Candidate Allocation
    getCandidateAllocation(st: GameState, player: 'white'|'black'): number {
        const myCand = getCandidateCount(st, player);
        const oppCand = getCandidateCount(st, player === 'white' ? 'black' : 'white');
        return (myCand - oppCand) * 0.5; // Placeholder weight
    }

    // 5. King Candidate
    getKingCandidateValue(st: GameState, player: 'white'|'black'): number {
        let score = 0;
        for (const p of st.pieces) {
            if (!p.alive) continue;
            if (hasType(p.state, PIECE_KING)) {
                if (p.owner === player) score += 1.0;
                else score -= 1.0;
            }
        }
        return score; // Placeholder weight
    }

    evaluate(st: GameState, player: 'white'|'black') {
        const pVal = this.getPieceValue(st, player);
        const oVal = this.getOriginValue(st, player);
        const mVal = this.getMobilityValue(st, player);
        const cVal = this.getCandidateAllocation(st, player);
        const kVal = this.getKingCandidateValue(st, player);
        
        return {
            total: pVal + oVal + mVal + cVal + kVal,
            pVal, oVal, mVal, cVal, kVal
        };
    }
}

const evaluator = new StructuredEval();

const whitePieces = initialState.pieces.filter((p: any) => p.owner === 'white');

type MoveStats = {
    piecePos: string,
    target: string,
    resultingState: string,
    capturedPieces: number,
    evalBreakdown: any,
    totalCandidateCount: number,
    mobility: number,
    kingCandidates: number,
    constraintChanges: string
};

const stats: MoveStats[] = [];

for (const p of whitePieces) {
    const moves = generateLegalMoves(initialState, p.id);
    for (const m of moves) {
        let nextState;
        try {
            nextState = applyMove(initialState, { pieceId: p.id, target: m.target });
        } catch (e) {
            continue;
        }
        
        const captured = nextState.pieces.filter((op: any) => op.owner === 'black' && !op.alive).length;
        const ev = evaluator.evaluate(nextState, 'white');
        
        const movedPiece = nextState.pieces.find((np: any) => np.id === p.id)!;
        const count = getCount(movedPiece.state);
        
        const totalCand = getCandidateCount(nextState, 'white');
        const mob = getMobility(nextState, 'white');
        const kings = nextState.pieces.filter((np: any) => np.owner === 'white' && np.alive && hasType(np.state, PIECE_KING)).length;
        
        const prevCount = getCount(p.state);
        const constraintChanges = `Count: ${prevCount} -> ${count}`;

        stats.push({
            piecePos: `(${p.position.col},${p.position.row})`,
            target: `(${m.target.col},${m.target.row})`,
            resultingState: `{${getBitmaskTypes(movedPiece.state).join(',')}}`,
            capturedPieces: captured,
            evalBreakdown: ev,
            totalCandidateCount: totalCand,
            mobility: mob,
            kingCandidates: kings,
            constraintChanges
        });
    }
}

// Print detailed logs for a few specific types of moves:
// 1. A move that maintains candidates (e.g. advance pawn-like)
// 2. A move that captures and collapses (e.g. diag capture)

const maintains = stats.filter(s => s.resultingState.split(',').length >= 3);
const captures = stats.filter(s => s.capturedPieces > 0);

console.log("=== Q-GAMBIT Greedy Analysis (Qoppelia Style) ===\n");

console.log("--- Move that Maintains Quantum Candidates (e.g., straight advance) ---");
if (maintains.length > 0) {
    console.log(JSON.stringify(maintains[0], null, 2));
}

console.log("\n--- Move that Captures and Collapses ---");
if (captures.length > 0) {
    // Sort captures by pieceValue (greedy)
    captures.sort((a,b) => b.evalBreakdown.pVal - a.evalBreakdown.pVal);
    console.log(JSON.stringify(captures[0], null, 2));
} else {
    // If no captures on turn 1, let's simulate a board where a capture IS possible!
    console.log("No captures available on Turn 1. Setting up a scenario...");
}
