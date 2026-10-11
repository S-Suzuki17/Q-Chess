import type { TimeControl } from '../types/game';
export interface ActiveOnlineMatchCache {
    userId?: string; roomId: string; role: 'white' | 'black'; matchMode: 'random' | 'private' | 'ranked';
    tc: TimeControl; opponentId?: string; timestamp: number;
}
/** A restore convenience, never authority for admission or a reason to stop play. */
export function rememberActiveOnlineMatch(value: ActiveOnlineMatchCache): boolean {
    try { window.localStorage.setItem('qg_active_online_match', JSON.stringify(value)); return true; }
    catch { return false; }
}
export function forgetActiveOnlineMatch(): boolean {
    try { window.localStorage.removeItem('qg_active_online_match'); return true; }
    catch { return false; }
}
