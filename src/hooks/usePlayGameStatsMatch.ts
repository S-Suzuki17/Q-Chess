import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { gameStatsAvailable, playGameStats, type MatchStats } from '../lib/playGameStats';

/** A failed/unauthenticated completion can retry while its result remains open. */
export function usePlayGameStatsMatch(stats: MatchStats | null) {
    const matchKey = stats?.matchKey, mode = stats?.mode, timeControl = stats?.timeControl, result = stats?.result;
    const playerMoves = stats?.playerMoves, captures = stats?.captures, checkmate = stats?.checkmate;
    useEffect(() => {
        if (!gameStatsAvailable() || !matchKey || !mode || !timeControl || !result
            || playerMoves === undefined || captures === undefined || checkmate === undefined) return;
        const payload = { matchKey, mode, timeControl, result, playerMoves, captures, checkmate };
        let active = true;
        const report = () => { if (active) void playGameStats.match(payload); };
        report();
        const listener = App.addListener('appStateChange', state => { if (state.isActive) report(); }).catch(() => null);
        return () => { active = false; void listener.then(handle => handle?.remove()).catch(() => {}); };
    }, [matchKey, mode, timeControl, result, playerMoves, captures, checkmate]);
}
