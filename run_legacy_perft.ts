import { IdentityPool } from './src/lib/IdentityPool';
import { Token, deduceMoveTypes } from './src/lib/GameEngine';

const ALL_TYPES = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'] as const;

function createLegacyInitialState() {
    const tokens: Token[] = [];
    let idCounter = 1;
    for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 8; c++) {
            tokens.push({ id: `b_${idCounter++}`, player: 'black', row: r, col: c, probabilities: {} as any, isCaptured: false, hasMoved: false });
        }
    }
    for (let r = 6; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            tokens.push({ id: `w_${idCounter++}`, player: 'white', row: r, col: c, probabilities: {} as any, isCaptured: false, hasMoved: false });
        }
    }
    const pool = new IdentityPool();
    tokens.forEach(t => pool.registerPiece(t.id));
    return { tokens, pool, sideToMove: 'white' as 'white' | 'black' };
}

function legacyPerft(tokens: Token[], pool: IdentityPool, sideToMove: 'white'|'black', depth: number): number {
    if (depth === 0) return 1;
    let nodes = 0;
    const currentTokens = tokens.filter(t => !t.isCaptured && t.player === sideToMove);
    
    for (const token of currentTokens) {
        const currentPossibilities = pool.piecePossibilities.get(token.id);
        if (!currentPossibilities || currentPossibilities.size === 0) continue;
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (token.row === r && token.col === c) continue;
                
                const targetToken = tokens.find(t => !t.isCaptured && t.row === r && t.col === c);
                if (targetToken && targetToken.player === sideToMove) continue;

                // Move Generation
                const possibleTypes = deduceMoveTypes(token, r, c, tokens);
                
                // For each valid interpretation
                for (const pt of ALL_TYPES) {
                    if (possibleTypes.includes(pt) && currentPossibilities.has(pt)) {
                        const clonedPool = pool.clone();
                        clonedPool.restrictIdentity(token.id, [pt]);
                        
                        const nextTokens = tokens.map(t => {
                            if (targetToken && t.id === targetToken.id) {
                                const p = clonedPool.piecePossibilities.get(t.id);
                                if (p) p.delete('King');
                                return { ...t, isCaptured: true, row: -1, col: -1 };
                            }
                            if (t.id === token.id) return { ...t, row: r, col: c, hasMoved: true };
                            return t;
                        });
                        
                        if (clonedPool.resolveGlobalConstraints(nextTokens)) {
                            nodes += legacyPerft(nextTokens, clonedPool, sideToMove === 'white' ? 'black' : 'white', depth - 1);
                        }
                    }
                }
            }
        }
    }
    return nodes;
}

const { tokens, pool, sideToMove } = createLegacyInitialState();
const start = Date.now();
const nodes = legacyPerft(tokens, pool, sideToMove, 1);
console.log(`Legacy Depth 1: ${nodes} (Time: ${Date.now() - start}ms)`);
