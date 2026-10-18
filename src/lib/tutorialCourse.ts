import type { GameState, Move, QuantumPiece } from '../quantum-engine/types';
import { ALL_PIECE_TYPES as ALL, PIECE_KING as K, PIECE_QUEEN as Q, PIECE_ROOK as R,
    PIECE_BISHOP as B, PIECE_KNIGHT as N, PIECE_PAWN as P } from '../quantum-engine/constants';
import { resolveQuantumState } from '../quantum-engine/quantum/candidateSolver';
import { applyPracticeMove } from '../quantum-engine/practice';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';
import { isCheckmate } from '../quantum-engine/terminal';

export type TutorialSquare = `${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}${1|2|3|4|5|6|7|8}`;
export type TutorialTask = {
    kind: 'move' | 'reject' | 'mate';
    from: TutorialSquare;
    to: TutorialSquare;
    /** Only special-move choices restrict the interpretation; ordinary moves retain the full mask. */
    chosenType?: number;
    promotionTarget?: number;
};
export type TutorialLesson = {
    id: string;
    chapter: number;
    create: () => GameState;
    tasks: readonly TutorialTask[];
};

export const TUTORIAL_COURSE_VERSION = 2;
export const TUTORIAL_PROGRESS_KEY = 'qg_tutorial_course_v2';
export function tutorialPosition(square: TutorialSquare) {
    return { row: 8 - Number(square[1]), col: square.charCodeAt(0) - 97 };
}
export function tutorialSquare(position: {row: number; col: number}): TutorialSquare {
    return `${String.fromCharCode(97 + position.col)}${8 - position.row}` as TutorialSquare;
}
const piece = (id: string, owner: 'white'|'black', state: number, square: TutorialSquare,
    hasMoved = true): QuantumPiece => ({
    id, owner, state, origin: tutorialPosition(square), position: tutorialPosition(square),
    alive: true, hasMoved, promoted: false,
});
const w = (id: string, state: number, square: TutorialSquare, moved = true) => piece(id, 'white', state, square, moved);
const b = (id: string, state: number, square: TutorialSquare, moved = true) => piece(id, 'black', state, square, moved);
const position = (pieces: QuantumPiece[], sideToMove: 'white'|'black' = 'white'): GameState => ({
    pieces: resolveQuantumState(pieces), sideToMove, ply: 0, winner: null,
    captured: {white: 0, black: 0}, hash: '',
});
const move = (from: TutorialSquare, to: TutorialSquare, options: Partial<TutorialTask> = {}): TutorialTask =>
    ({kind: 'move', from, to, ...options});

/** Small teaching positions, using the same immutable rules as local and authoritative CPU play. */
export const tutorialCourse: readonly TutorialLesson[] = [
    {id: 'pawn-step', chapter: 0,
        create: () => position([w('wk',K,'a1'), w('pawn',P,'e2',false), b('bk',K,'h8')]),
        tasks: [move('e2','e3')]},
    {id: 'pawn-double', chapter: 0,
        create: () => position([w('wk',K,'a1'), w('pawn',P,'e2',false), b('bk',K,'h8')]),
        tasks: [move('e2','e4')]},
    {id: 'opponent-capture', chapter: 0,
        create: () => position([w('wk',K,'a1'),w('pawn',P,'e2',false), b('bk',K,'h8'),b('reply',P,'f5')]),
        tasks: [move('e2','e4'), move('f5','e4')]},
    {id: 'rook', chapter: 1,
        create: () => position([w('wk',K,'h1'),w('rook',R,'a2'),w('blocker',P,'a6'),b('bk',K,'h8')]),
        tasks: [move('a2','a5')]},
    {id: 'bishop', chapter: 1,
        create: () => position([w('wk',K,'a1'),w('bishop',B,'c1'),b('bk',K,'h8')]),
        tasks: [move('c1','g5')]},
    {id: 'knight', chapter: 1,
        create: () => position([w('wk',K,'h1'),w('knight',N,'b1'),w('blocker',P,'b2'),w('blocker2',P,'c2'),b('bk',K,'h8')]),
        tasks: [move('b1','c3')]},
    {id: 'queen', chapter: 1,
        create: () => position([w('wk',K,'a1'),w('queen',Q,'d1'),b('bk',K,'a8')]),
        tasks: [move('d1','h5')]},
    {id: 'king', chapter: 1,
        create: () => position([w('wk',K,'e1'),b('bk',K,'h8')]),
        tasks: [move('e1','f1')]},
    {id: 'candidates', chapter: 2,
        create: () => position([w('wk',K,'a1'),w('mystery',ALL,'e4'),b('bk',K,'a8')]),
        tasks: [move('e4','h7')]},
    {id: 'deduction-chain', chapter: 2,
        create: () => position([w('wk',K,'a1'),w('mystery',B|Q,'e4'),w('other',R|Q,'d2'),b('bk',K,'a8'),b('reply',P,'a7',false)]),
        tasks: [move('e4','h7'),move('a7','a6'),move('h7','h5')]},
    {id: 'opponent-deduction', chapter: 2,
        create: () => position([w('wk',K,'a1'),w('target',B|Q,'h5'),b('bk',K,'a8'),b('mystery',ALL,'h7')],'black'),
        tasks: [move('h7','h5')]},
    {id: 'captured-slots', chapter: 2,
        create: () => position([w('wk',K,'h1'),w('rook',R,'a1'),b('bk',K,'h8'),b('queen',Q,'a4'),b('other',R|Q,'d7')]),
        tasks: [move('a1','a4')]},
    {id: 'castle', chapter: 3,
        create: () => position([w('castle',K|R,'e1',false),w('other',K|R,'a2'),w('rook',R,'h1',false),b('bk',K,'b8')]),
        tasks: [move('e1','g1',{chosenType:K})]},
    {id: 'promotion', chapter: 3,
        create: () => position([w('wk',K,'a1'),w('pawn',P,'e7'),b('bk',K,'h8')]),
        tasks: [move('e7','e8',{chosenType:P,promotionTarget:N})]},
    {id: 'decline-promotion', chapter: 3,
        create: () => position([w('wk',K,'a1'),w('mystery',P|R,'e7'),b('bk',K,'h8')]),
        tasks: [move('e7','e8',{chosenType:R})]},
    {id: 'en-passant', chapter: 3,
        create: () => position([w('wk',K,'a1'),w('pawn',P,'e5'),b('bk',K,'a8'),b('reply',P,'f7',false)],'black'),
        tasks: [move('f7','f5'),move('e5','f6')]},
    {id: 'check-block', chapter: 4,
        create: () => position([w('wk',K,'e1'),w('bishop',B,'c3'),b('bk',K,'h8'),b('rook',R,'e8')]),
        tasks: [move('c3','e5')]},
    {id: 'self-check', chapter: 4,
        create: () => position([w('wk',K,'e1'),w('rook',R,'e2'),b('bk',K,'h8'),b('attacker',R,'e8')]),
        tasks: [move('e2','f2',{kind:'reject'}),move('e2','e8')]},
    {id: 'king-escape', chapter: 4,
        create: () => position([w('wk',K,'e1'),b('bk',K,'h8'),b('rook',R,'e8')]),
        tasks: [move('e1','f1')]},
    {id: 'king-candidates', chapter: 4,
        create: () => position([w('wk',K,'h1'),w('rook',R,'a1'),b('target',K|B,'a4'),b('other',K|B,'h8')]),
        tasks: [move('a1','a4')]},
    {id: 'last-king', chapter: 5,
        create: () => position([w('wk',K,'h1'),w('rook',R,'a1'),b('target',K|B,'a4')]),
        tasks: [move('a1','a4')]},
    {id: 'stalemate', chapter: 5,
        create: () => position([w('wk',K,'c6'),w('queen',Q,'c7'),b('bk',K,'a8')]),
        tasks: [move('c7','b6')]},
    {id: 'checkmate', chapter: 5,
        create: () => position([w('wk',K,'h1'),w('guard',R,'c7'),w('attacker',R,'d6'),b('bk',K,'a8'),b('reply',P,'h7',false)]),
        tasks: [move('d6','d8')]},
    {id: 'quantum-mate', chapter: 5,
        create: () => position([w('wk',K,'h1'),w('guard',R|Q,'c7'),w('attacker',R|Q,'d5'),b('bk',K,'a8'),b('reply',P,'h7',false)]),
        tasks: [move('d5','d6'),move('h7','h6'),move('d6','d8',{kind:'mate'})]},
];

