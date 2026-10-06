'use client';

import React from 'react';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { dailyLoginText } from '../locales/dailyLoginText';
import { ticketWalletText } from '../locales/ticketWalletText';
import { rewardsHubText } from '../locales/rewardsHubText';
import { dailyRewardPreview } from '../lib/dailyRewardPreview';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT, DAILY_LOGIN_REWARDS_ENABLED, readDailyLoginStatus, type DailyLoginStatus } from '../lib/dailyLoginRewards';

/** Read-only wallet display; the login controller owns the silent claim. */
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
    const hub = rewardsHubText(lang);
    const status = loaded?.revision === revision && loaded.status.userId === user.id ? loaded.status : null;
    const preview = status ? dailyRewardPreview(status) : null;
    return <section aria-label={text.title} className="reward-card">
        <h4 className="reward-title">{hub.balance}</h4>
        <p className="reward-caption mt-2">{wallet.rule}</p>
        {failedRevision === revision || status?.enabled === false
            ? <p role="status" className="mt-2 text-sm text-[#A89C86]">{text.unavailable}</p>
            : !status
                ? <p role="status" className="mt-2 text-sm text-[#A89C86]">{text.loading}</p>
                : <dl className="reward-balances">
                    <div className="reward-balance"><dt>{text.rankedTickets}</dt><dd>{status.tickets.ranked}<small>No Limit</small></dd></div>
                    <div className="reward-balance"><dt>{text.hintTickets} · CPU</dt><dd>{status.tickets.hint}<small>No Limit</small></dd></div>
                </dl>}
        {status?.enabled && preview && <div className="mt-4 border border-[#B39A62]/30 rounded-lg p-4 bg-[#1A1814]">
            <div className="flex justify-between items-center mb-3">
                <p className="font-bold text-[#E8E2D7]">{preview.claimedToday ? wallet.next : hub.today}</p>
                <p className="text-xs text-[#A89C86]"><time dateTime={preview.day}>{preview.day}</time> UTC</p>
            </div>
            {preview.claimedToday && <p className="text-sm text-[#D4B872] font-bold mb-2">✓ {wallet.claimed}</p>}
            
            <p className="text-sm text-[#E8E2D7] mb-2">{lang === 'ja' ? '連続ログインボーナス (毎日UTC 0時にリセット)' : '7-Day Login Bonus (Resets at 00:00 UTC)'}</p>
            
            <div className="grid grid-cols-7 gap-1 mb-3">
                {[
                    { day: 1, text: "1 Ticket" },
                    { day: 2, text: "1 Ticket" },
                    { day: 3, text: "2 Tickets" },
                    { day: 4, text: "2 Tickets" },
                    { day: 5, text: "3 Tickets" },
                    { day: 6, text: "3 Tickets" },
                    { day: 7, text: "3+1 Hint" }
                ].map(item => {
                    const isPast = item.day < preview.streakDays || (preview.claimedToday && item.day <= status.streakDays);
                    const isCurrent = item.day === preview.streakDays && !preview.claimedToday;
                    return (
                        <div key={item.day} className={`flex flex-col items-center justify-center rounded p-1 text-center border transition-colors ${isPast ? 'bg-[#D4B872]/20 border-[#D4B872]/50 text-[#E8E2D7]' : isCurrent ? 'bg-[#B39A62]/40 border-[#D4B872] text-[#E8E2D7] shadow-[0_0_10px_rgba(212,184,114,0.3)]' : 'bg-transparent border-[#B39A62]/20 text-[#A89C86]'}`}>
                            <span className="text-[10px] font-bold mb-0.5">Day {item.day}</span>
                            {item.day === 7 ? <span className="text-[14px]">🎁</span> : <span className="text-[10px] leading-tight">{item.text.replace(' Tickets', '').replace(' Ticket', 'T')}</span>}
                            {isPast && <span className="absolute text-[#D4B872] font-bold">✓</span>}
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between items-center bg-[#D4B872]/10 border border-[#D4B872]/20 rounded p-2 text-sm">
                <span className="text-[#A89C86]">{lang === 'ja' ? '次回の報酬:' : 'Next Reward:'}</span>
                <span className="font-bold text-[#D4B872]">{text.rankedTickets} +{preview.credit.ranked} {preview.credit.hint > 0 && `| ${text.hintTickets} +${preview.credit.hint}`}</span>
            </div>
            {!preview.claimedToday && <p className="text-[10px] text-[#A89C86] mt-2 text-center">{hub.automatic}</p>}
        </div>}
        <details className="reward-details"><summary>{hub.rules}</summary><div className="reward-details__body">
            <p>{wallet.streak}</p>
            {status && <p>{text.lastClaimUtcDay}: {status.lastClaimUtcDay ?? text.notClaimed}</p>}
        </div></details>
    </section>;
}
