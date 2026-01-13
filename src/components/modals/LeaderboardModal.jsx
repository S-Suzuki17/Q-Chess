import React from 'react';
import { X, Trophy, Crown, Medal, Award } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { formatRatingChange } from '../../utils/rating';

export default function LeaderboardModal({ onClose, user }) {
    const { t } = useTranslation();
    const { leaderboard, loading, error } = useLeaderboard();

    const getRankIcon = (rank) => {
        if (rank === 1) return <Crown className="text-yellow-400 drop-shadow-md" size={32} />;
        if (rank === 2) return <Medal className="text-slate-300 drop-shadow-md" size={28} />;
        if (rank === 3) return <Award className="text-amber-600 drop-shadow-md" size={28} />;
        return <span className="rank-text font-orbitron font-bold text-lg text-cyan-500/80">#{rank}</span>;
    };

    const getTierColor = (tier) => {
        switch (tier) {
            case 'grandmaster': return 'bg-red-500/20 text-red-300 border-red-500/50 shadow-red-900/40';
            case 'master': return 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-purple-900/40';
            case 'diamond': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-cyan-900/40';
            case 'gold': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50 shadow-yellow-900/40';
            case 'silver': return 'bg-slate-400/20 text-slate-300 border-slate-400/50';
            case 'bronze': return 'bg-orange-700/20 text-orange-300 border-orange-700/50';
            default: return 'bg-slate-700/50 text-slate-400 border-slate-600';
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content-glass max-w-2xl w-full flex flex-col mx-4">

                {/* Fixed Header */}
                <div className="modal-header">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                            <Trophy className="text-yellow-400 animate-pulse-slow" size={24} />
                        </div>
                        <h2 className="modal-title text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-amber-500">
                            {t('leaderboard.title', 'Leaderboard')}
                        </h2>
                    </div>
                    <button onClick={onClose} className="icon-btn hover:bg-white/10 hover:border-white/20 hover:text-white group">
                        <X size={20} className="group-hover:scale-110 transition-transform" />
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="modal-body custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 shadow-[0_0_15px_cyan]"></div>
                            <span className="text-cyan-500/70 font-orbitron text-sm tracking-wider animate-pulse">SYNCING DATA...</span>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12 glass-panel border-rose-500/30 bg-rose-950/20">
                            <p className="text-rose-400 font-bold mb-2">{t('errors.failedToLoad', 'Connection Error')}</p>
                            <p className="text-sm text-rose-300/60">{error}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {leaderboard.map((player) => (
                                <div
                                    key={player.id}
                                    className={`
                                        relative flex items-center justify-between p-4 rounded-xl border transition-all duration-300 group
                                        ${player.id === user?.uid
                                            ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_30px_-5px_rgba(34,211,238,0.15)] z-10 scale-[1.01]'
                                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 hover:translate-x-1'
                                        }
                                    `}
                                >
                                    {/* Left: Rank & Info */}
                                    <div className="flex items-center gap-5">
                                        <div className="w-12 flex justify-center flex-shrink-0">
                                            {getRankIcon(player.rank)}
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-3">
                                                <span className={`font-bold text-lg tracking-wide ${player.id === user?.uid ? 'text-cyan-300' : 'text-slate-200'}`}>
                                                    {player.displayName}
                                                </span>
                                                {player.id === user?.uid && (
                                                    <span className="text-[10px] bg-cyan-500 text-black px-2 py-0.5 rounded-full font-bold tracking-widest uppercase">
                                                        YOU
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border shadow-sm ${getTierColor(player.tier?.tier)}`}>
                                                    {player.tier?.name}
                                                </span>
                                                <span className="text-xs text-slate-500 font-medium">
                                                    {player.gamesPlayed} Matches • <span className={player.winRate >= 50 ? 'text-emerald-400' : 'text-slate-400'}>{player.winRate}% WR</span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Rating */}
                                    <div className="flex flex-col items-end pr-2">
                                        <span className={`text-2xl font-orbitron font-bold tracking-tight ${player.id === user?.uid ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                            {player.rating}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">Rating</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer (Optional) */}
                {/* <div className="modal-footer">
                    <button onClick={onClose} className="btn-glass text-sm">Close</button>
                </div> */}
            </div>
        </div>
    );
}
