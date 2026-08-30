const fs = require('fs');

// 1. Update GameEngine.ts ActionPayload
let geCode = fs.readFileSync('server/src/game/GameEngine.ts', 'utf8');
geCode = geCode.replace(
    /intention\?: 'castle' \| 'normal' } }/g,
    `intention?: 'castle' | 'normal'; promotedTo?: string } }`
);
geCode = geCode.replace(
    /intention\?: 'castle' \| 'normal' }\): boolean \{/,
    `intention?: 'castle' | 'normal'; promotedTo?: string }): boolean {`
);
geCode = geCode.replace(
    /const { pieceId, toX, toY, intention } = payload;/,
    `const { pieceId, toX, toY, intention, promotedTo } = payload;`
);
geCode = geCode.replace(
    /const result = attemptMove\(this\.state\.pieces, this\.state\.board, pieceId, toX, toY, intention\);/,
    `const result = attemptMove(this.state.pieces, this.state.board, pieceId, toX, toY, intention, promotedTo);`
);
fs.writeFileSync('server/src/game/GameEngine.ts', geCode);

// 2. Update quantumChess.ts
let qcCode = fs.readFileSync('server/src/game/quantumChess.ts', 'utf8');
qcCode = qcCode.replace(
    /export function attemptMove\(pieces: any\[], board: any\[], pieceId: number, toX: number, toY: number, intention: 'castle' \| 'normal' \| undefined = undefined\) \{/,
    `export function attemptMove(pieces: any[], board: any[], pieceId: number, toX: number, toY: number, intention: 'castle' | 'normal' | undefined = undefined, promotedTo: string | undefined = undefined) {`
);

const oldPossibilitiesCheck = `    if (newPossibilities.length === 0) {
        return { success: false, pieces, board, capturedPiece: null, message: 'Invalid move for this piece' };
    }`;

const newPossibilitiesCheck = `    if (newPossibilities.length === 0) {
        return { success: false, pieces, board, capturedPiece: null, message: 'Invalid move for this piece' };
    }

    if (promotedTo && ['Q', 'R', 'B', 'N'].includes(promotedTo) && newPossibilities.includes('P')) {
        const isWhite = piece.team === 0;
        if ((isWhite && toY === 7) || (!isWhite && toY === 0)) {
            newPossibilities = [promotedTo];
        }
    }`;

qcCode = qcCode.replace(oldPossibilitiesCheck, newPossibilitiesCheck);
fs.writeFileSync('server/src/game/quantumChess.ts', qcCode);

// 3. Update OnlineGameBoard.tsx
let ogCode = fs.readFileSync('src/components/OnlineGameBoard.tsx', 'utf8');

// Add promotion state
ogCode = ogCode.replace(
    /const \[showResignConfirm, setShowResignConfirm] = useState<boolean>\(false\);/,
    `const [showResignConfirm, setShowResignConfirm] = useState<boolean>(false);
    const [promotionPending, setPromotionPending] = useState<{
        pieceId: number;
        targetRow: number;
        targetCol: number;
    } | null>(null);`
);

// Update move emission to intercept pawn promotion
const oldEmitMove = `            socket?.emit('player_action', {
                actionId: Date.now().toString(),
                version: gameState.version,
                action: {
                    type: 'MOVE',
                    payload: { pieceId: numId, toX: targetCol, toY: targetRow }
                }
            });
            setSelectedTokenId(null);`;

const newEmitMove = `            const isPawnPromotion = (onlineRole === 'white' && targetRow === 7) || (onlineRole === 'black' && targetRow === 0);
            
            // Check if piece has Pawn as a valid move for this action
            const possibleTypes = deduceMoveTypes(token, targetRow, targetCol, tokens);
            const isPawnMove = possibleTypes.includes('Pawn');

            if (isPawnPromotion && isPawnMove) {
                setPromotionPending({
                    pieceId: numId,
                    targetRow,
                    targetCol
                });
                return;
            }

            socket?.emit('player_action', {
                actionId: Date.now().toString(),
                version: gameState.version,
                action: {
                    type: 'MOVE',
                    payload: { pieceId: numId, toX: targetCol, toY: targetRow }
                }
            });
            setSelectedTokenId(null);`;

ogCode = ogCode.replace(oldEmitMove, newEmitMove);

// Insert promotion UI dialog
const promotionUI = `            {/* Promotion Modal */}
            {promotionPending && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border-2 border-cyan-500/50 p-6 rounded-lg max-w-sm w-full text-center">
                        <h3 className="text-xl font-bold text-cyan-300 mb-2">{lang === 'ja' ? 'プロモーション' : 'Promotion'}</h3>
                        <p className="text-cyan-500/70 text-sm mb-6">{lang === 'ja' ? 'どの駒に昇格しますか？' : 'Choose a piece to promote to:'}</p>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {(['Queen', 'Rook', 'Bishop', 'Knight'] as const).map(pt => (
                                <button
                                    key={pt}
                                    onClick={() => {
                                        const pTo = pt === 'Queen' ? 'Q' : pt === 'Rook' ? 'R' : pt === 'Bishop' ? 'B' : 'N';
                                        socket?.emit('player_action', {
                                            actionId: Date.now().toString(),
                                            version: gameState.version,
                                            action: {
                                                type: 'MOVE',
                                                payload: { 
                                                    pieceId: promotionPending.pieceId, 
                                                    toX: promotionPending.targetCol, 
                                                    toY: promotionPending.targetRow,
                                                    promotedTo: pTo
                                                }
                                            }
                                        });
                                        setPromotionPending(null);
                                        setSelectedTokenId(null);
                                    }}
                                    className="p-3 bg-cyan-950/40 border border-cyan-500/30 hover:bg-cyan-800/50 hover:border-cyan-400 rounded text-cyan-300 font-bold transition-all"
                                >
                                    {pt}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                setPromotionPending(null);
                                setSelectedTokenId(null);
                            }}
                            className="w-full p-3 bg-red-950/40 border border-red-500/30 hover:bg-red-900/20 hover:border-red-400 rounded text-red-300 font-bold transition-all text-sm"
                        >
                            {lang === 'ja' ? 'キャンセル' : 'Cancel'}
                        </button>
                    </div>
                </div>
            )}
            
            {showResignConfirm && (`;

ogCode = ogCode.replace(/            \{showResignConfirm && \(/, promotionUI);

fs.writeFileSync('src/components/OnlineGameBoard.tsx', ogCode);

console.log('Fixed pawn promotion in online matches!');
