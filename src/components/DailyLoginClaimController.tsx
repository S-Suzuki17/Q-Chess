'use client';

import { useEffect } from 'react';
import type { User } from '../types/game';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { circuitAccess } from '../lib/circuitAccess';
import {
    claimDailyLoginReward,
    DAILY_LOGIN_REWARD_CHANGED_EVENT,
    DAILY_LOGIN_REWARDS_ENABLED,
} from '../lib/dailyLoginRewards';

/** Silently attempts a claim after verified access and current terms consent. */
export function DailyLoginClaimController({ user, termsReady }: { user: User | null; termsReady: boolean }) {
    const { allowed, revision } = useCircuitAccess(user);

    useEffect(() => {
        if (!DAILY_LOGIN_REWARDS_ENABLED || !termsReady || !allowed || user?.type !== 'registered') return;
        let controller: AbortController | null = null;
        let timer: ReturnType<typeof setTimeout>;
        let lastAttemptDay = '';
        const claim = () => {
            const today = new Date().toISOString().slice(0, 10);
            if (today === lastAttemptDay || !circuitAccess.canPlay(user)) return;
            lastAttemptDay = today;
            controller?.abort(); controller = new AbortController();
            const request = controller;
            void claimDailyLoginReward(user.id, request.signal)
            .then(() => {
                if (!request.signal.aborted && circuitAccess.canPlay(user)) {
                    window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT, {
                        detail: { userId: user.id },
                    }));
                }
            })
            .catch(() => { /* A failed request can be retried at the next verified login. */ });
        };
        const schedule = () => {
            const now = Date.now(); timer = setTimeout(() => { claim(); schedule(); }, 86_400_000 - now % 86_400_000 + 100);
        };
        const resumed = () => { if (document.visibilityState === 'visible') claim(); };
        claim(); schedule();
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resumed);
        return () => {
            controller?.abort(); clearTimeout(timer);
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resumed);
        };
    }, [allowed, revision, termsReady, user?.id, user?.type]);

    return null;
}
