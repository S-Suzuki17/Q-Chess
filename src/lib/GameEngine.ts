import { PieceType } from '../config/gameConfig';
import { IdentityPool } from './IdentityPool';

export interface Token {
    id: string;
    player: 'white' | 'black';
    row: number;
    col: number;
    probabilities: Record<PieceType, number>;
    isCaptured?: boolean;
    promotedTo?: PieceType;
    hasMoved?: boolean;
}

export function deduceMoveTypes(
    token: Token,
    targetRow: number,
    targetCol: number,
    tokens: Token[],
    lastMove?: { tokenId: string; fromRow: number; fromCol: number; toRow: number; toCol: number }
): PieceType[] {
    const dr = targetRow - token.row;
    const dc = targetCol - token.col;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);
    const isWhite = token.player === 'white';
    
    const forwardDir = isWhite ? -1 : 1;
    const startRow = isWhite ? 6 : 1;

    const isCapture = tokens.some(t => t.row === targetRow && t.col === targetCol && t.player !== token.player);

    let isBlocked = false;
    if (absDr === 0 || absDc === 0 || absDr === absDc) {
        const stepR = absDr === 0 ? 0 : dr / absDr;
        const stepC = absDc === 0 ? 0 : dc / absDc;
        let r = token.row + stepR;
        let c = token.col + stepC;
        
        while (r !== targetRow || c !== targetCol) {
            if (tokens.some(t => t.row === r && t.col === c)) {
                isBlocked = true;
                break;
            }
            r += stepR;
            c += stepC;
        }
    }

    const types: PieceType[] = [];
    if (absDr === 0 && absDc === 0) return [];

    // Promoted pieces only move as their promoted type
    if (token.promotedTo) {
        let isPromotedMoveValid = false;
        if (token.promotedTo === 'Knight' && ((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2))) isPromotedMoveValid = true;
        if (!isBlocked) {
            if (token.promotedTo === 'Queen' && (absDr === 0 || absDc === 0 || absDr === absDc)) isPromotedMoveValid = true;
            if (token.promotedTo === 'Rook' && (absDr === 0 || absDc === 0)) isPromotedMoveValid = true;
            if (token.promotedTo === 'Bishop' && (absDr === absDc)) isPromotedMoveValid = true;
        }
        // Actually, if it's capture, does it matter? The movement vector handles capture implicitly because target has enemy piece
        if (isPromotedMoveValid) types.push(token.promotedTo);
        return types; // Short-circuit, it cannot be anything else
    }

    if ((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2)) types.push('Knight');

    if (isBlocked) {
        // Castling check (can be blocked conceptually? No, castling cannot be blocked)
        return types;
    }

    if (absDr <= 1 && absDc <= 1) types.push('King');
    if ((absDr > 0 && absDc === 0) || (absDr === 0 && absDc > 0)) { types.push('Rook'); types.push('Queen'); }
    if (absDr === absDc && absDr > 0) { types.push('Bishop'); types.push('Queen'); }

    // Castling
    if (absDr === 0 && absDc === 2 && token.row === startRow && !token.hasMoved) {
        // Must be row 7 or 0. Check if corresponding corner piece has moved.
        const cornerCol = dc > 0 ? 7 : 0;
        const cornerToken = tokens.find(t => t.row === startRow && t.col === cornerCol && t.player === token.player);
        if (cornerToken && !cornerToken.hasMoved) {
            types.push('King'); // Moving 2 horizontally allows King (if castling conditions met)
        }
    }

    if (isCapture) {
        if (dr === forwardDir && absDc === 1) types.push('Pawn');
    } else {
        if (dc === 0) {
            if (dr === forwardDir) types.push('Pawn'); 
            else if (dr === forwardDir * 2 && token.row === startRow) types.push('Pawn');
        } else if (absDc === 1 && dr === forwardDir && lastMove) {
            // En Passant check
            // The opponent pawn must have just moved 2 squares forward,
            // landing on the same row as our pawn, on the target column
            if (lastMove.toRow === token.row && 
                lastMove.toCol === targetCol &&
                Math.abs(lastMove.fromRow - lastMove.toRow) === 2) {
                types.push('Pawn');
            }
        }
    }

    return Array.from(new Set(types));
}

export function calculateProbabilities(pool: IdentityPool, pieceId: string): Record<PieceType, number> {
    const defaultProbs: Record<PieceType, number> = { King: 0, Queen: 0, Rook: 0, Bishop: 0, Knight: 0, Pawn: 0 };
    const possibilities = pool.piecePossibilities.get(pieceId);
    
    if (!possibilities || possibilities.size === 0) return defaultProbs;
    
    const weight = 1.0 / possibilities.size;
    possibilities.forEach(p => { defaultProbs[p] = weight; });
    
    return defaultProbs;
}

