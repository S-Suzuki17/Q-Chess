import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { parseSharedMatchChoiceRequired, type SharedMatchChoiceRequired, type SharedMatchChoiceSource } from '../../server/src/protocol/SharedMatchAdmission';

type ChoiceScope = { socket: Socket | null; matchId?: string };
type ChoiceSession = {
    scope: ChoiceScope;
    active: boolean;
    closed: boolean;
    submitted: boolean;
    offer: SharedMatchChoiceRequired | null;
    error: boolean;
};
type ChoiceView = { scope: ChoiceScope; offer: SharedMatchChoiceRequired | null; pending: boolean; error: boolean };

export function useSharedMatchChoice(socket: Socket | null, matchId?: string) {
    // A different match or account/socket must never inherit another choice's UI.
    const scope = useMemo(() => ({ socket, matchId }), [socket, matchId]);
    const session = useRef<ChoiceSession | null>(null);
    const [view, setView] = useState<ChoiceView | null>(null);

    useEffect(() => {
        if (!socket || !matchId) return;
        const current: ChoiceSession = { scope, active: true, closed: false, submitted: false, offer: null, error: false };
        session.current = current;
        const isCurrent = () => session.current === current && current.active && !current.closed;
        const publish = () => setView({ scope, offer: current.offer, pending: current.submitted, error: current.error });
        const required = (data: unknown) => {
            if (!isCurrent() || !socket.connected) return;
            const next = parseSharedMatchChoiceRequired(data, matchId);
            if (!next) return;
            current.offer = next;
            publish();
        };
        const clear = (data: { matchId?: string }) => {
            if (!isCurrent() || data?.matchId !== matchId) return;
            current.closed = true;
            current.offer = null;
            current.submitted = false;
            current.error = false;
            publish();
        };
        const failed = (data: { matchId?: string }) => {
            if (!isCurrent() || data?.matchId !== matchId || !current.submitted) return;
            current.submitted = false;
            current.error = true;
            publish();
        };
        const disconnect = () => {
            if (!isCurrent()) return;
            // Reconnection needs a fresh server offer, never a replayed consent.
            current.offer = null;
            current.submitted = false;
            current.error = false;
            publish();
        };
        socket.on('match_admission_choice_required', required);
        socket.on('match_admission_choice_error', failed);
        socket.on('match_start', clear);
        socket.on('match_cancelled', clear);
        socket.on('disconnect', disconnect);
        return () => {
            current.active = false;
            socket.off('match_admission_choice_required', required);
            socket.off('match_admission_choice_error', failed);
            socket.off('match_start', clear);
            socket.off('match_cancelled', clear);
            socket.off('disconnect', disconnect);
            queueMicrotask(() => {
                // StrictMode and a replacement transport for this same match
                // must not cancel the newly active choice. Leaving the match
                // cancels only the old, still-connected transport.
                if (!current.closed && socket.connected && (!session.current?.active || session.current.scope.matchId !== matchId)) {
                    socket.emit('cancel_match_admission', { matchId });
                }
            });
        };
    }, [socket, matchId, scope]);

    const choose = useCallback((source: SharedMatchChoiceSource) => {
        const current = session.current;
        if (!current || current.scope !== scope || !current.active || current.closed || !socket?.connected
            || !current.offer || current.submitted || (source === 'verified_ad' && !current.offer.verifiedAdAvailable)) return;
        current.submitted = true;
        current.error = false;
        setView({ scope, offer: current.offer, pending: true, error: false });
        socket.emit('choose_match_admission', {
            matchId: current.offer.matchId,
            source,
            ...(source === 'verified_ad' ? { grantId: current.offer.grantId } : {}),
        });
    }, [socket, scope]);

    const cancel = useCallback(() => {
        const current = session.current;
        if (!current || current.scope !== scope || !current.active || current.closed) return;
        current.closed = true;
        current.offer = null;
        current.submitted = false;
        current.error = false;
        setView({ scope, offer: null, pending: false, error: false });
        if (socket?.connected && matchId) socket.emit('cancel_match_admission', { matchId });
    }, [socket, matchId, scope]);

    const visible = view?.scope === scope ? view : null;
    return { offer: visible?.offer ?? null, pending: visible?.pending ?? false, error: visible?.error ?? false, choose, cancel };
}
