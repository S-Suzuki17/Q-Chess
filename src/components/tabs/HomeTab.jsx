/**
 * HomeTab Component
 * Main lobby screen with game mode selection
 */
import React, { useState } from 'react';
import { Play, Clock, Zap, Flame, User, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import RulesModal from '../modals/RulesModal';

function HomeTab({ onQuickMatch, remainingFreeGames, freeGamesPerDay, onlineCount, bonusTickets, onOpenInventory }) {
    const { t } = useTranslation();
    const [showRules, setShowRules] = useState(false);

    return (
        <div className="animate-slide-up home-tab">
            {/* Daily Limit Banner */}
            <div className={`daily-limit-banner ${remainingFreeGames > 0 || bonusTickets > 0 ? 'has-games' : 'no-games'}`}>
                <div className="daily-limit-left">
                    <Play size={16} color={remainingFreeGames > 0 ? 'var(--cyan-glow)' : 'var(--rose-glow)'} />
                    <span className="daily-limit-label">{t('lobby.daily_matches')}</span>
                </div>
                <div className="daily-limit-count-group">
                    <div className={`daily-limit-count ${remainingFreeGames > 0 ? 'has-games' : 'no-games'}`}>
                        <span>{remainingFreeGames}</span>
                        <span className="daily-limit-total">/ {freeGamesPerDay}</span>
                    </div>
                </div>
                {/* Tickets Display */}
                {bonusTickets > 0 && (
                    <div className="ticket-badge" title="Free Game Tickets">
                        <span className="ticket-icon">🎫</span>
                        <span className="ticket-count">+{bonusTickets}</span>
                    </div>
                )}
            </div>

            <div className="home-action-buttons">
                {/* How to Play Button */}
                <button
                    className="btn btn-premium home-action-btn"
                    onClick={() => setShowRules(true)}
                    style={{ flex: 1 }}
                >
                    <BookOpen size={20} />
                    <span>{t('lobby.how_to_play')}</span>
                </button>

                {/* Inventory Button */}
                <button
                    className="btn btn-premium home-action-btn"
                    onClick={onOpenInventory}
                    style={{ flex: 1, filter: 'hue-rotate(45deg)' }} /* Slight variation */
                >
                    <span style={{ fontSize: '20px' }}>🎒</span>
                    <span>{t('lobby.inventory')}</span>
                </button>
            </div>

            {/* Game Modes */}
            {/* Game Modes */}
            <h3 className="section-header">{t('lobby.start_match')}</h3>
            <div className="game-modes-grid">
                <button
                    onClick={() => {
                        console.log('[HomeTab] Rapid button clicked');
                        onQuickMatch('rapid');
                    }}
                    className="card-premium-interactive"
                >
                    <Clock size={32} color="var(--indigo-glow)" />
                    <div className="game-mode-name">{t('lobby.rapid')}</div>
                    <div className="game-mode-time">10 min</div>
                </button>

                <button
                    onClick={() => onQuickMatch('blitz')}
                    className="card-premium-interactive"
                >
                    <Zap size={32} color="var(--cyan-glow)" />
                    <div className="game-mode-name">{t('lobby.blitz')}</div>
                    <div className="game-mode-time">3 min</div>
                </button>

                <button
                    onClick={() => onQuickMatch('speed')}
                    className="card-premium-interactive"
                >
                    <Flame size={32} color="var(--rose-glow)" />
                    <div className="game-mode-name">{t('lobby.speed')}</div>
                    <div className="game-mode-time">10s/mv</div>
                </button>
            </div>

            {/* Online Count */}
            {/* Online Count */}
            <div className="online-count-container" style={{ display: 'flex', justifyContent: 'center' }}>
                <div className="glass-panel" style={{
                    padding: '8px 20px',
                    borderRadius: '99px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'rgba(0,0,0,0.3)'
                }}>
                    <User size={16} color="var(--primary-glow)" />
                    <span className="online-count-text" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {t('lobby.online_count', { count: onlineCount || 1 })}
                    </span>
                </div>
            </div>

            {/* Note: Friends list removed - feature not implemented */}

            {showRules && <RulesModal onClose={() => setShowRules(false)} />}
        </div>
    );
}

export default HomeTab;
