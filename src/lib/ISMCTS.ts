import { Token, deduceMoveTypes, isPlayerInCheck, isCheckmate } from './GameEngine';
import { IdentityPool } from './IdentityPool';
import { PieceType } from '../config/gameConfig';
import { AIMove } from './ServerAIEngine';

export class MCTSNode {
    public visits: number = 0;
    public wins: number = 0;
    public children: Map<string, MCTSNode> = new Map();

    constructor(public parent: MCTSNode | null, public move: AIMove | null, public playerTurn: 'white' | 'black') {}

    // rootPlayer から見た勝利数を記録する仕様の場合、
    // 現在のノードが選ばれるときは、その親ノードのプレイヤー（＝親で手を打つ人）の視点でUCB1を計算すべき。
    public getUCB1(isRootPlayerTurnAtParent: boolean, exploration: number = 1.414): number {
        if (this.visits === 0) return Infinity;
        
        // 親がrootPlayerのターンの場合、rootPlayerの勝率を最大化したいので wins/visits を使う。
        // 親が敵のターンの場合、敵はrootPlayerの勝率を最小化したいので (visits - wins)/visits を使う。
        const exploitation = isRootPlayerTurnAtParent ? (this.wins / this.visits) : ((this.visits - this.wins) / this.visits);
        
        if (!this.parent) return exploitation;
        return exploitation + exploration * Math.sqrt(Math.log(this.parent.visits) / this.visits);
    }
}

function moveKey(move: AIMove): string {
    return `${move.tokenId}-${move.targetRow}-${move.targetCol}`;
}

export class ISMCTS {
    private root: MCTSNode;

    constructor(private rootTokens: Token[], private rootPool: IdentityPool, private rootPlayer: 'white' | 'black') {
        this.root = new MCTSNode(null, null, rootPlayer);
    }

    public search(timeoutMs: number): AIMove | null {
        const startTime = Date.now();
        let iterations = 0;

        while (Date.now() - startTime < timeoutMs) {
            this.runIteration();
            iterations++;
        }

        console.log(`ISMCTS executed ${iterations} iterations in ${Date.now() - startTime}ms`);

        if (this.root.children.size === 0) return null;

        let bestMove: AIMove | null = null;
        let maxVisits = -1;
        for (const child of this.root.children.values()) {
            if (child.visits > maxVisits) {
                maxVisits = child.visits;
                bestMove = child.move;
            }
        }
        return bestMove;
    }

