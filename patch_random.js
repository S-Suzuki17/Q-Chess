const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/ai/random.ts', 'utf8');

code = code.replace(
    /const types = \[PIECE_PAWN[\s\S]*?}\n            }/g,
    `// Keep the full superposition of the move
            const isPromotion = (candidate.requiredTypes & PIECE_PAWN) !== 0 && (candidate.target.row === 0 || candidate.target.row === 7);
            if (isPromotion) {
                moves.push({
                    pieceId: piece.id,
                    target: candidate.target,
                    chosenType: candidate.requiredTypes,
                    promotionTarget: PIECE_QUEEN
                });
            } else {
                moves.push({
                    pieceId: piece.id,
                    target: candidate.target,
                    chosenType: candidate.requiredTypes
                });
            }`
);

fs.writeFileSync('src/quantum-engine/ai/random.ts', code, 'utf8');