// ターゲットの駒が敵から攻撃されているか判定
export function isTokenThreatened(target: Token, tokens: Token[], pool: IdentityPool): boolean {
    const enemies = tokens.filter(t => t.player !== target.player && !t.isCaptured);
    for (const enemy of enemies) {
        const moveTypes = deduceMoveTypes(enemy, target.row, target.col, tokens);
        if (moveTypes.length === 0) continue;
        
        const enemyPossibilities = pool.piecePossibilities.get(enemy.id);
        if (!enemyPossibilities) continue;
        
        // 敵の正体の可能性の中に、この移動を可能にする駒タイプが含まれているか
        if (moveTypes.some(mt => enemyPossibilities.has(mt))) {
            return true;
        }
    }
    return false;
}

// プレイヤーがチェック（王手）されているか判定
export function isPlayerInCheck(player: 'white'|'black', tokens: Token[], pool: IdentityPool): boolean {
    // 盤面上に存在し、キングである可能性が残っている味方の駒を全て取得
    const friendlyPotentialKings = tokens.filter(t => 
        t.player === player && !t.isCaptured && pool.piecePossibilities.get(t.id)?.has('King')
    );
    
    // 【修正】量子チェスの特性上、キングの可能性を持つ駒が複数存在する場合、
    // 1つ取られても「それはキングではなかった」と波束が収縮するだけで敗北にはならない。
    // そのため、「最後の1つ（または確定済みのキング）」が攻撃された時のみチェックとする。
    if (friendlyPotentialKings.length > 1) {
        return false;
    }

    // その最後の1つが攻撃されていれば「チェック」とする
    return friendlyPotentialKings.some(k => isTokenThreatened(k, tokens, pool));
}

// ゲームオーバー判定
export function checkGameOver(tokens: Token[], pool: IdentityPool): 'white_wins' | 'black_wins' | null {
    const whiteHasKings = tokens.some(t => t.player === 'white' && !t.isCaptured && pool.piecePossibilities.get(t.id)?.has('King'));
    const blackHasKings = tokens.some(t => t.player === 'black' && !t.isCaptured && pool.piecePossibilities.get(t.id)?.has('King'));

    if (!whiteHasKings) return 'black_wins';
    if (!blackHasKings) return 'white_wins';

    return null;
}

// プレイヤーがチェックメイト（逃げ道なし）されているか判定
export function isCheckmate(player: 'white'|'black', tokens: Token[], pool: IdentityPool): boolean {
    // まずチェックされていなければチェックメイトではない
    if (!isPlayerInCheck(player, tokens, pool)) return false;

    // プレイヤーの全有効トークンについて、あらゆる移動をシミュレート
    const playerTokens = tokens.filter(t => t.player === player && !t.isCaptured);

    for (const token of playerTokens) {
        const currentPossibilities = pool.piecePossibilities.get(token.id);
        if (!currentPossibilities || currentPossibilities.size === 0) continue;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (token.row === r && token.col === c) continue;
                
                // 味方の駒の上には移動できない
                const targetToken = tokens.find(t => !t.isCaptured && t.row === r && t.col === c);
                if (targetToken && targetToken.player === player) continue;

                // 移動可能性の判定
                const possibleTypes = deduceMoveTypes(token, r, c, tokens);
                const validTypes = possibleTypes.filter(pt => currentPossibilities.has(pt));

                if (validTypes.length > 0) {
                    // その手を打ったと仮定したシミュレーションを行う
                    const clonedPool = pool.clone();
                    clonedPool.restrictIdentity(token.id, validTypes);
                    
                    const simTokens = tokens.map(t => {
                        if (targetToken && t.id === targetToken.id) {
                            const p = clonedPool.piecePossibilities.get(t.id);
                            if (p) p.delete('King');
                            return { ...t, isCaptured: true, row: -1, col: -1 };
                        }
                        if (t.id === token.id) return { ...t, row: r, col: c };
                        return t;
                    });
                    
                    const isValid = clonedPool.resolveGlobalConstraints(simTokens);

                    // 矛盾しない手であり、かつチェック状態を脱する手が存在すれば、まだチェックメイトではない
                    if (isValid && !isPlayerInCheck(player, simTokens, clonedPool)) {
                        return false;
                    }
                }
            }
        }
    }
    // すべての手を試してもチェック状態が継続するなら、チェックメイト！
    return true;
}
