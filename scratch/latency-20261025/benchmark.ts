import {performance} from 'node:perf_hooks';
import {createInitialState} from '../../server/src/quantum-engine/initialState';
import {tutorialCourse, tutorialMoves} from '../../server/src/learning/tutorialCourse';
import {positionForDisplay, applyLocalMove} from '../../src/lib/localGame';
import {localMoveDestinations} from '../../src/lib/localMoveDestinations';
import {quantumToLegacyMove} from '../../src/quantum-engine/adapter';

const cases = [
    {name: 'initial-quantum', state: createInitialState()},
    ...['self-check', 'quantum-mate', 'checkmate', 'chess-castle'].map(id => {
        const lesson = tutorialCourse.find(item => item.id === id)!;
        return {name: id, state: lesson.create()};
    }),
];
const measure = (run: () => void) => {
    for (let i = 0; i < 5; i++) run();
    const samples: number[] = [];
    for (let i = 0; i < 80; i++) {
        const start = performance.now(); run(); samples.push(performance.now() - start);
    }
    samples.sort((a,b) => a-b);
    return {medianMs: samples[40], p95Ms: samples[76]};
};
const results = cases.map(({name,state}) => {
    const display = positionForDisplay(state);
    const pieces = state.pieces.filter(piece => piece.alive && piece.owner === state.sideToMove);
    const move = pieces.flatMap(piece => tutorialMoves(state, piece.id))[0];
    return {name, pieces: pieces.length,
        selectAllPieces: measure(() => {
            for (const piece of pieces) localMoveDestinations(display.tokens, display.pool, piece.id, []);
        }),
        move: move ? measure(() => applyLocalMove(display.tokens,display.pool,
            quantumToLegacyMove(move,state),state.sideToMove,[])) : null,
    };
});
console.log(JSON.stringify({node: process.version, results},null,2));
