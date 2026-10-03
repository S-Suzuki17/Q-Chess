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
        const controller = new AbortController();
        void claimDailyLoginReward(user.id, controller.signal)
            .then(() => {
                if (!controller.signal.aborted && circuitAccess.canPlay(user)) {
                    window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT, {
                        detail: { userId: user.id },
                    }));
                }
            })
            .catch(() => { /* A failed request can be retried at the next verified login. */ });
        return () => controller.abort();
    }, [allowed, revision, termsReady, user?.id, user?.type]);

    return null;
}
