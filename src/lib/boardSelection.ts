import type { Token } from './GameEngine';

/** A position update may invalidate a selection, but an opponent reply alone does not. */
export function selectionAfterBoardUpdate(
    selectedId: string | null,
    tokens: readonly Pick<Token, 'id' | 'player' | 'isCaptured'>[],
    playerSide: 'white' | 'black',
    clear = false,
): string | null {
    if (clear || !selectedId) return null;
    return tokens.some(token => token.id === selectedId && token.player === playerSide && !token.isCaptured)
        ? selectedId : null;
}
