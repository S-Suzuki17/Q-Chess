/**
 * Header Component
 * Top navigation bar with user info
 */
import React, { useState } from 'react';
import { User, LogOut, Globe, Settings, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SettingsModal from '../modals/SettingsModal';

const Header = ({ user, userData, handleLogout, setShowAuthModal, setShowLeaderboardModal }) => {
    const { t, i18n } = useTranslation();
    const [showSettings, setShowSettings] = useState(false);

    const toggleLanguage = () => {
        const newLang = i18n.language === 'en' ? 'ja' : 'en';
        i18n.changeLanguage(newLang);
    };

    return (
        <>
            <header className="game-header">
                <div className="header-content">
                    <div className="logo-section">
                        <div className="relative">
                            <div className="absolute -inset-1 rounded-full bg-cyan-400 opacity-20 blur-md"></div>
                            <h1 className="game-title relative">Quess</h1>
                        </div>
                        <span className="version-badge">v1.0.0</span>
                    </div>

                    <div className="user-section">
                        <button
                            onClick={() => setShowLeaderboardModal(true)}
                            className="icon-btn group"
                            title={t('leaderboard.title', 'Ranking')}
                        >
                            <Trophy size={20} className="group-hover:text-yellow-400 transition-colors" />
                        </button>

                        <button
                            onClick={() => setShowSettings(true)}
                            className="icon-btn"
                            title={t('settings.title', 'Settings')}
                        >
                            <Settings size={20} />
                        </button>

                        <button
                            onClick={toggleLanguage}
                            className="icon-btn font-orbitron text-xs font-bold"
                            title="Toggle Language"
                        >
                            {i18n.language === 'en' ? 'JP' : 'EN'}
                        </button>

                        <div className="w-px h-8 bg-white/10 mx-2"></div>

                        {user && !user.isAnonymous ? (
                            <div className="user-info-pill">
                                <button onClick={handleLogout} className="text-white/50 hover:text-white mr-2 transition-colors">
                                    <LogOut size={16} />
                                </button>
                                <div className="user-details-text">
                                    <span className="user-name">{user.displayName || 'Player'}</span>
                                    <span className="user-rating text-cyan-400">{userData?.rating || 1000}</span>
                                </div>
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt="" className="user-avatar-small" />
                                ) : (
                                    <div className="user-avatar-small bg-white/10 flex items-center justify-center">
                                        <User size={16} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button onClick={() => setShowAuthModal(true)} className="btn-premium py-2 px-6 text-sm">
                                <User size={16} className="mr-2" />
                                {t('auth.login', 'Login')}
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {showSettings && (
                <SettingsModal onClose={() => setShowSettings(false)} />
            )}
        </>
    );
};

export default Header;
