'use client';

import React from 'react';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { dailyLoginText } from '../locales/dailyLoginText';
import { ticketWalletText } from '../locales/ticketWalletText';
import { dailyRewardPreview } from '../lib/dailyRewardPreview';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT, DAILY_LOGIN_REWARDS_ENABLED, readDailyLoginStatus, type DailyLoginStatus } from '../lib/dailyLoginRewards';

/** Account-only balance display; the login controller owns the silent claim. */
export function DailyLoginRewardsPanel({ user, lang }: { user: User; lang: Language }) {
    const { allowed, revision } = useCircuitAccess(user);
    const [loaded, setLoaded] = React.useState<{ revision: number; status: DailyLoginStatus } | null>(null);
    const [failedRevision, setFailedRevision] = React.useState<number | null>(null);
    const [disabledRevision, setDisabledRevision] = React.useState<number | null>(null);

    React.useEffect(() => {
        if (!DAILY_LOGIN_REWARDS_ENABLED || !allowed || user.type !== 'registered') return;
        let controller: AbortController | null = null;
        const refresh = () => {
            controller?.abort();
            controller = new AbortController();
            const request = controller;
            setLoaded(null);
            setFailedRevision(null);
            setDisabledRevision(null);
            void readDailyLoginStatus(user.id, request.signal)
                .then(status => { if (!request.signal.aborted) setLoaded({ revision, status }); })
                .catch(error => { if (!request.signal.aborted) {
                    if (error?.code === 'DISABLED') setDisabledRevision(revision);
                    else setFailedRevision(revision);
                } });
        };
        const onClaim = (event: Event) => {
            if ((event as CustomEvent<{ userId?: string }>).detail?.userId === user.id) refresh();
        };
        let timer: ReturnType<typeof setTimeout>;
        const schedule = () => {
            const now = Date.now(); timer = setTimeout(() => { refresh(); schedule(); }, 86_400_000 - now % 86_400_000 + 100);
        };
        window.addEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT, onClaim);
        refresh(); schedule();
        return () => { clearTimeout(timer); window.removeEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT, onClaim); controller?.abort(); };
    }, [allowed, revision, user.id, user.type]);

    if (!DAILY_LOGIN_REWARDS_ENABLED || !allowed || user.type !== 'registered' || disabledRevision === revision) return null;
    const text = dailyLoginText(lang);
    const wallet = ticketWalletText(lang);
    const status = loaded?.revision === revision && loaded.status.userId === user.id ? loaded.status : null;
    const preview = status ? dailyRewardPreview(status) : null;
    return <section aria-label={text.title} className="border-t border-[#A89C86]/20 pt-4">
        <h4 className="text-sm font-semibold text-[#D4B872]">{text.title}</h4>
        {failedRevision === revision || status?.enabled === false
            ? <p role="status" className="mt-2 text-sm text-[#A89C86]">{text.unavailable}</p>
            : !status
                ? <p role="status" className="mt-2 text-sm text-[#A89C86]">{text.loading}</p>
                : <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
                    <dt>{wallet.free} · {text.rankedTickets}</dt><dd className="text-right font-mono">{status.tickets.ranked} / 20</dd>
                    <dt>{wallet.free} · {text.hintTickets}</dt><dd className="text-right font-mono">{status.tickets.hint} / 20</dd>
                    <dt>{text.streakDays}</dt><dd className="text-right font-mono">{status.streakDays}</dd>
                    <dt>{text.lastClaimUtcDay}</dt><dd className="text-right font-mono">{status.lastClaimUtcDay ?? text.notClaimed}</dd>
                </dl>}
        {preview && <div className="mt-3 space-y-2 text-xs leading-relaxed text-[#A89C86]">
            {preview.claimedToday && <p>{wallet.claimed}</p>}
            <p>{wallet.next}: <time dateTime={preview.day}>{preview.day}</time> · {text.streakDays}: {preview.streakDays}/7</p>
            <p>{text.rankedTickets}: +{preview.credit.ranked} · {text.hintTickets}: +{preview.credit.hint}</p>
            <p>{wallet.cap}</p><p>{wallet.streak}</p>
        </div>}
        <p className="mt-3 text-xs leading-relaxed text-[#A89C86]">{wallet.rule}</p>
    </section>;
}
