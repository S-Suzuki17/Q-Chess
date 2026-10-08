'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PaidHintClient, PaidHintError, type PaidHintContext, type HintReceipt } from '../lib/paidHints';
import { useMoveHint } from './useMoveHint';

export function useTicketHint(options: {
    userId?: string; context: PaidHintContext | null; revision: number; eligible: boolean;
    onDelivered?: () => void;
}) {
    const { userId, context, revision, eligible, onDelivered } = options;
    const scope = `${userId ?? 'guest'}:${context?.contextId ?? 'unavailable'}`;
    const key = `${scope}:${revision}:${eligible}`;
    const hint = useMoveHint(key);
    const routeId = context?.kind === 'match' ? context.matchId : context?.runId;
    const client = useMemo(() => {
        if (!userId || !context) return null;
        try { return new PaidHintClient(userId, context); } catch { return null; }
        // Only identity/contract changes replace the transport, not clock updates.
    }, [userId, context?.contextId, context?.kind, context?.mode, context?.rulesVersion, routeId]);
    const [error, setError] = useState<{ key: string; value: unknown } | null>(null);
    const [recovered, setRecovered] = useState<{ scope: string; receipt: HintReceipt } | null>(null);
    const [recovering, setRecovering] = useState<{ scope: string; signal: AbortSignal } | null>(null);
    const [, refreshAttempt] = useState(0);
    const busy = useRef<string | null>(null), recovery = useRef<AbortController | null>(null);
    const live = useRef({ key, scope, revision, eligible });
    useLayoutEffect(() => { live.current = { key, scope, revision, eligible }; }, [key, scope, revision, eligible]);
    const delivered = useRef(new Set<string>());
    useEffect(() => {
        delivered.current.clear();
        return () => { recovery.current?.abort(); };
    }, [scope]);
    const notify = (receipt: HintReceipt) => {
        if (live.current.scope !== scope || delivered.current.has(receipt.receiptId)) return;
        delivered.current.add(receipt.receiptId); onDelivered?.();
    };
    const request = async () => {
        if (!eligible || busy.current === scope) return;
        if (!client) { setError({ key, value: new PaidHintError('AUTH_REQUIRED') }); return; }
        busy.current = scope; setError(null); setRecovered(null);
        let receipt: HintReceipt | null = null;
        try {
            await hint.request(async signal => {
                try {
                    receipt = await client.buy(revision, signal);
                    return receipt.hint;
                } catch (value) {
                    if (!signal.aborted && live.current.key === key) setError({ key, value });
                    throw value;
                } finally { if (!signal.aborted) refreshAttempt(value => value + 1); }
            }, () => { if (receipt) notify(receipt); });
        } finally { if (busy.current === scope) busy.current = null; }
    };
    let savedAttempt: ReturnType<PaidHintClient['latestAttempt']> = null;
    try { savedAttempt = client?.latestAttempt() ?? null; } catch {}
    const recover = async () => {
        if (!client || busy.current === scope || !savedAttempt) return;
        busy.current = scope; setError(null);
        const controller = new AbortController(); recovery.current = controller;
        setRecovering({ scope, signal: controller.signal });
        try {
            const receipt = await client.recover(savedAttempt.revision, controller.signal, savedAttempt.contextId);
            if (controller.signal.aborted || live.current.scope !== scope) return;
            if (!receipt) { setError({ key: live.current.key, value: new PaidHintError('NO_SAVED_HINT') }); return; }
            setRecovered({ scope, receipt });
            if (live.current.eligible && receipt.contextId === context?.contextId && receipt.revision === live.current.revision) notify(receipt);
            if (live.current.key === key && eligible && receipt.contextId === context?.contextId && receipt.revision === revision) {
                await hint.request(async () => receipt.hint, () => notify(receipt));
            }
        } catch (value) {
            if (!controller.signal.aborted && live.current.scope === scope) setError({ key: live.current.key, value });
        } finally {
            if (busy.current === scope) busy.current = null;
            if (!controller.signal.aborted) setRecovering(null);
        }
    };
    const clear = () => { recovery.current?.abort(); setRecovering(null); hint.clear(); setRecovered(null); setError(null); };
    return { ...hint, request, recover, clear, pending: hint.pending || (recovering?.scope === scope && !recovering.signal.aborted),
        error: error?.key === key ? error.value : null, hasRecovery: savedAttempt !== null,
        recovered: recovered?.scope === scope && (!hint.hintMove || !eligible || recovered.receipt.contextId !== context?.contextId || recovered.receipt.revision !== revision) ? recovered.receipt : null };
}
