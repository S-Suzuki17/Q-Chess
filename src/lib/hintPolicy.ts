export type HintMode = 'practice' | 'tutorial' | 'ranked' | 'random' | 'private' | 'crown';
export type HintAccess = 'free' | 'ticket';

/** The original match mode determines the cost, including a CPU replacement. */
export function hintAccess(mode: HintMode): HintAccess {
    return mode === 'practice' || mode === 'tutorial' ? 'free' : 'ticket';
}

export function canRequestHint(context: {
    ready: boolean; finished: boolean; spectator: boolean;
    playerSide: 'white' | 'black'; currentTurn: 'white' | 'black';
}): boolean {
    return context.ready && !context.finished && !context.spectator && context.playerSide === context.currentTurn;
}
