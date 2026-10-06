'use client';
import { CURRENT_TERMS_ACCEPTED_EVENT } from '../lib/currentAccountTerms';
import React, { useEffect } from 'react';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { circuitAccess } from '../lib/circuitAccess';
import { dailyLoginText } from '../locales/dailyLoginText';
import { ticketWalletText } from '../locales/ticketWalletText';
import { rewardsHubText } from '../locales/rewardsHubText';
import { commerceStatusText } from '../locales/commerceStatusText';
import { CommerceEntitlements } from './CommerceEntitlements';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT } from '../lib/dailyLoginRewards';
import { MEMBER_TICKET_USAGE_ENABLED, readMemberTicketStatus, claimMemberTickets, type StripeMembershipStatus } from '../lib/stripeMembership';

const MEMBER_TICKETS_CHANGED = 'qg-member-tickets-changed';

/** Entitlement use only, including Android. Contains no purchase/portal/price/link. */
export function MemberTicketsPanel({ user, lang }: { user: User; lang: Language }) {
    const { allowed, revision } = useCircuitAccess(user);
    const [loaded, setLoaded] = React.useState<{ revision: number; userId: string; status: StripeMembershipStatus } | null>(null);
    const [failed, setFailed] = React.useState<number | null>(null);
    useEffect(() => {
        if (!MEMBER_TICKET_USAGE_ENABLED || !allowed || user.type !== 'registered') return;
        let controller: AbortController | null = null;
        const refresh = () => {
            controller?.abort(); controller = new AbortController();
            const request = controller;
            void readMemberTicketStatus(user.id, request.signal)
                .then(status => { if (!request.signal.aborted) { setLoaded({ revision, userId: user.id, status }); setFailed(null); } })
                .catch(() => { if (!request.signal.aborted) { setLoaded(null); setFailed(revision); } });
        };
        const changed = (event: Event) => { if ((event as CustomEvent<{userId: string}>).detail?.userId === user.id) refresh(); };
        window.addEventListener(MEMBER_TICKETS_CHANGED, changed);
        window.addEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT, changed); refresh();
        return () => {
            controller?.abort(); window.removeEventListener(MEMBER_TICKETS_CHANGED, changed);
            window.removeEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT, changed);
        };
    }, [allowed, revision, user.id, user.type]);
    if (!MEMBER_TICKET_USAGE_ENABLED || !allowed || user.type !== 'registered') return null;
    const status = loaded?.revision === revision && loaded.userId === user.id && loaded.status.userId === user.id ? loaded.status : null;
    const wallet = ticketWalletText(lang), text = dailyLoginText(lang), hub = rewardsHubText(lang);
    const hasCommerce = !!status?.commerce && (status.commerce.active || status.commerce.balances.purchased > 0 || status.commerce.balances.subscription > 0);
    const title = hasCommerce ? commerceStatusText(lang).title : wallet.member;
    // An account with no entitlement sees no offer or purchase invitation.
    if (status && !status.active && !hasCommerce) return null;
    return <section aria-label={title} className="reward-card text-sm" data-member-ticket-usage>
        <h4 className="reward-title">{title}</h4>
        {failed === revision ? <p role="status">{text.unavailable}</p> : !status ? <p role="status">{text.loading}</p> : <>
            {status.commerce && <CommerceEntitlements status={status.commerce} lang={lang} />}
            {status.active && <div data-legacy-member-tickets>
            {hasCommerce && <h5 className="reward-title">{commerceStatusText(lang).legacy}</h5>}
            <dl className="reward-balances">
                <div className="reward-balance"><dt>{text.rankedTickets}</dt><dd>{status.tickets.ranked}</dd></div>
                <div className="reward-balance"><dt>{text.hintTickets} · CPU</dt><dd>{status.tickets.hint}</dd></div>
            </dl>
            <details className="reward-details"><summary>{hub.rules}</summary><div className="reward-details__body">
                <p>{text.lastClaimUtcDay}: {status.lastGrantUtcDay ?? text.notClaimed}</p><p>{wallet.expiry}</p>
            </div></details>
            </div>}
        </>}
    </section>;
}

/** A separate pool and endpoint. Never depends on new Checkout being open. */
export function MemberTicketClaimController({ user, termsReady }: { user: User | null; termsReady: boolean }) {
    const { allowed, revision } = useCircuitAccess(user);
    useEffect(() => {
        if (!MEMBER_TICKET_USAGE_ENABLED || !allowed || !termsReady || user?.type !== 'registered') return;
        let controller: AbortController | null = null;
        let timer: ReturnType<typeof setTimeout>;
        const claim = () => {
            controller?.abort(); controller = new AbortController(); const request = controller;
            if (circuitAccess.canPlay(user)) void claimMemberTickets(user.id, request.signal).then(() => {
                if (!request.signal.aborted && circuitAccess.canPlay(user)) window.dispatchEvent(new CustomEvent(MEMBER_TICKETS_CHANGED, { detail: { userId: user.id } }));
            }).catch(() => { /* No client credit; the next verified attempt can retry. */ });
            const now = Date.now(); timer = setTimeout(claim, 86_400_000 - now % 86_400_000 + 100);
        };
        const accepted = (event: Event) => { if ((event as CustomEvent<{userId: string}>).detail?.userId === user.id) { clearTimeout(timer); claim(); } };
        window.addEventListener(CURRENT_TERMS_ACCEPTED_EVENT, accepted);
        claim();
        return () => { controller?.abort(); clearTimeout(timer); window.removeEventListener(CURRENT_TERMS_ACCEPTED_EVENT, accepted); };
    }, [allowed, revision, termsReady, user?.id, user?.type]);
    return null;
}
