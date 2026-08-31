import { PieceType } from '../config/gameConfig';
import { Token } from './GameEngine';

export class IdentityPool {
    // 未確定のまま残っている各駒のストック数
    public remainingPool: Record<PieceType, number> = {
        King: 1, Queen: 1, Rook: 2, Bishop: 2, Knight: 2, Pawn: 8
    };

    // 各トークン（駒ID）が現在なり得る「正体の可能性」
    public piecePossibilities: Map<string, Set<PieceType>> = new Map();

    constructor(initialPool?: Record<PieceType, number>, initialPossibilities?: Map<string, Set<PieceType>>) {
        if (initialPool) this.remainingPool = { ...initialPool };
        if (initialPossibilities) {
            this.piecePossibilities = new Map();
            initialPossibilities.forEach((val, key) => {
                this.piecePossibilities.set(key, new Set(val));
            });
        }
    }

    /**
     * 新しい未確定トークンを登録する（初期化）
     */
    registerPiece(pieceId: string) {
        const allTypes = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'] as PieceType[];
        this.piecePossibilities.set(pieceId, new Set(allTypes));
    }

    /**
     * 駒の移動などにより、可能性を特定の駒タイプに絞り込む（観測）
     */
    restrictIdentity(pieceId: string, allowedTypes: PieceType[]) {
        const currentPossibilities = this.piecePossibilities.get(pieceId);
        if (!currentPossibilities) return false;

        let changed = false;
        const allowedSet = new Set(allowedTypes);

        // あり得ない正体を除外
        for (const pt of Array.from(currentPossibilities)) {
            if (!allowedSet.has(pt)) {
                currentPossibilities.delete(pt);
                changed = true;
            }
        }
        return changed;
    }

    /**
     * 全体トークンの情報を受け取り、数独のように「必ずその駒になる」制約を伝播させる
     * @returns {boolean} 矛盾が生じた（ありえない状態になった）場合は false, 正常に解決された場合は true
     */
    resolveGlobalConstraints(tokens: Token[]): boolean { // Token型を想定
        const MAX_COUNTS = { King: 1, Queen: 1, Rook: 2, Bishop: 2, Knight: 2, Pawn: 8 };
        const ALL_TYPES = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'] as PieceType[];

        let changed = true;
        let loopCount = 0;
        const maxLoops = 20;

        // 全ての可能な部分集合を事前生成 (2^6 - 1 = 63通り)
        const subsets: PieceType[][] = [];
        for (let i = 1; i < (1 << ALL_TYPES.length); i++) {
            const subset: PieceType[] = [];
            for (let j = 0; j < ALL_TYPES.length; j++) {
                if ((i & (1 << j)) !== 0) subset.push(ALL_TYPES[j]);
            }
            subsets.push(subset);
        }

        while (changed && loopCount < maxLoops) {
            changed = false;
            loopCount++;

            for (const player of ['white', 'black']) {
                // 取られた駒も「消費された枠」として扱うため除外しない
                const playerTokens = tokens.filter(t => t.player === player);

                for (const subset of subsets) {
                    const reqCount = subset.reduce((sum, t) => sum + MAX_COUNTS[t], 0);
                    
                    // 「可能性がこのsubsetの要素だけ」で構成されている駒を探す
                    const tokensInSubset = playerTokens.filter(t => {
                        const p = this.piecePossibilities.get(t.id);
                        if (!p || p.size === 0) return false;
                        
                        let isSubsetOnly = true;
                        for (const pt of p) {
                            if (!subset.includes(pt)) isSubsetOnly = false;
                        }
                        return isSubsetOnly;
                    });

                    // 矛盾の検出（例：枠が3しかないのに、このsubsetにしかなれない駒が4つ以上ある）
                    if (tokensInSubset.length > reqCount) {
                        return false; 
                    }

                    // それらの駒の数が、枠の合計数と完全に一致した！
                    // => つまり、これらの駒でsubsetの役職はすべて埋まるので、
                    //    「他の駒」は絶対にこのsubsetのどれかにはなれない。
                    if (tokensInSubset.length === reqCount) {
                        for (const token of playerTokens) {
                            if (!tokensInSubset.find(t => t.id === token.id)) {
                                const p = this.piecePossibilities.get(token.id);
                                if (p) {
                                    for (const st of subset) {
                                        if (p.has(st)) {
                                            p.delete(st);
                                            if (p.size === 0) return false; // 可能性が消滅する矛盾
                                            changed = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Verify each player still has at least one potential King
        const whitePieces = tokens.filter(t => t.player === 'white' && !t.isCaptured);
        const blackPieces = tokens.filter(t => t.player === 'black' && !t.isCaptured);
        const whiteHasKing = whitePieces.some(t => {
            const p = this.piecePossibilities.get(t.id);
            return p && p.has('King');
        });
        const blackHasKing = blackPieces.some(t => {
            const p = this.piecePossibilities.get(t.id);
            return p && p.has('King');
        });
        if (!whiteHasKing || !blackHasKing) return false;

        return true;
    }

    /**
     * 現在の量子状態（可能性のプール）をディープコピーして返す
     * （AIのシミュレーションや、チェックメイト判定に使用）
     */
    clone(): IdentityPool {
        const newPool = new IdentityPool();
        this.piecePossibilities.forEach((possibilities, id) => {
            newPool.piecePossibilities.set(id, new Set(possibilities));
        });
        return newPool;
    }

    /**
     * ランダムな具体的な配置（Determinization）をサンプリングする
     */
    sampleDeterminization(tokens: Token[]): Record<string, PieceType> | null {
        const assignment: Record<string, PieceType> = {};
        
        for (const player of ['white', 'black']) {
            const playerTokens = tokens.filter(t => t.player === player);
            const maxPieces = { King: 1, Queen: 1, Rook: 2, Bishop: 2, Knight: 2, Pawn: 8 };
            const usedCounts = { King: 0, Queen: 0, Rook: 0, Bishop: 0, Knight: 0, Pawn: 0 };
            
            const unresolvedTokens: Token[] = [];
            for (const t of playerTokens) {
                const poss = this.piecePossibilities.get(t.id);
                if (!poss) continue;
                if (poss.size === 1) {
                    const type = Array.from(poss)[0];
                    usedCounts[type as keyof typeof usedCounts]++;
                    if (usedCounts[type as keyof typeof usedCounts] > maxPieces[type as keyof typeof maxPieces]) {
                        return null; // Contradiction: too many pieces of this type
                    }
                    assignment[t.id] = type;
                } else {
                    unresolvedTokens.push(t);
                }
            }

            const shuffle = <T>(array: T[]): T[] => array.sort(() => Math.random() - 0.5);
            
            const dfs = (index: number): boolean => {
                if (index === unresolvedTokens.length) return true;
                
                // Shuffle tokens to avoid bias? We can just shuffle the possibilities.
                const token = unresolvedTokens[index];
                const poss = Array.from(this.piecePossibilities.get(token.id) || []);
                shuffle(poss);
                
                for (const type of poss) {
                    if (usedCounts[type as keyof typeof usedCounts] < maxPieces[type as keyof typeof maxPieces]) {
                        usedCounts[type as keyof typeof usedCounts]++;
                        assignment[token.id] = type;
                        if (dfs(index + 1)) return true;
                        usedCounts[type as keyof typeof usedCounts]--;
                        delete assignment[token.id];
                    }
                }
                return false;
            };

            // Shuffle unresolved order to add more randomness to the tree
            shuffle(unresolvedTokens);
            if (!dfs(0)) return null; 
        }
        return assignment;
    }
}
