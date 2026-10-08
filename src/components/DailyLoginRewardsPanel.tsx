'use client';
import { QubeTeacher } from './QubeTeacher';
import { hintScopeText } from '../locales/hintScopeText';

import React from 'react';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { dailyLoginText } from '../locales/dailyLoginText';
import { ticketWalletText } from '../locales/ticketWalletText';
import { useSocket } from '../lib/SocketContext';
import { rewardsHubText } from '../locales/rewardsHubText';
import { dailyRewardPreview } from '../lib/dailyRewardPreview';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT, DAILY_LOGIN_REWARDS_ENABLED, readDailyLoginStatus, type DailyLoginStatus } from '../lib/dailyLoginRewards';

/** Read-only wallet display; the login controller owns the silent claim. */
export function DailyLoginRewardsPanel({ user, lang }: { user: User; lang: Language }) {
    const { sharedAdmissionEnabled } = useSocket();
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
    const wallet = ticketWalletText(lang, sharedAdmissionEnabled === true);
    const hub = rewardsHubText(lang);
    const status = loaded?.revision === revision && loaded.status.userId === user.id ? loaded.status : null;
    const preview = status ? dailyRewardPreview(status) : null;
    return <section aria-label={text.title} className="reward-card">
        <h4 className="reward-title">{hub.balance}</h4>
        <QubeTeacher lang={lang} variant="compact">{typeof sharedAdmissionEnabled==='boolean'&&<p className="reward-caption mt-2">{wallet.rule}</p>}<p>{hintScopeText(lang)}</p></QubeTeacher>
        {failedRevision === revision || status?.enabled === false
            ? <p role="status" className="mt-2 text-sm text-[#A89C86]">{text.unavailable}</p>
            : !status
                ? <p role="status" className="mt-2 text-sm text-[#A89C86]">{text.loading}</p>
                : <dl className="reward-balances">
                    <div className="reward-balance"><dt>{text.rankedTickets}</dt><dd>{status.tickets.ranked}{status.rewardPolicyVersion !== 2 && <small>{hub.limit} 20</small>}</dd></div>
                    <div className="reward-balance"><dt>{text.hintTickets}</dt><dd>{status.tickets.hint}{status.rewardPolicyVersion !== 2 && <small>{hub.limit} 20</small>}</dd></div>
                </dl>}
        {status?.enabled && preview && <div className="reward-next">
            {preview.claimedToday && <p className="reward-caption">✓ {wallet.claimed}</p>}
            <p className="reward-title">{preview.claimedToday ? wallet.next : hub.today}</p>
            <p className="reward-caption"><time dateTime={preview.day}>{preview.day}</time> · UTC · {text.streakDays} {preview.streakDays}/7</p>
            <ol className="reward-streak" aria-label={text.streakDays}>
                {[1,2,3,4,5,6,7].map(day => <li key={day} data-next={day === preview.streakDays} aria-current={day === preview.streakDays ? 'step' : undefined}>{day}</li>)}
            </ol>
            <div className="reward-next__amounts"><span>{text.rankedTickets} +{preview.credit.ranked}</span><span>{text.hintTickets} +{preview.credit.hint}</span></div>
            {preview.credit.ranked === 0 && preview.credit.hint === 0 && <p>{status.rewardPolicyVersion === 2 ? text.unavailable : hub.full}</p>}
            {!preview.claimedToday && <p className="reward-caption">{hub.automatic}</p>}
        </div>}
        <details className="reward-details"><summary>{hub.rules}</summary><QubeTeacher lang={lang} variant="compact" className="reward-details__body">
            <p>{status?.rewardPolicyVersion === 2 ? (lang === 'ja' ? 'UTC日付ごとの7日周期。ランク戦券は1・1・2・2・3・3・3枚、7日目にヒント1枚。8日目は1日目に戻り、受け取らない日があると1日目から再開します。' : 'Seven UTC-day cycle: 1, 1, 2, 2, 3, 3, 3 ranked tickets, plus one hint on day 7. Day 8 returns to day 1. A missed day resets the cycle.') : wallet.streak}</p>
            {status && <p>{text.lastClaimUtcDay}: {status.lastClaimUtcDay ?? text.notClaimed}</p>}
        </QubeTeacher></details>
    </section>;
}
