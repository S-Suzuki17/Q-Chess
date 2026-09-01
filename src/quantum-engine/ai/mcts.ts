import { GameState, Move, PlayerColor } from '../types';
import { applyMove } from '../stateTransition';
import { getWinner } from '../terminal';
import { Evaluator } from './eval';
import { getAllConcreteMoves } from './random';
import { PRNG } from './prng';
import { hashState } from '../hash';
import { TranspositionTable } from './tt';

export interface MCTSOptions {
    timeLimitMs?: number;
    maxIterations?: number;
    explorationConstant?: number;
    seed?: number;
    useTT?: boolean;
}

export interface SearchStats {
    move: Move | null;
    iterations: number;
    nodes: number;
    timeMs: number;
    nodesPerSec: number;
    maxDepth: number;
    ttHits: number;
}

export class MCTSNode {
    state: GameState;
    move: Move | null;
    parent: MCTSNode | null;
    children: MCTSNode[];
    localVisits: number;
    localScore: number;
    untriedMoves: Move[];
    playerToMove: PlayerColor;
    isTerminal: boolean;
    stateHash: string;
    depth: number;

    constructor(state: GameState, move: Move | null = null, parent: MCTSNode | null = null) {
        this.state = state;
        this.move = move;
        this.parent = parent;
        this.children = [];
        this.localVisits = 0;
        this.localScore = 0;
        this.playerToMove = state.sideToMove;
        this.stateHash = hashState(state);
        this.depth = parent ? parent.depth + 1 : 0;
        
        const winner = state.winner || getWinner(state);
        this.isTerminal = winner !== null;
        this.untriedMoves = this.isTerminal ? [] : getAllConcreteMoves(state);
    }
}

export class MCTSEngine {
    private evalFn: Evaluator;
    private c: number;
    private prng: PRNG;
    private tt: TranspositionTable;
    private useTT: boolean;
    private nodeCount: number = 0;
    private ttHitCount: number = 0;

    constructor(evalFn: Evaluator, options: MCTSOptions = {}) {
        this.evalFn = evalFn;
        this.c = options.explorationConstant || Math.SQRT2;
        this.prng = new PRNG(options.seed !== undefined ? options.seed : Math.floor(Math.random() * 1000000));
        this.tt = new TranspositionTable();
        this.useTT = options.useTT !== false; // Default true
    }

    public search(initialState: GameState, options: MCTSOptions): SearchStats {
        this.nodeCount = 1;
        this.ttHitCount = 0;
        // Don't clear TT between searches if we want to share cross-turn stats! 
        // But for pure deterministic 1-turn evaluation stats, clearing is safer. We'll leave it persisting for now.
        
        const root = new MCTSNode(initialState);
        const timeLimit = options.timeLimitMs || 1000;
        const maxIters = options.maxIterations || 10000;
        const start = performance.now();
        let iterations = 0;
        let maxDepth = 0;

        if (root.isTerminal || root.untriedMoves.length === 0) {
            return this.buildStats(null, iterations, start, maxDepth);
        }

        while (iterations < maxIters && performance.now() - start < timeLimit) {
            let node = this.select(root);
            if (!node.isTerminal && node.untriedMoves.length > 0) {
                node = this.expand(node);
                if (node.depth > maxDepth) maxDepth = node.depth;
            }
            const reward = this.simulate(node.state, node.parent ? node.parent.playerToMove : root.playerToMove);
            this.backpropagate(node, reward);
            iterations++;
        }

        let bestChild = root.children[0];
        let bestVisits = -1;
        
        for (const child of root.children) {
            const v = this.useTT ? (this.tt.get(child.stateHash)?.visits || child.localVisits) : child.localVisits;
            if (v > bestVisits) {
                bestVisits = v;
                bestChild = child;
            }
        }
        
        return this.buildStats(bestChild ? bestChild.move : null, iterations, start, maxDepth);
    }

    private select(node: MCTSNode): MCTSNode {
        while (node.untriedMoves.length === 0 && node.children.length > 0) {
            let bestValue = -Infinity;
            let bestNodes: MCTSNode[] = [];
            
            const parentVisits = this.useTT ? (this.tt.get(node.stateHash)?.visits || node.localVisits) : node.localVisits;

            for (const child of node.children) {
                let v = child.localVisits;
                let s = child.localScore;
                
                if (this.useTT) {
                    const tte = this.tt.get(child.stateHash);
                    if (tte) {
                        v = tte.visits;
                        s = tte.totalValue;
                    }
                }

                if (v === 0) {
                    bestValue = Infinity;
                    bestNodes = [child];
                    break;
                }

                const exploitation = s / v;
                const exploration = this.c * Math.sqrt(Math.log(parentVisits) / v);
                const ucb1 = exploitation + exploration;
                
                if (ucb1 > bestValue) {
                    bestValue = ucb1;
                    bestNodes = [child];
                } else if (ucb1 === bestValue) {
                    bestNodes.push(child);
                }
            }
            node = bestNodes[Math.floor(this.prng.next() * bestNodes.length)];
        }
        return node;
    }

    private expand(node: MCTSNode): MCTSNode {
        const idx = Math.floor(this.prng.next() * node.untriedMoves.length);
        const move = node.untriedMoves.splice(idx, 1)[0];
        
        try {
            const nextState = applyMove(node.state, move);
            const child = new MCTSNode(nextState, move, node);
            this.nodeCount++;
            node.children.push(child);
            
            if (this.useTT && this.tt.get(child.stateHash)) {
                this.ttHitCount++;
            }
            
            return child;
        } catch (e) {
            return node; 
        }
    }

    private simulate(state: GameState, perspective: PlayerColor): number {
        const rawScore = this.evalFn.evaluate(state, perspective);
        let normalized = 0.5 + (rawScore / 40.0);
        if (normalized > 1) normalized = 1;
        if (normalized < 0) normalized = 0;
        return normalized;
    }

    private backpropagate(node: MCTSNode | null, reward: number): void {
        while (node !== null) {
            node.localVisits++;
            node.localScore += reward;
            
            if (this.useTT) {
                this.tt.record(node.stateHash, reward);
            }
            
            reward = 1.0 - reward;
            node = node.parent;
        }
    }

    private buildStats(move: Move | null, iterations: number, startTime: number, maxDepth: number): SearchStats {
        const timeMs = performance.now() - startTime;
        return {
            move,
            iterations,
            nodes: this.nodeCount,
            timeMs,
            nodesPerSec: this.nodeCount / (timeMs / 1000 || 1),
            maxDepth,
            ttHits: this.ttHitCount
        };
    }
}
