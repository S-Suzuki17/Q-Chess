export type PrivateRoomIntent = 'create' | 'join' | 'reconnect';
export type PrivateRoomRequest = { intent: 'create'; timeControl: number } | { intent: 'join' | 'reconnect' };

export function privateRoomRequestError(matchId: string, request: unknown): string | null {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(matchId) || !request || typeof request !== 'object' || Array.isArray(request)) return 'INVALID_ROOM';
    const value = request as Record<string, unknown>;
    if (!['create', 'join', 'reconnect'].includes(String(value.intent))) return 'INVALID_ROOM';
    if (value.intent === 'create' && ![10, 180, 600].includes(value.timeControl as number)) return 'INVALID_ROOM';
    return null;
}
