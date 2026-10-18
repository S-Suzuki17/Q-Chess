import { Capacitor, registerPlugin } from '@capacitor/core';
import { ANDROID_BUILD } from '../config/appPlatform';
import type { TimeControl } from '../types/game';

export type GameStatsResult = 'buffered' | 'duplicate' | 'pending' | 'disabled' | 'unauthenticated' | 'unavailable';
export interface MatchStats {
    /** Local deduplication only: never included in a Google event. */
    matchKey: string;
    mode: 'practice' | 'campaign' | 'private' | 'random' | 'ranked';
    timeControl: TimeControl;
    result: 'win' | 'loss' | 'draw';
    playerMoves: number;
    captures: number;
    checkmate: boolean;
}
interface StatsBridge {
    recordMatch(stats: MatchStats): Promise<{ status: GameStatsResult }>;
    recordProgress(stats: { currentProgress: number }): Promise<{ status: GameStatsResult }>;
}
const bridge = registerPlugin<StatsBridge>('PlayGameStats');
export const gameStatsAvailable = () => ANDROID_BUILD && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** Parallel React effects share a call; native player-scoped storage also covers reconnects. */
export function createGameStatsReporter(plugin: StatsBridge, enabled: () => boolean) {
    const pending = new Map<string, Promise<GameStatsResult>>();
    let progressQueue: Promise<GameStatsResult> = Promise.resolve('disabled');
    return {
        async match(stats: MatchStats): Promise<GameStatsResult> {
            if (!enabled()) return 'disabled';
            if (typeof stats.matchKey !== 'string' || !stats.matchKey || stats.matchKey.length > 200 || !['practice','campaign','private','random','ranked'].includes(stats.mode)
                || !['10s','3m','10m'].includes(stats.timeControl) || !['win','loss','draw'].includes(stats.result)
                || !Number.isSafeInteger(stats.playerMoves) || stats.playerMoves < 1 || stats.playerMoves > 10000
                || !Number.isSafeInteger(stats.captures) || stats.captures < 0 || stats.captures > 16 || typeof stats.checkmate !== 'boolean') return 'unavailable';
            const existing = pending.get(stats.matchKey);
            if (existing) return existing;
            // Build an allowlisted object even when a JS caller provides extra fields.
            const { matchKey, mode, timeControl, result, playerMoves, captures, checkmate } = stats;
            const task = Promise.resolve().then(() => plugin.recordMatch({ matchKey, mode, timeControl, result, playerMoves, captures, checkmate }))
                // Persistent deduplication belongs to native code, scoped to the active Play player.
                .then(({ status }) => status).catch((): GameStatsResult => 'unavailable').finally(() => pending.delete(matchKey));
            pending.set(matchKey, task);
            return task;
        },
        async progress(currentProgress: number): Promise<GameStatsResult> {
            if (!enabled()) return 'disabled';
            if (!Number.isSafeInteger(currentProgress) || currentProgress < 0 || currentProgress > 300) return 'unavailable';
            // Preserve load/change ordering even when authentication is slow.
            progressQueue = progressQueue.then(() => plugin.recordProgress({ currentProgress }))
                .then(({ status }) => status).catch((): GameStatsResult => 'unavailable');
            return progressQueue;
        },
    };
}

export const playGameStats = createGameStatsReporter(bridge, gameStatsAvailable);
