'use client';
import { useEffect, useState } from 'react';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { dailyLoginText } from '../locales/dailyLoginText';
import { rankedRecoveryText } from '../locales/rankedRecoveryText';
import { RANKED_REFUND_BALANCE_ENABLED, readRankedRefundBalance, type RankedRefundBalance } from '../lib/rankedRefundBalance';

type Loaded = { userId: string; revision: number; balance?: RankedRefundBalance; error?: 'DISABLED' | 'UNAVAILABLE' };

/** Existing, usable credits only. Available on Android with no billing entry points. */
export function RankedRefundBalancePanel({ user, lang }: { user: User; lang: Language }) {
    const { allowed, revision } = useCircuitAccess(user);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    useEffect(() => {
        if (!RANKED_REFUND_BALANCE_ENABLED || !allowed || user.type !== 'registered') return;
        let request: AbortController | null = null;
        let disabled = false;
        const refresh = () => {
            if (disabled) return;
            request?.abort();
            setLoaded(null); // Never retain an old paid balance while checking expiry/reversal.
            if (document.visibilityState === 'hidden') return;
            const controller = new AbortController(); request = controller;
            void readRankedRefundBalance(user.id, controller.signal).then(balance => {
                if (!controller.signal.aborted) setLoaded({ userId: user.id, revision, balance });
            }).catch(error => {
                if (controller.signal.aborted) return;
                disabled = error?.code === 'DISABLED';
                setLoaded({ userId: user.id, revision, error: disabled ? 'DISABLED' : 'UNAVAILABLE' });
            });
        };
        refresh();
        const timer = setInterval(refresh, 30_000);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => { request?.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    }, [allowed, revision, user.id, user.type]);
    const current = loaded?.userId === user.id && loaded.revision === revision ? loaded : null;
    if (!RANKED_REFUND_BALANCE_ENABLED || !allowed || user.type !== 'registered' || current?.error === 'DISABLED') return null;
    const copy = rankedRecoveryText(lang), common = dailyLoginText(lang);
    // Do not put a long empty recovery explanation ahead of the player's wallet.
    if (current?.balance && current.balance.freeRankedRefunds === 0 && current.balance.paidRankedRefunds === 0) return null;
    return <section aria-label={copy.refunds} className="border-t border-[#A89C86]/20 pt-4 text-sm" data-ranked-refund-balance>
        <h4 className="font-semibold text-[#D4B872]">{copy.refunds}</h4>
        {current?.error ? <p role="status" className="mt-2">{common.unavailable}</p> : !current?.balance ? <p role="status" className="mt-2">{common.loading}</p> :
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <dt>{copy.freeRefunds}</dt><dd className="text-right font-mono">{current.balance.freeRankedRefunds}</dd>
                <dt>{copy.paidRefunds}</dt><dd className="text-right font-mono">{current.balance.paidRankedRefunds}</dd>
            </dl>}
        <details className="reward-details"><summary>{copy.refunds}</summary><div className="reward-details__body">
            <p>{copy.refundPolicy}</p><p>{copy.paidPolicy}</p>
        </div></details>
    </section>;
}
