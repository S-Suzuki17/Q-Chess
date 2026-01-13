/**
 * GameOverModal Component
 * Displays game result and options after game ends
 */
import React from 'react';
import { RotateCcw, Share2, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function GameOverModal({ winner, myColor, onPlayAgain, onExit }) {
    const { t } = useTranslation();
    const isVictory = (winner === 'WHITE' && myColor === 'white') ||
        (winner === 'BLACK' && myColor === 'black');

    // Convert internal winner value to display color
    const winnerDisplay = winner === 'WHITE' ? 'CYAN' : 'ROSE';

    const handleShare = () => {
        const text = isVictory
            ? t('game.share_message_win')
            : t('game.share_message_loss');
        const url = "https://q-gambit.vercel.app";
        const hashtags = "QuantumChess,QGambit"; // No specific hashtags in prompt but good to have
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=${hashtags}`;
        window.open(twitterUrl, '_blank');
    };

    const handleCalendar = () => {
        const title = "Q-Gambit Match Result";
        const details = isVictory ? "Victory! 🏆 Played a Quantum Chess match." : "Defeat. 💀 Played a Quantum Chess match.";
        const startTime = new Date().toISOString().replace(/-|:|\.\d\d\d/g, "");
        const endTime = new Date(new Date().getTime() + 15 * 60000).toISOString().replace(/-|:|\.\d\d\d/g, ""); // +15 mins
        const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}&dates=${startTime}/${endTime}`;
        window.open(calendarUrl, '_blank');
    };

    return (
        <div className="game-over-modal">
            <div className="game-over-content">
                <div className={`game-over-title ${isVictory ? 'victory' : 'defeat'}`}>
                    {isVictory ? `🏆 ${t('game.victory')}` : `💀 ${t('game.defeat')}`}
                </div>
                <p className="game-over-message">
                    {t('game.wins_by_capture', { winner: winnerDisplay })}
                </p>
                <div className="game-over-actions">
                    <button className="btn btn-premium btn-play-again" onClick={onPlayAgain}>
                        <RotateCcw size={16} className="btn-icon" />
                        {t('game.play_again')}
                    </button>
                    <button className="btn btn-premium btn-share" onClick={handleShare}>
                        <Share2 size={16} className="btn-icon" />
                        {t('game.share')}
                    </button>
                    <button className="btn btn-premium btn-calendar" onClick={handleCalendar}>
                        <Calendar size={16} className="btn-icon" />
                        {t('game.calendar')}
                    </button>
                    <button className="btn btn-secondary" onClick={onExit}>
                        {t('game.exit')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default GameOverModal;