export function tutorialMoves(state: GameState, pieceId: string): Move[] {
    if (state.winner) return [];
    return getAllConcreteMoves(state, {allPromotions:true,playable:true}).filter(move => move.pieceId === pieceId);
}
/** Resolve an ordinary destination without silently choosing castling or a promotion. */
export function tutorialReferenceMove(state: GameState, task: TutorialTask): Move {
    const mover = state.pieces.find(piece => piece.alive && tutorialSquare(piece.position) === task.from);
    if (!mover) throw new Error('TUTORIAL_PIECE_MISSING');
    const target = tutorialPosition(task.to);
    const playable = tutorialMoves(state, mover.id).find(move =>
        move.target.row === target.row && move.target.col === target.col &&
        (task.chosenType === undefined || task.chosenType === move.chosenType) &&
        move.promotionTarget === task.promotionTarget);
    if (playable) return playable;
    // The self-check exercise deliberately submits a forbidden rook move to the real engine.
    if (task.kind === 'reject') return {pieceId:mover.id,target,chosenType:R};
    throw new Error('TUTORIAL_MOVE_NOT_PLAYABLE');
}
export function unresolvedAttackers(state: GameState) {
    return state.pieces.filter(piece => piece.alive && piece.owner === 'white' && !piece.promotedType &&
        (piece.state & (R|Q)) === (R|Q));
}
export type TutorialAttempt = {
    state: GameState;
    accepted: boolean;
    feedback: 'correct'|'rejectedAsExpected'|'illegal'|'different'|'tryMate';
};
export function attemptTutorialMove(state: GameState, task: TutorialTask, move: Move): TutorialAttempt {
    const mover = state.pieces.find(piece => piece.id === move.pieceId);
    const matches = !!mover && tutorialSquare(mover.position) === task.from && tutorialSquare(move.target) === task.to &&
        (task.chosenType === undefined || task.chosenType === move.chosenType) &&
        task.promotionTarget === move.promotionTarget;
    let next: GameState;
    try { next = applyPracticeMove(state, move); }
    catch { return {state,accepted:task.kind === 'reject' && matches,
        feedback:task.kind === 'reject' && matches ? 'rejectedAsExpected' : 'illegal'}; }
    if (task.kind === 'mate') {
        const accepted = next.winner === 'white' && isCheckmate('black',next) && unresolvedAttackers(next).length >= 2;
        return {state:accepted ? next : state,accepted,feedback:accepted ? 'correct' : 'tryMate'};
    }
    const accepted = task.kind === 'move' && matches;
    return {state:accepted ? next : state,accepted,feedback:accepted ? 'correct' : 'different'};
}
