import { describe, expect, it } from 'vitest';
import { selectionAfterBoardUpdate } from './boardSelection';

const own = { id: 'white_h2', player: 'white' as const, isCaptured: false };
const opponent = { id: 'black_e7', player: 'black' as const, isCaptured: false };

describe('selection across CPU and authoritative board updates', () => {
    it('retains a friendly selection made while a CPU response is pending', () => {
        expect(selectionAfterBoardUpdate(own.id, [own, opponent], 'white')).toBe(own.id);
        expect(selectionAfterBoardUpdate(opponent.id, [own, opponent], 'black')).toBe(opponent.id);
    });
    it('drops a selected piece that was captured or removed by the reply', () => {
        expect(selectionAfterBoardUpdate(own.id, [{...own, isCaptured:true}, opponent], 'white')).toBeNull();
        expect(selectionAfterBoardUpdate(own.id, [opponent], 'white')).toBeNull();
    });
    it('does not turn an inspected enemy into a movable selection', () => {
        expect(selectionAfterBoardUpdate(opponent.id, [own, opponent], 'white')).toBeNull();
        expect(selectionAfterBoardUpdate(null, [own, opponent], 'white')).toBeNull();
    });
    it('clears on the player submission or the end of a game', () => {
        expect(selectionAfterBoardUpdate(own.id, [own, opponent], 'white', true)).toBeNull();
    });
});
