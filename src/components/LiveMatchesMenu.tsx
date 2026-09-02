'use client';
import React, { useState, useEffect } from 'react';
import { ActiveMatch, getActiveMatches, Profile, ensureProfile } from '../lib/gameRecordService';
import { dict, Language } from '../locales/dict';

interface LiveMatchesMenuProps {
    lang: Language;
    onClose: () => void;
    onSpectate: (roomId: string) => void;
}

export function LiveMatchesMenu({ lang, onClose, onSpectate }: LiveMatchesMenuProps) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const [matches, setMatches] = useState<ActiveMatch[]>([]);
    const [profiles, setProfiles] = useState<Record<string, Profile>>({});
    const [loading, setLoading] = useState(true);

    const loadMatches = async () => {
        setLoading(true);
        const data = await getActiveMatches();
        setMatches(data);

        // Load profiles for players
        const profileMap: Record<string, Profile> = {};
        for (const m of data) {
            if (m.white_id && !profileMap[m.white_id]) {
                const p = await ensureProfile(m.white_id, 'Unknown');
                if (p) profileMap[m.white_id] = p;
            }
            if (m.black_id && !profileMap[m.black_id]) {
                const p = await ensureProfile(m.black_id, 'Unknown');
                if (p) profileMap[m.black_id] = p;
            }
        }
        setProfiles(profileMap);
        setLoading(false);
    };

    useEffect(() => {
        loadMatches();
        const interval = setInterval(loadMatches, 15000); // refresh every 15s
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
            <div className="bg-[#11100E] border border-[#B39A62]/30 p-6 rounded-lg max-w-md w-full shadow-2xl max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-[#E8E2D7] font-serif tracking-widest flex items-center gap-2">
                        <span className="w-3 h-3 bg-[#B39A62] rounded-full animate-pulse"></span>
                        Live Matches
                    </h3>
                    <button onClick={onClose} className="text-[#A89C86] hover:text-[#E8E2D7]">✕</button>
                </div>

                {loading && matches.length === 0 ? (
                    <p className="text-[#A89C86] text-sm text-center py-4">Loading active matches...</p>
                ) : matches.length === 0 ? (
                    <p className="text-gray-600 text-sm text-center py-4">No active matches at the moment.</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {matches.map(m => {
                            const whiteName = m.white_id ? (profiles[m.white_id]?.name || 'Player') : 'AI';
                            const blackName = m.black_id ? (profiles[m.black_id]?.name || 'Player') : 'AI';
                            const duration = Math.floor((Date.now() - new Date(m.started_at).getTime()) / 60000);

                            return (
                                <button
                                    key={m.room_id}
                                    onClick={() => onSpectate(m.room_id)}
                                    className="w-full flex justify-between items-center p-4 bg-black/40 border border-red-900/50 rounded group hover:bg-red-950/30 hover:border-red-500 transition-all text-left"
                                >
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-3 text-sm">
                                            <span className="font-bold text-[#E8E2D7]">⚪ {whiteName}</span>
                                            <span className="text-red-500 font-bold text-[10px]">VS</span>
                                            <span className="font-bold text-[#E8E2D7]">⚫ {blackName}</span>
                                        </div>
                                        <span className="text-[10px] text-[#A89C86] mt-1">Playing for {duration} min</span>
                                    </div>
                                    <span className="text-red-400 font-bold text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                        Spectate ▶
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
