import { Token, deduceMoveTypes, isPlayerInCheck, isCheckmate } from './GameEngine';
import { IdentityPool } from './IdentityPool';
import { PieceType } from '../config/gameConfig';

export interface AIMove {
    tokenId: string;
    targetRow: number;
    targetCol: number;
    possibleTypes: PieceType[];
    promotedTo?: PieceType;
}

// 簡易的な駒の価値（確率計算用の重み）
const PIECE_VALUES = {
    King: 1000,
    Queen: 90,
    Rook: 50,
    Bishop: 30,
    Knight: 30,
    Pawn: 10
};

// 特定の駒に対する期待価値を計算
function getExpectedValue(token: Token, pool: IdentityPool): number {
    const probs = token.probabilities;
    let expected = 0;
    let totalProb = 0;
    for (const [type, prob] of Object.entries(probs)) {
        expected += PIECE_VALUES[type as keyof typeof PIECE_VALUES] * prob;
        totalProb += prob;
    }
    return totalProb > 0 ? expected / totalProb : 0;
}

export function calculateCPUMove(level: number, tokens: Token[], pool: IdentityPool, cpuPlayer: 'white' | 'black' = 'black'): AIMove | null {
    // 取られた駒（isCaptured: true）は動かさないように除外する
    const cpuTokens = tokens.filter(t => t.player === cpuPlayer && !t.isCaptured);
    const validMoves: AIMove[] = [];

    // 1. 全ての可能な手を列挙する
    for (const token of cpuTokens) {
        const possibilities = pool.piecePossibilities.get(token.id);
        if (!possibilities || possibilities.size === 0) continue;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (token.row === r && token.col === c) continue;
                if (tokens.some(t => !t.isCaptured && t.row === r && t.col === c && t.player === cpuPlayer)) continue;

                const moveTypes = deduceMoveTypes(token, r, c, tokens);
                const validTypesForMove = moveTypes.filter(mt => possibilities.has(mt));

                if (validTypesForMove.length > 0) {
                    validMoves.push({
                        tokenId: token.id,
                        targetRow: r,
                        targetCol: c,
                        possibleTypes: validTypesForMove
                    });
                }
            }
        }
    }

    if (validMoves.length === 0) return null;

    if (level === 1) {
        const captureMoves = validMoves.filter(m => tokens.some(t => !t.isCaptured && t.row === m.targetRow && t.col === m.targetCol));
        if (captureMoves.length > 0 && Math.random() > 0.5) return captureMoves[Math.floor(Math.random() * captureMoves.length)];
        return validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    // Level 2 & 3: 量子チェス定跡に基づいたスコアリング評価
    const opponent = cpuPlayer === 'white' ? 'black' : 'white';

    const scoredMoves = validMoves.map(move => {
        let score = 0;
        const targetToken = tokens.find(t => !t.isCaptured && t.row === move.targetRow && t.col === move.targetCol);
        
        if (level === 2) {
            // Level 2: 簡易的な損得と、自身の可能性の維持（初級〜中級）
            if (targetToken) score += getExpectedValue(targetToken, pool) * 2;
            score += move.possibleTypes.length * 10;
            score += Math.random() * 5;
            return { move, score };
        }

        // --- Level 3 (OMEGA): 量子定跡（Quantum Theory）に基づく完全シミュレーション評価 ---
        
        // 移動をシミュレート
        const clonedPool = pool.clone();
        clonedPool.restrictIdentity(move.tokenId, move.possibleTypes);
        const simTokens = tokens.map(t => {
            if (t.id === move.tokenId) return { ...t, row: move.targetRow, col: move.targetCol };
            if (t.id === targetToken?.id) {
                const p = clonedPool.piecePossibilities.get(t.id);
                if (p) p.delete('King');
                return { ...t, isCaptured: true, row: -1, col: -1 }; 
            }
            return t;
        });
        const isValid = clonedPool.resolveGlobalConstraints(simTokens);

        // 自殺手（自分がチェックされる）、または量子制約上ありえない（矛盾する）手は論外
        if (!isValid || isPlayerInCheck(cpuPlayer, simTokens, clonedPool)) {
            return { move, score: -99999 };
        }

        // 状態量の集計
        let myTotalAmbiguity = 0;
        const myKingCandidates = [];
        let enemyTotalAmbiguity = 0;
        const enemyKingCandidates = [];
        let myMaterial = 0;
        let enemyMaterial = 0;

        for (const t of simTokens) {
            if (t.isCaptured) continue;
            const p = clonedPool.piecePossibilities.get(t.id);
            if (!p) continue;

            if (t.player === cpuPlayer) {
                myTotalAmbiguity += p.size;
                myMaterial += getExpectedValue(t, clonedPool);
                if (p.has('King')) myKingCandidates.push(t);
            } else {
                enemyTotalAmbiguity += p.size;
                enemyMaterial += getExpectedValue(t, clonedPool);
                if (p.has('King')) enemyKingCandidates.push(t);
            }
        }

        // [セオリー1] 可能性の維持と破壊
        // 自分の可能性の総数は高く保ち、相手の可能性は削る（強要する）
        score += myTotalAmbiguity * 15;
        score -= enemyTotalAmbiguity * 20; // 相手の可能性を減らす行動（攻撃や収束の強要）を高く評価

        // [セオリー2] 速度計算＝玉候補の数
        // 自分のキング候補が多いほど死ににくく、相手のキング候補が少ないほど勝ちに近い
        score += myKingCandidates.length * 50;
        score -= enemyKingCandidates.length * 100; // 相手の玉候補を減らす（取る、または玉以外の正体を確定させる）ことを最優先

        // [セオリー3] 玉候補の分散（ダブル穴熊理論）
        // 味方のキング候補が一箇所に固まると一網打尽にされるため、X座標の分散を評価する
        if (myKingCandidates.length > 1) {
            const avgCol = myKingCandidates.reduce((sum, k) => sum + k.col, 0) / myKingCandidates.length;
            const variance = myKingCandidates.reduce((sum, k) => sum + Math.pow(k.col - avgCol, 2), 0);
            score += variance * 5; // 散らばっているほど安全
        }

        // 駒の損得（量子状態の評価に比べれば副次的な要素）
        score += (myMaterial - enemyMaterial) * 0.5;

        // 王手と詰み判定
        const deliversCheck = isPlayerInCheck(opponent, simTokens, clonedPool);
        if (deliversCheck) {
            score += 200; // 単なる王手
            if (isCheckmate(opponent, simTokens, clonedPool)) {
                score += 100000; // 即死コンボ発見
            }
        }

        // ナイトの奇襲等の「意図的な収束」は、得られるスコアが減少分（myTotalAmbiguityの低下）を
        // 上回る（例：玉候補を潰せる、詰ませる）場合にのみAIが自動的に選択するようになる。

        score += Math.random() * 2; // 微小な揺らぎ
        return { move, score };
    });

    scoredMoves.sort((a, b) => b.score - a.score);
    // console.log("AI Scores (OMEGA):", scoredMoves.slice(0, 3));

    return scoredMoves.length > 0 ? scoredMoves[0].move : null;
}
