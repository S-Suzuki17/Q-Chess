'use client';

import React from 'react';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { dailyLoginText } from '../locales/dailyLoginText';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT, DAILY_LOGIN_REWARDS_ENABLED, readDailyLoginStatus, type DailyLoginStatus } from '../lib/dailyLoginRewards';

/** Account-only balance display; the login controller owns the silent claim. */
export function DailyLoginRewardsPanel({ user, lang }: { user: User; lang: Language }) {
    const { allowed, revision } = useCircuitAccess(user);
    const [loaded, setLoaded] = React.useState<{ revision: number; status: DailyLoginStatus } | null>(null);
    const [failedRevision, setFailedRevision] = React.useState<number | null>(null);

    React.useEffect(() => {
        if (!DAILY_LOGIN_REWARDS_ENABLED || !allowed) return;
        let controller: AbortController | null = null;
        const refresh = () => {
            controller?.abort();
            controller = new AbortController();
            const request = controller;
            setLoaded(null);
            setFailedRevision(null);
            void readDailyLoginStatus(user.id, request.signal)
                .then(status => { if (!request.signal.aborted) setLoaded({ revision, status }); })
                .catch(() => { if (!request.signal.aborted) setFailedRevision(revision); });
        };
        const onClaim = (event: Event) => {
            if ((event as CustomEvent<{ userId?: string }>).detail?.userId === user.id) refresh();
        };
        window.addEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT, onClaim);
        refresh();
        return () => { window.removeEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT, onClaim); controller?.abort(); };
    }, [allowed, revision, user.id]);

    if (!DAILY_LOGIN_REWARDS_ENABLED || !allowed || user.type !== 'registered') return null;
    const text = dailyLoginText(lang);
    const status = loaded?.revision === revision && loaded.status.userId === user.id ? loaded.status : null;
    return <section aria-label={text.title} className="border-t border-[#A89C86]/20 pt-4">
        <h4 className="text-sm font-semibold text-[#D4B872]">{text.title}</h4>
        {failedRevision === revision || status?.enabled === false
            ? <p role="status" className="mt-2 text-sm text-[#A89C86]">{text.unavailable}</p>
            : !status
                ? <p role="status" className="mt-2 text-sm text-[#A89C86]">{text.loading}</p>
                : <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
                    <dt>{text.rankedTickets}</dt><dd className="text-right font-mono">{status.tickets.ranked}</dd>
                    <dt>{text.hintTickets}</dt><dd className="text-right font-mono">{status.tickets.hint}</dd>
                    <dt>{text.streakDays}</dt><dd className="text-right font-mono">{status.streakDays}</dd>
                    <dt>{text.lastClaimUtcDay}</dt><dd className="text-right font-mono">{status.lastClaimUtcDay ?? text.notClaimed}</dd>
                </dl>}
    </section>;
}
