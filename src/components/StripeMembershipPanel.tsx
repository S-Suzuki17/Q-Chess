'use client';

import React from 'react';
import { Capacitor } from '@capacitor/core';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { useAppPlatform } from '../hooks/useAppPlatform';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { stripeMembershipText } from '../locales/stripeMembershipText';
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
    React.useEffect(() => setMounted(true), []);

    const visible = mounted && user.type === 'registered' && allowed &&
        stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform());
    React.useEffect(() => {
        if (!visible) return;
        const controller = new AbortController();
        void readStripeMembershipStatus(user.id, controller.signal)
            .then(status => { if (!controller.signal.aborted) setLoaded({ revision, status }); })
            .catch(() => { if (!controller.signal.aborted) setFailedRevision(revision); });
        return () => controller.abort();
    }, [visible, revision, user.id]);

    if (!visible) return null;
    const copy = stripeMembershipText(lang);
    const status = loaded?.revision === revision && loaded.status.userId === user.id ? loaded.status : null;

    const startCheckout = async () => {
        if (!STRIPE_WEB_CHECKOUT_ENABLED || preparing || status?.active || !stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform())) return;
        setPreparing(true);
        try {
            const url = await prepareStripeCheckout(user.id);
            if (stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform())) window.location.assign(url);
        } catch { setFailedRevision(revision); setPreparing(false); }
    };
    const openBilling = async () => {
        if (!STRIPE_WEB_PORTAL_ENABLED || preparing || !status?.canManageBilling
            || !stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform())) return;
        setPreparing(true);
        try {
            const url = await prepareStripeBillingPortal(user.id);
            if (stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform())) window.location.assign(url);
        } catch { setFailedRevision(revision); setPreparing(false); }
    };

    return <section aria-label={copy.title} className="border-t border-[#A89C86]/20 pt-4 text-sm">
        <h4 className="font-semibold text-[#D4B872]">{copy.title}</h4>
        {!STRIPE_WEB_CHECKOUT_ENABLED && !status?.active
            ? <p className="mt-2 font-mono text-[#E8E2D7]">{copy.planned}</p> : null}
        <p className="mt-1 text-[#D8D0C1]">{copy.benefits}</p>
        <p className="mt-2 text-xs leading-relaxed text-[#D8D0C1]">{copy.billingTerms}</p>
        <p className="mt-2 text-xs text-[#A89C86]">{copy.webOnly}</p>
        {failedRevision === revision
            ? <p role="status" className="mt-3 text-[#A89C86]">{copy.unavailable}</p>
            : !status
                ? <p role="status" className="mt-3 text-[#A89C86]">{copy.checking}</p>
                : <p role="status" className="mt-3 text-[#E8E2D7]">
                    {status.active ? copy.active : copy.inactive}
                    {status.active && status.periodEnd
                        ? ` · ${status.cancelAtPeriodEnd ? copy.scheduledEnd : copy.periodEnd}: ${status.periodEnd.slice(0, 10)}`
                        : ''}
                </p>}
        {STRIPE_WEB_CHECKOUT_ENABLED && status && !status.active && failedRevision !== revision
            ? <button type="button" disabled={preparing} onClick={() => void startCheckout()}
                className="mt-3 min-h-11 w-full border border-[#B39A62] px-4 py-2 text-[#E8E2D7] disabled:opacity-50">
                {preparing ? copy.preparing : copy.purchase}
            </button>
            : null}
        {STRIPE_WEB_PORTAL_ENABLED && status?.canManageBilling && failedRevision !== revision
            ? <button type="button" disabled={preparing} onClick={() => void openBilling()}
                className="mt-3 min-h-11 w-full border border-[#B39A62] px-4 py-2 text-[#E8E2D7] disabled:opacity-50">
                {preparing ? copy.managing : copy.manage}
            </button>
            : null}
    </section>;
}
