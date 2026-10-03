'use client';

import React from 'react';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { useAppPlatform } from '../hooks/useAppPlatform';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { circuitAccess } from '../lib/circuitAccess';
import { stripeMembershipText } from '../locales/stripeMembershipText';
import { ticketWalletText } from '../locales/ticketWalletText';
import { commerceText } from '../locales/commerceText';
import { webCommerceCheckoutReady, MEMBER_TICKET_CAP } from '../config/webCommerce';
import {
    STRIPE_WEB_CHECKOUT_ENABLED,
    STRIPE_WEB_PORTAL_ENABLED,
    prepareStripeCheckout,
    prepareStripeBillingPortal,
    readStripeMembershipStatus,
    stripeWebMembershipAllowed,
    type StripeMembershipStatus,
} from '../lib/stripeMembership';

/** Not rendered in current releases. Web-only, including the future checkout entry point. */
export function StripeMembershipPanel({ user, lang }: { user: User; lang: Language }) {
    const { webContent } = useAppPlatform();
    const { allowed, revision } = useCircuitAccess(user);
    const [mounted, setMounted] = React.useState(false);
    const [loaded, setLoaded] = React.useState<{ revision: number; status: StripeMembershipStatus } | null>(null);
    const [failedRevision, setFailedRevision] = React.useState<number | null>(null);
    const [preparing, setPreparing] = React.useState(false);
    const [acceptedPurchaseTerms, setAcceptedPurchaseTerms] = React.useState(false);
    const actionRequest = React.useRef<AbortController | null>(null);
    const [actionFailed, setActionFailed] = React.useState(false);
    React.useEffect(() => setMounted(true), []);
    React.useEffect(() => () => actionRequest.current?.abort(), [allowed, revision, user.id]);

    const visible = mounted && user.type === 'registered' && allowed &&
        stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform());
    React.useEffect(() => {
        if (!visible) return;
        setAcceptedPurchaseTerms(false);
        setPreparing(false); setActionFailed(false); actionRequest.current = null;
        setFailedRevision(null);
        const controller = new AbortController();
        void readStripeMembershipStatus(user.id, controller.signal)
            .then(status => { if (!controller.signal.aborted) setLoaded({ revision, status }); })
            .catch(() => { if (!controller.signal.aborted) setFailedRevision(revision); });
        return () => controller.abort();
    }, [visible, revision, user.id]);

    if (!visible) return null;
    const copy = stripeMembershipText(lang);
    const wallet = ticketWalletText(lang), commerce = commerceText(lang);
    const status = loaded?.revision === revision && loaded.status.userId === user.id ? loaded.status : null;

    const startCheckout = async () => {
        if (!STRIPE_WEB_CHECKOUT_ENABLED || !webCommerceCheckoutReady() || !acceptedPurchaseTerms || preparing || status?.active || !stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform())) return;
        if (actionRequest.current && !actionRequest.current.signal.aborted) return;
        const controller = new AbortController(); actionRequest.current = controller;
        setPreparing(true); setActionFailed(false);
        try {
            const url = await prepareStripeCheckout(user.id, controller.signal);
            if (!controller.signal.aborted && circuitAccess.canPlay(user) && stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform())) window.location.assign(url);
        } catch { if (!controller.signal.aborted) { setActionFailed(true); setPreparing(false); actionRequest.current = null; } }
    };
    const openBilling = async () => {
        if (!STRIPE_WEB_PORTAL_ENABLED || preparing || !status?.canManageBilling
            || !stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform())) return;
        if (actionRequest.current && !actionRequest.current.signal.aborted) return;
        const controller = new AbortController(); actionRequest.current = controller;
        setPreparing(true); setActionFailed(false);
        try {
            const url = await prepareStripeBillingPortal(user.id, controller.signal);
            if (!controller.signal.aborted && circuitAccess.canPlay(user) && stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform())) window.location.assign(url);
        } catch { if (!controller.signal.aborted) { setActionFailed(true); setPreparing(false); actionRequest.current = null; } }
    };

    return <section aria-label={copy.title} className="border-t border-[#A89C86]/20 pt-4 text-sm">
        <h4 className="font-semibold text-[#D4B872]">{copy.title}</h4>
        {!STRIPE_WEB_CHECKOUT_ENABLED && !status?.active
            ? <p className="mt-2 font-mono text-[#E8E2D7]">{copy.planned}</p> : null}
        <p className="mt-1 text-[#D8D0C1]">{copy.benefits}</p>
        <p className="mt-2 text-xs leading-relaxed text-[#D8D0C1]">{copy.billingTerms}</p>
        <p className="mt-2 text-xs leading-relaxed text-[#D8D0C1]">{wallet.expiry} {copy.legalRights}</p>
        <p className="mt-2 text-xs text-[#A89C86]">{copy.webOnly}</p>
        {actionFailed && <p role="status" className="mt-3 text-[#A89C86]">{copy.unavailable}</p>}
        {failedRevision === revision
            ? <p role="status" className="mt-3 text-[#A89C86]">{copy.unavailable}</p>
            : !status
                ? <p role="status" className="mt-3 text-[#A89C86]">{copy.checking}</p>
                : <p role="status" className="mt-3 text-[#E8E2D7]">
                    {status.active ? copy.active : copy.inactive}
                    {status.active && status.periodEnd
                        ? ` · ${status.cancelAtPeriodEnd ? copy.scheduledEnd : copy.periodEnd}: ${new Date(status.periodEnd).toISOString().slice(0, 10)} UTC`
                        : ''}
                </p>}
        {STRIPE_WEB_CHECKOUT_ENABLED && webCommerceCheckoutReady() && status && !status.active && failedRevision !== revision
            ? <div className="mt-3 space-y-3" data-purchase-review>
                <p>{commerce.start}</p><p>{commerce.methods}</p>
                {MEMBER_TICKET_CAP && <p>{commerce.cap}: {MEMBER_TICKET_CAP.ranked} / {MEMBER_TICKET_CAP.hint}</p>}
                <Link href="/commerce/" className="mr-4 inline-block underline">{commerce.title}</Link>
                <Link href="/terms/" className="inline-block underline">{copy.terms}</Link>
                <label className="flex gap-3"><input type="checkbox" checked={acceptedPurchaseTerms} disabled={preparing}
                    onChange={event => setAcceptedPurchaseTerms(event.target.checked)} className="mt-1 h-5 w-5 shrink-0"/><span>{copy.confirmPurchase}</span></label>
                <button type="button" disabled={preparing || !acceptedPurchaseTerms} onClick={() => void startCheckout()}
                className="mt-3 min-h-11 w-full border border-[#B39A62] px-4 py-2 text-[#E8E2D7] disabled:opacity-50">
                {preparing ? copy.preparing : copy.purchase}
                </button>
            </div>
            : null}
        {STRIPE_WEB_PORTAL_ENABLED && status?.canManageBilling && failedRevision !== revision
            ? <button type="button" disabled={preparing} onClick={() => void openBilling()}
                className="mt-3 min-h-11 w-full border border-[#B39A62] px-4 py-2 text-[#E8E2D7] disabled:opacity-50">
                {preparing ? copy.managing : copy.manage}
            </button>
            : null}
    </section>;
}
