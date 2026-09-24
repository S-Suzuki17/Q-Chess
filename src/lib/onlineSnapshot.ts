type Snapshot = { matchId?: string; version?: number; lastAction?: { actionId?: string; action?: { type?: string } } | null };

/** Old room broadcasts and delayed packets must never replace the current board. */
export function acceptsOnlineSnapshot(roomId: string, previous: Snapshot | null, incoming: Snapshot | null): boolean {
    return !!incoming && incoming.matchId === roomId && Number.isSafeInteger(incoming.version)
        && incoming.version! >= 0
        && (!previous || previous.matchId !== roomId || incoming.version! >= previous.version!);
}

/** Initial connection, intro acknowledgements and retry snapshots are silent. */
export function isNewOnlineMove(previous: Snapshot | null, incoming: Snapshot): boolean {
    return !!previous && previous.matchId === incoming.matchId && incoming.version! > previous.version!
        && incoming.lastAction?.action?.type === 'MOVE' && !!incoming.lastAction.actionId
        && incoming.lastAction.actionId !== previous.lastAction?.actionId;
}
