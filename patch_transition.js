const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/stateTransition.ts', 'utf8');

code = code.replace(
    '// Run Constraint Solver (Throws QuantumContradiction if state is impossible)\n    nextPieces = resolveQuantumState(nextPieces);',
    `// Run Constraint Solver
    try {
        nextPieces = resolveQuantumState(nextPieces);
    } catch (e: any) {
        if (e.name === 'QuantumContradiction') {
            // In Q-GAMBIT, if a move creates a quantum contradiction (e.g. eliminating all enemy kings),
            // the player who made the move WINS immediately.
            return {
                pieces: nextPieces,
                sideToMove: state.sideToMove,
                ply: state.ply + 1,
                captured: { white: capturedWhite, black: capturedBlack },
                winner: state.sideToMove,
                hash: ''
            };
        }
        throw e;
    }`
);

fs.writeFileSync('src/quantum-engine/stateTransition.ts', code, 'utf8');
