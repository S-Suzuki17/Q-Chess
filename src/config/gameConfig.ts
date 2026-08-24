export type PieceType = 'King' | 'Queen' | 'Rook' | 'Bishop' | 'Knight' | 'Pawn';

export const GameConfig = {
    // ターン制限時間（ミリ秒）
    turnTimeoutMs: 45000,
    
    // 広告を表示するまでの対戦回数間隔
    adIntervalMatches: 2,
    
    // 盤面のサイズ
    boardSize: {
        rows: 8,
        cols: 8
    },

    // 駒の種類に応じた「重ね合わせ（同時に存在できる状態）」の最大数
    // 初期配置の数と連動させる仕様
    quantumSplitsLimit: {
        King: 1,   // 分裂不可（古典的な駒）。チェック判定が明確になる。
        Queen: 1,  // 分裂不可（古典的な駒）。最強だが常に居場所がバレている。
        Rook: 2,   // 最大2箇所に存在可能
        Bishop: 2, // 最大2箇所に存在可能
        Knight: 2, // 最大2箇所に存在可能
        Pawn: 8    // 最大8箇所に存在可能。量子の霧として盤面を覆う。
    } as Record<PieceType, number>
};