    private runIteration() {
        // 1. Determinization
        const assignment = this.rootPool.sampleDeterminization(this.rootTokens);
        if (!assignment) return; 

        let currentTokens = this.rootTokens.map(t => ({
            ...t,
            probabilities: { [assignment[t.id]]: 1 } as Record<PieceType, number>
        }));
        
        let node = this.root;
        const currentPool = this.rootPool.clone();
        let currentPlayer = this.rootPlayer;

        // 2. Selection
        while (true) {
            const validMoves = this.getValidMovesForDeterminization(currentTokens, currentPlayer, assignment);
            if (validMoves.length === 0) break; 

            const untried = validMoves.filter(m => !node.children.has(moveKey(m)));

            if (untried.length > 0) {
                // 3. Expansion
                const move = untried[Math.floor(Math.random() * untried.length)];
                const child = new MCTSNode(node, move, currentPlayer === 'white' ? 'black' : 'white');
                node.children.set(moveKey(move), child);
                node = child;
                
                const { nextTokens } = this.applyMove(currentTokens, currentPool, move, assignment);
                currentTokens = nextTokens;
                currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
                break; 
            } else {
                let bestChild: MCTSNode | null = null;
                let maxUCB = -Infinity;
                const isRootPlayerTurnAtParent = (node.playerTurn === this.rootPlayer);
                
                for (const move of validMoves) {
                    const child = node.children.get(moveKey(move));
                    if (child) {
                        const ucb = child.getUCB1(isRootPlayerTurnAtParent);
                        if (ucb > maxUCB) {
                            maxUCB = ucb;
                            bestChild = child;
                        }
                    }
                }
                
                if (!bestChild) break;
                node = bestChild;
                const { nextTokens } = this.applyMove(currentTokens, currentPool, bestChild.move!, assignment);
                currentTokens = nextTokens;
                currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
            }
        }

        // 4. Simulation
        // 4. Simulation (Heuristic Evaluation instead of random rollouts for better/faster AI)
        let result = 0; 
        let myScore = 0;
        let oppScore = 0;
        let myKingAlive = false;
        let oppKingAlive = false;
        
        for(const t of currentTokens) {
            if (t.isCaptured) continue;
            const type = assignment[t.id];
            
            if (type === 'King') {
                if (t.player === this.rootPlayer) myKingAlive = true;
                else oppKingAlive = true;
            }
            
            const val = type === 'King' ? 100 : type === 'Queen' ? 9 : type === 'Rook' ? 5 : type === 'Bishop' ? 3 : type === 'Knight' ? 3 : 1;
            
            // Positional bonus: advance pawns, centralize pieces
            let positional = 0;
            if (type === 'Pawn') {
                positional = t.player === 'white' ? t.row * 0.1 : (7 - t.row) * 0.1;
            } else if (type === 'Knight') {
                positional = (3.5 - Math.abs(t.row - 3.5)) * 0.05 + (3.5 - Math.abs(t.col - 3.5)) * 0.05;
            }
            
            if (t.player === this.rootPlayer) myScore += val + positional;
            else oppScore += val + positional;
        }

        if (!myKingAlive) {
            result = -1;
        } else if (!oppKingAlive) {
            result = 1;
        } else {
            const scoreDiff = myScore - oppScore;
            // Squash material advantage to [-0.99, 0.99]
            result = 2 / (1 + Math.exp(-scoreDiff / 4)) - 1; 
        }

        // 5. Backpropagation
        let curr: MCTSNode | null = node;
        while (curr !== null) {
            curr.visits++;
            if (result > 0) curr.wins += 1;
            else if (result === 0) curr.wins += 0.5;
            curr = curr.parent;
        }
    }

    private getValidMovesForDeterminization(tokens: Token[], player: 'white' | 'black', assignment: Record<string, PieceType>): AIMove[] {
        const moves: AIMove[] = [];
        const myTokens = tokens.filter(t => t.player === player && !t.isCaptured);
        
        for (const token of myTokens) {
            const actualType = assignment[token.id];
            
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    if (token.row === r && token.col === c) continue;
                    if (tokens.some(t => !t.isCaptured && t.row === r && t.col === c && t.player === player)) continue;

                    const tempToken = { ...token, probabilities: { [actualType]: 1 } as Record<PieceType, number> };
                    const moveTypes = deduceMoveTypes(tempToken, r, c, tokens);
                    
                    if (moveTypes.includes(actualType)) {
                        const isPromotion = actualType === 'Pawn' && (r === 0 || r === 7);
                        moves.push({
                            tokenId: token.id,
                            targetRow: r,
                            targetCol: c,
                            possibleTypes: [actualType],
                            promotedTo: isPromotion ? 'Queen' : undefined
                        });
                    }
                }
            }
        }
        return moves;
    }

    private applyMove(tokens: Token[], pool: IdentityPool, move: AIMove, assignment: Record<string, PieceType>) {
        const target = tokens.find(t => t.row === move.targetRow && t.col === move.targetCol && !t.isCaptured);
        const nextTokens = tokens.map(t => {
            if (t.id === move.tokenId) {
                return { 
                    ...t, 
                    row: move.targetRow, 
                    col: move.targetCol, 
                    hasMoved: true,
                    promotedTo: move.promotedTo || t.promotedTo
                };
            }
            if (t.id === target?.id) return { ...t, isCaptured: true, row: -1, col: -1 };
            
            // En Passant target removal (simplified logic for simulation: if move was diagonal but no target, it's EP)
            if (move.possibleTypes.includes('Pawn') && t.row === move.targetRow && t.col === move.targetCol && !t.isCaptured) {
               // wait, in my simulation I only capture if target exists. I'll skip En Passant in simulation for speed.
            }
            
            return t;
        });
        return { nextTokens };
    }
}
