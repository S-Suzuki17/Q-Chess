'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

type RealtimeTable = 'active_matches' | 'friends' | 'game_records' | 'profiles';

/** Changes invalidate the current query; reconnect/focus/poll recover missed events. */
export function useRealtimeRefresh(tables: readonly RealtimeTable[], refresh: () => void | Promise<unknown>, enabled = true) {
    const refreshRef = useRef(refresh);
    useEffect(() => { refreshRef.current = refresh; });
    const tableKey = tables.join(',');

    useEffect(() => {
        if (!enabled) return;
        let disposed = false;
        let running = false;
        let pending = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const run = async () => {
            timer = undefined;
            if (disposed) return;
            if (running) { pending = true; return; }
            running = true;
            try { await refreshRef.current(); }
            catch (error) { console.error('Failed to refresh live data:', error); }
            finally {
                running = false;
                if (pending && !disposed) { pending = false; schedule(); }
            }
        };
        const schedule = () => {
            if (disposed || timer !== undefined) return;
            timer = setTimeout(run, 100);
        };
        const channel = supabase.channel(`table-refresh:${crypto.randomUUID()}`);
        for (const table of tableKey.split(',') as RealtimeTable[]) {
            channel.on('postgres_changes', {
                event: '*', schema: 'public', table,
                // Only a key is needed to invalidate; never request private profile fields.
                select: [table === 'active_matches' ? 'room_id' : 'id']
            }, schedule);
        }
        channel.subscribe(status => {
            if (status === 'SUBSCRIBED') schedule();
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('Realtime unavailable; refresh fallback remains active:', tableKey, status);
            }
        });
        const onVisible = () => { if (document.visibilityState === 'visible') schedule(); };
        window.addEventListener('focus', schedule);
        document.addEventListener('visibilitychange', onVisible);
        const poll = setInterval(onVisible, 30000);
        return () => {
            disposed = true;
            clearTimeout(timer);
            clearInterval(poll);
            window.removeEventListener('focus', schedule);
            document.removeEventListener('visibilitychange', onVisible);
            void supabase.removeChannel(channel);
        };
    }, [tableKey, enabled]);
}
