'use client';
import React from 'react';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { DAILY_LOGIN_REWARDS_ENABLED } from '../lib/dailyLoginRewards';
import { MEMBER_TICKET_USAGE_ENABLED } from '../lib/stripeMembership';
import { currentTermsEffective } from '../config/currentTerms';
import { currentAccountTermsStatus, acceptCurrentAccountTerms, CURRENT_TERMS_ACCEPTED_EVENT } from '../lib/currentAccountTerms';
import { TermsDocument } from './TermsDocument';
import { termsText } from '../locales/termsText';

/** Optional claim consent. General play, support, deletion and billing remain reachable. */
export function CurrentTermsConsentPanel({ user, lang }: { user: User; lang: Language }) {
    const { allowed, revision } = useCircuitAccess(user);
    const [status, setStatus] = React.useState<'loading'|'needed'|'accepted'|'error'>('loading');
    const [checked, setChecked] = React.useState(false), [busy, setBusy] = React.useState(false), [retry, setRetry] = React.useState(0);
    const request = React.useRef<AbortController | null>(null);
    const enabled = (DAILY_LOGIN_REWARDS_ENABLED || MEMBER_TICKET_USAGE_ENABLED) && currentTermsEffective()
        && allowed && user.type === 'registered';
    React.useEffect(() => {
        setChecked(false); setBusy(false); setStatus('loading');
        if (!enabled) return;
        const controller = new AbortController(); request.current = controller;
        const accepted = (event: Event) => {
            if ((event as CustomEvent<{ userId: string }>).detail?.userId === user.id) setStatus('accepted');
        };
        window.addEventListener(CURRENT_TERMS_ACCEPTED_EVENT, accepted);
        void currentAccountTermsStatus(user.id, controller.signal).then(value => {
            if (!controller.signal.aborted) setStatus(value.accepted ? 'accepted' : value.effective ? 'needed' : 'error');
        }).catch(() => { if (!controller.signal.aborted) setStatus('error'); });
        return () => { controller.abort(); window.removeEventListener(CURRENT_TERMS_ACCEPTED_EVENT, accepted); };
    }, [enabled, revision, user.id, retry]);
    if (!enabled || status === 'accepted') return null;
    const ja = lang === 'ja';
    const copy = termsText(lang);
    const accept = async () => {
        const controller = request.current;
        if (!controller || controller.signal.aborted || !checked || busy || status !== 'needed') return;
        setBusy(true);
        try { await acceptCurrentAccountTerms(user.id, controller.signal); if (!controller.signal.aborted) setStatus('accepted'); }
        catch { if (!controller.signal.aborted) setStatus('error'); }
        finally { if (!controller.signal.aborted) setBusy(false); }
    };
    return <section className="reward-consent space-y-3 text-sm" data-current-terms-consent>
        <h4>{ja ? '無料券を受け取る前に' : copy[0]}</h4>
        {status === 'needed' ? <>
            <details><summary className="min-h-11 cursor-pointer underline">{ja ? '改定規約の全文を読む' : copy[0]}</summary><p>{copy[7]}</p><TermsDocument initialLanguage={lang}/></details>
            <label className="flex min-h-11 items-start gap-3 leading-relaxed"><input type="checkbox" checked={checked} disabled={busy} onChange={e => setChecked(e.target.checked)} className="mt-1 h-5 w-5 shrink-0"/>
                {ja ? '改定規約の全文を確認し、同意します。' : copy[1]}</label>
            <button type="button" disabled={!checked || busy} onClick={() => void accept()} className="min-h-11 border px-4 disabled:opacity-40">{ja ? '同意して券を受け取る' : copy[2]}</button>
        </> : <p role="status">{status === 'loading' ? copy[4] : copy[5]}</p>}
        {status === 'error' && <button type="button" className="min-h-11 underline" onClick={() => setRetry(n => n + 1)}>{copy[6]}</button>}
    </section>;
}
