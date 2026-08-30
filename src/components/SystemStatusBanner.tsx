'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Language, dict } from '../locales/dict';

export interface SystemStatus {
    maintenance_mode: boolean;
    announcement_en: string | null;
    announcement_ja: string | null;
}

interface Props {
    lang: Language;
}

export function SystemStatusBanner({ lang }: Props) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const [status, setStatus] = useState<SystemStatus | null>(null);

    useEffect(() => {
        // Initial fetch
        const fetchStatus = async () => {
            const { data, error } = await supabase
                .from('system_status')
                .select('*')
                .eq('id', 1)
                .single();
            if (!error && data) {
                setStatus(data as SystemStatus);
            }
        };

        fetchStatus();

        // Listen for realtime updates
        const channel = supabase.channel('system_status_changes')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'system_status', filter: 'id=eq.1' },
                (payload) => {
                    setStatus(payload.new as SystemStatus);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    if (!status) return null;

    const msg = lang === 'ja' ? status.announcement_ja : (status.announcement_en || status.announcement_ja);

    return (
        <>
            {/* Announcement Banner */}
            {msg && msg.trim() !== '' && !status.maintenance_mode && (
                <div className="fixed top-0 left-0 w-full bg-amber-500/90 text-amber-950 font-bold text-center py-2 px-4 z-[100] shadow-md flex items-center justify-center gap-2">
                    <span className="animate-pulse">⚠️</span>
                    <span className="text-sm tracking-wide">{msg}</span>
                    <span className="animate-pulse">⚠️</span>
                </div>
            )}

            {/* Maintenance Mode Overlay */}
            {status.maintenance_mode && (
                <div className="fixed inset-0 bg-[#1E1C19]/95 z-[9999] flex flex-col items-center justify-center p-4">
                    <div className="bg-[#2A2621] border-2 border-red-900/50 p-8 rounded-xl max-w-md w-full text-center shadow-2xl">
                        <div className="text-6xl mb-6">🛠️</div>
                        <h2 className="text-3xl font-serif text-[#D4B872] mb-4 font-bold tracking-widest">
                            {lang === 'ja' ? 'メンテナンス中' : 'UNDER MAINTENANCE'}
                        </h2>
                        <p className="text-[#E8E5DF] mb-6 leading-relaxed">
                            {msg && msg.trim() !== '' 
                                ? msg 
                                : (lang === 'ja' ? '現在システムメンテナンスを行っております。終了までしばらくお待ちください。' : 'The system is currently undergoing maintenance. Please check back later.')}
                        </p>
                        <div className="text-xs text-[#8C7A5E] font-mono">
                            Q-GAMBIT SYSTEM
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
