import { GameState, Move } from '../types';
import { PlayerColor } from '../constants';
import { generateLegalMoves } from '../moveGenerator';
import { applyMove } from '../stateTransition';
import { getWinner } from '../terminal';
import { Evaluator } from './eval';
import { getAllConcreteMoves } from './random';

export interface MCTSOptions {
    timeLimitMs?: number;
    maxIterations?: number;
    explorationConstant?: number;
}

export class MCTSNode {
    state: GameState;
    move: Move | null;
    parent: MCTSNode | null;
    children: MCTSNode[];
    visits: number;
    score: number; // Perspective of the player who just moved
    untriedMoves: Move[];
    playerToMove: PlayerColor;
    isTerminal: boolean;

    constructor(state: GameState, move: Move | null = null, parent: MCTSNode | null = null) {
        this.state = state;
        this.move = move;
        this.parent = parent;
        this.children = [];
        this.visits = 0;
        this.score = 0;
        this.playerToMove = state.sideToMove;
        
        const winner = state.winner || getWinner(state);
        this.isTerminal = winner !== null;
        this.untriedMoves = this.isTerminal ? [] : getAllConcreteMoves(state);
    }
}

export class MCTSEngine {
    private evalFn: Evaluator;
    private c: number;

    constructor(evalFn: Evaluator, options: MCTSOptions = {}) {
        this.evalFn = evalFn;
        this.c = options.explorationConstant || Math.SQRT2;
    }

    public search(initialState: GameState, options: MCTSOptions): Move | null {
        const root = new MCTSNode(initialState);
        if (root.isTerminal || root.untriedMoves.length === 0) return null;

        const timeLimit = options.timeLimitMs || 1000;
        const maxIters = options.maxIterations || 10000;
        const start = performance.now();
        let iterations = 0;

        while (iterations < maxIters && performance.now() - start < timeLimit) {
            let node = this.select(root);
            if (!node.isTerminal && node.untriedMoves.length > 0) {
                node = this.expand(node);
            }
            const reward = this.simulate(node.state, node.parent ? node.parent.playerToMove : root.playerToMove);
            this.backpropagate(node, reward);
            iterations++;
        }

        // Return the move with the highest visit count
        let bestChild = root.children[0];
        for (const child of root.children) {
            if (child.visits > bestChild.visits) {
                bestChild = child;
            }
        }
        return bestChild.move;
    }

    private select(node: MCTSNode): MCTSNode {
        while (node.untriedMoves.length === 0 && node.children.length > 0) {
            let bestValue = -Infinity;
            let bestNode = node.children[0];
            
            for (const child of node.children) {
                // UCB1 formula
                const exploitation = child.score / child.visits;
                const exploration = this.c * Math.sqrt(Math.log(node.visits) / child.visits);
                const ucb1 = exploitation + exploration;
                
                if (ucb1 > bestValue) {
                    bestValue = ucb1;
                    bestNode = child;
                }
            }
            node = bestNode;
        }
        return node;
    }

    private expand(node: MCTSNode): MCTSNode {
        const idx = Math.floor(Math.random() * node.untriedMoves.length);
        const move = node.untriedMoves.splice(idx, 1)[0];
        
        try {
            const nextState = applyMove(node.state, move);
            const child = new MCTSNode(nextState, move, node);
            node.children.push(child);
            return child;
        } catch (e) {
            // Should be highly unlikely with getAllConcreteMoves, but just in case
            return node; 
        }
    }

    private simulate(state: GameState, perspective: PlayerColor): number {
        // Rollout with Eval-v0 (or whichever is provided)
        // Instead of random rollout to the very end (which takes too long in branching games),
        // we use our heuristic evaluator on the immediate state (1-ply heuristic rollout).
        // Since we are implementing a standard PUCT-like or heuristic MCTS:
        const rawScore = this.evalFn.evaluate(state, perspective);
        // Normalize score between 0 and 1 for UCB1
        // (Assuming typical material difference is within -20 to 20)
        let normalized = 0.5 + (rawScore / 40.0);
        if (normalized > 1) normalized = 1;
        if (normalized < 0) normalized = 0;
        return normalized;
    }

    private backpropagate(node: MCTSNode | null, reward: number): void {
        while (node !== null) {
            node.visits++;
            node.score += reward;
            // Invert reward for the opponent's turn in the tree path
            reward = 1.0 - reward;
            node = node.parent;
        }
    }
}
