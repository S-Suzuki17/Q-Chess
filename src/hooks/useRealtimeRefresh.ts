'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

type RealtimeTable = 'active_matches' | 'friends' | 'game_records' | 'profiles';

// Never log SDK errors/causes verbatim: they can contain URLs, tokens or row data.
function errorReason(error: unknown): string {
    const message = error instanceof Error ? error.message.slice(0, 1000) : '';
    if (/mismatch between server and client bindings/i.test(message)) return 'binding_mismatch';
    if (/token.*expired|InvalidJWTExpiration/i.test(message)) return 'token_expired';
    if (/jwt|unauthorized|permission denied|forbidden/i.test(message)) return 'authorization_failed';
    if (/too_many|rate.?limit|too many/i.test(message)) return 'rate_limited';
    const closeCode = /socket closed: ([1-4]\d{3})\b/i.exec(message)?.[1];
    if (closeCode) return `socket_closed_${closeCode}`;
    if (/transport|network|fetch failed|failed to fetch/i.test(message)) return 'transport_failure';
    if (/connection lost/i.test(message)) return 'connection_lost';
    if (/timed?\s*out|timeout/i.test(message)) return 'timeout';
    return 'unclassified_error';
}

/** SDK reconnect/focus/poll recover missed events; [] uses HTTP refresh only, including an initial refresh. */
export function useRealtimeRefresh(tables: readonly RealtimeTable[], refresh: () => void | Promise<unknown>, enabled = true) {
    const refreshRef = useRef(refresh);
    useEffect(() => { refreshRef.current = refresh; });
    const tableKey = [...new Set(tables)].sort().join(',');

    useEffect(() => {
        if (!enabled) return;
        let disposed = false;
        let running = false;
        let pending = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const reportedOutageErrors = new Set<string>();
        const run = async () => {
            timer = undefined;
            if (disposed) return;
            if (running) { pending = true; return; }
            running = true;
            try { await refreshRef.current(); }
            catch (error) {
                if (!disposed) console.error('Failed to refresh live data:', errorReason(error));
            }
            finally {
                running = false;
                if (pending && !disposed) { pending = false; schedule(); }
            }
        };
        const schedule = () => {
            if (disposed || timer !== undefined) return;
            timer = setTimeout(run, 100);
        };
        const channel = tableKey ? supabase.channel(`table-refresh:${crypto.randomUUID()}`) : null;
        if (channel) {
            for (const table of tableKey.split(',') as RealtimeTable[]) {
                channel.on('postgres_changes', {
                    event: '*', schema: 'public', table,
                    // Only a key is needed to invalidate; never request private profile fields.
                    select: [table === 'active_matches' ? 'room_id' : 'id']
                }, schedule);
            }
            channel.subscribe((status, error) => {
                if (disposed) return;
                if (status === 'SUBSCRIBED') {
                    reportedOutageErrors.clear();
                    schedule();
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    // The SDK owns retries. Report each cause once until it reconnects.
                    const reason = status === 'TIMED_OUT' ? 'timeout' : errorReason(error);
                    const warningKey = `${status}:${reason}`;
                    if (!reportedOutageErrors.has(warningKey)) {
                        reportedOutageErrors.add(warningKey);
                        console.warn('Realtime unavailable; refresh fallback remains active:', tableKey, status, reason);
                    }
                }
            });
        } else {
            schedule();
        }
        const onVisible = () => { if (document.visibilityState === 'visible') schedule(); };
        window.addEventListener('focus', schedule);
        window.addEventListener('online', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        const poll = setInterval(onVisible, 30000);
        return () => {
            disposed = true;
            clearTimeout(timer);
            clearInterval(poll);
            window.removeEventListener('focus', schedule);
            window.removeEventListener('online', onVisible);
            document.removeEventListener('visibilitychange', onVisible);
            if (channel) void supabase.removeChannel(channel);
        };
    }, [tableKey, enabled]);
}
