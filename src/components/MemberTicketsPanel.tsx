'use client';
import { CURRENT_TERMS_ACCEPTED_EVENT } from '../lib/currentAccountTerms';
import React, { useEffect } from 'react';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { circuitAccess } from '../lib/circuitAccess';
import { dailyLoginText } from '../locales/dailyLoginText';
import { ticketWalletText } from '../locales/ticketWalletText';
import { MEMBER_TICKET_CAP } from '../config/webCommerce';
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
        window.addEventListener(MEMBER_TICKETS_CHANGED, changed); refresh();
        return () => { controller?.abort(); window.removeEventListener(MEMBER_TICKETS_CHANGED, changed); };
    }, [allowed, revision, user.id, user.type]);
    if (!MEMBER_TICKET_USAGE_ENABLED || !allowed || user.type !== 'registered') return null;
    const status = loaded?.revision === revision && loaded.userId === user.id ? loaded.status : null;
    const wallet = ticketWalletText(lang), text = dailyLoginText(lang);
    // An account with no entitlement sees no offer or purchase invitation.
    if (status && !status.active) return null;
    return <section aria-label={wallet.member} className="border-t border-[#A89C86]/20 pt-4 text-sm" data-member-ticket-usage>
        <h4 className="font-semibold text-[#D4B872]">{wallet.member}</h4>
        {failed === revision ? <p role="status">{text.unavailable}</p> : !status ? <p role="status">{text.loading}</p> : <>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <dt>{text.rankedTickets}</dt><dd>{status.tickets.ranked} / {MEMBER_TICKET_CAP.ranked}</dd>
                <dt>{text.hintTickets}</dt><dd>{status.tickets.hint} / {MEMBER_TICKET_CAP.hint}</dd>
                <dt>{text.lastClaimUtcDay}</dt><dd>{status.lastGrantUtcDay ?? text.notClaimed}</dd>
            </dl>
            <p className="mt-2 text-xs leading-relaxed">{wallet.expiry}</p>
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
