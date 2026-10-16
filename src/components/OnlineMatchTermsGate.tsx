'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { dict } from '../locales/dict';
import { currentAccountTermsStatus, acceptCurrentAccountTerms, hasLocalTermsConsent, setLocalTermsConsent } from '../lib/currentAccountTerms';
import { onlineMatchTermsText } from '../locales/onlineMatchTermsText';
import { TermsDocument } from './TermsDocument';

type Status = 'loading' | 'needed' | 'accepted' | 'error' | 'guest' | 'cancelled';
interface TermsRequest { identity: string; controller: AbortController; ready: boolean }

/** Queue owner mounts this inside its existing dialog, before any queue admission. */
export function OnlineMatchTermsGate({ user, lang, onReady, onCancel }: {
    user: User; lang: Language; onReady: () => void; onCancel: () => void;
}) {
    const identity = `${user.type}:${user.id}`;
    const currentIdentity = useRef(identity);
    const ready = useRef(onReady);
    const cancelled = useRef(onCancel);
    const request = useRef<TermsRequest | null>(null);
    const pendingAccept = useRef<AbortController | null>(null);
    const cancelledIdentity = useRef<string | null>(null);
    const hasLocalConsent = Boolean(user.type === 'registered' && typeof hasLocalTermsConsent === 'function' && hasLocalTermsConsent(user.id));
    const [state, setState] = useState<{ identity: string; status: Status }>(() => ({
        identity, status: user.type !== 'registered' ? 'guest' : hasLocalConsent ? 'accepted' : 'loading',
    }));
    const [boundRequest, setBoundRequest] = useState<TermsRequest | null>(null);
    const [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false);
    const [retry, setRetry] = useState(0);
    const copy = onlineMatchTermsText(lang);
    const active = (scope: TermsRequest) => request.current === scope
        && currentIdentity.current === scope.identity && !scope.controller.signal.aborted;
    const complete = (scope: TermsRequest) => {
        if (!active(scope) || scope.ready) return;
        scope.ready = true;
        setState({ identity: scope.identity, status: 'accepted' });
        ready.current();
    };

    // Update ownership at commit, before pending HTTP callbacks or passive effects.
    useLayoutEffect(() => {
        currentIdentity.current = identity; ready.current = onReady; cancelled.current = onCancel;
        if (request.current && request.current.identity !== identity) {
            request.current.controller.abort(); request.current = null; pendingAccept.current = null;
        }
    }, [identity, onReady, onCancel]);

    useEffect(() => {
        request.current?.controller.abort();
        request.current = null; pendingAccept.current = null; setBoundRequest(null);
        setChecked(false); setBusy(false);
        if (cancelledIdentity.current === identity) {
            setState({ identity, status: 'cancelled' });
            return;
        }
        cancelledIdentity.current = null;
        if (user.type !== 'registered') {
            setState({ identity, status: 'guest' });
            return;
        }
        if (typeof hasLocalTermsConsent === 'function' && hasLocalTermsConsent(user.id)) {
            setState({ identity, status: 'accepted' });
            ready.current();
            return;
        }
        const scope: TermsRequest = { identity, controller: new AbortController(), ready: false };
        request.current = scope; setBoundRequest(scope);
        setState({ identity, status: 'loading' });
        void currentAccountTermsStatus(user.id, scope.controller.signal).then(value => {
            if (!active(scope)) return;
            if (value.effective === true && value.accepted === true) {
                if (typeof setLocalTermsConsent === 'function') setLocalTermsConsent(user.id);
                complete(scope);
            }
            else setState({ identity, status: value.effective === true ? 'needed' : 'error' });
        }).catch(() => {
            if (active(scope)) setState({ identity, status: 'error' });
        });
        return () => {
            scope.controller.abort();
            if (request.current === scope) request.current = null;
            if (pendingAccept.current === scope.controller) pendingAccept.current = null;
        };
    }, [identity, user.id, user.type, retry]);

    const status = state.identity === identity ? state.status : user.type === 'registered' ? 'loading' : 'guest';
    const cancel = () => {
        if (currentIdentity.current !== identity || cancelledIdentity.current === identity) return;
        cancelledIdentity.current = identity;
        request.current?.controller.abort(); request.current = null; pendingAccept.current = null;
        setBoundRequest(null); setChecked(false); setBusy(false); setState({ identity, status: 'cancelled' });
        cancelled.current();
    };
    const checkAgain = () => {
        const scope = boundRequest;
        if (user.type !== 'registered' || status !== 'error' || busy || !scope || !active(scope)) return;
        scope.controller.abort(); request.current = null; setBoundRequest(null);
        setChecked(false); setState({ identity, status: 'loading' }); setRetry(value => value + 1);
    };
    const accept = async () => {
        const scope = boundRequest;
        if (user.type !== 'registered' || !checked || busy || status !== 'needed'
            || !scope || !active(scope) || scope.ready || pendingAccept.current) return;
        // This synchronous lock also rejects a second click before React rerenders.
        pendingAccept.current = scope.controller; setBusy(true);
        try {
            // The existing API validates current version/date and the saved server consent.
            await acceptCurrentAccountTerms(user.id, scope.controller.signal);
            if (typeof setLocalTermsConsent === 'function') setLocalTermsConsent(user.id);
            complete(scope);
        } catch {
            if (active(scope)) setState({ identity, status: 'error' });
        } finally {
            if (pendingAccept.current === scope.controller) pendingAccept.current = null;
            if (active(scope)) setBusy(false);
        }
    };

    if (status === 'accepted' || status === 'cancelled') return null;
    return <section data-online-match-terms data-online-match-terms-state={status}
        aria-busy={status === 'loading' || busy} className="min-w-0 max-w-full space-y-4 text-left text-[#E8E2D7]">
        <h2 className="break-words text-lg font-semibold">{copy.title}</h2>
        <p className="break-words text-sm leading-relaxed text-[#BEB6A8]">{copy.description}</p>
        {status === 'needed' && <>
            <details className="min-w-0 max-w-full rounded border border-[#A89C86]/40 p-3">
                <summary className="min-h-11 cursor-pointer break-words underline">{copy.document}</summary>
                <div className="mt-3 max-h-[45dvh] min-w-0 overflow-y-auto overscroll-contain [overflow-wrap:anywhere] pr-2 [&_select]:block [&_select]:ml-0 [&_select]:max-w-full">
                    <p className="mb-3 text-sm">{copy.documentLanguages}</p>
                    <TermsDocument initialLanguage={lang}/>
                </div>
            </details>
            <a href="/privacy/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{dict[lang].privacyPolicy}</a>
            <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                <input type="checkbox" data-online-match-terms-checkbox checked={checked} disabled={busy}
                    onChange={event => setChecked(event.target.checked)} className="mt-1 h-5 w-5 shrink-0"/>
                <span className="min-w-0 break-words">{copy.checkbox}</span>
            </label>
            <button type="button" data-online-match-terms-accept disabled={!checked || busy}
                onClick={() => void accept()} className="min-h-11 w-full break-words rounded bg-[#D4B872] px-4 py-3 font-semibold text-[#11100E] disabled:opacity-40">
                {busy ? copy.saving : copy.accept}
            </button>
        </>}
        {status === 'loading' && <p role="status" className="text-sm">{copy.checking}</p>}
        {status === 'guest' && <p role="alert" className="break-words text-sm">{copy.guest}</p>}
        {status === 'error' && <div role="alert" className="space-y-3 text-sm">
            <p className="break-words">{copy.error}</p>
            <button type="button" data-online-match-terms-retry onClick={checkAgain} className="min-h-11 w-full break-words rounded border border-[#A89C86]/40 px-4 py-3">{copy.retry}</button>
        </div>}
        <button type="button" data-online-match-terms-cancel onClick={cancel} className="min-h-11 w-full break-words rounded border border-[#A89C86]/40 px-4 py-3">{copy.cancel}</button>
    </section>;
}
