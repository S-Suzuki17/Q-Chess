/**
 * AuthModal Component
 * Premium Glass Theme
 */
import React from 'react';
import { X, LogIn, User, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function AuthModal({ onSignInWithGoogle, onLinkWithGoogle, onSignInGuest, isAnonymous, onClose, isLoading }) {
    const { t } = useTranslation();

    const handleGoogleClick = async () => {
        if (isAnonymous) {
            await onLinkWithGoogle();
        } else {
            await onSignInWithGoogle();
        }
        onClose();
    };

    const handleGuestClick = () => {
        if (onSignInGuest) onSignInGuest();
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content-glass max-w-md w-full mx-4 overflow-visible animate-scale-in">
                {/* Header */}
                <div className="modal-header border-b-0 pb-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)]">
                            <LogIn size={24} className="text-cyan-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white font-orbitron tracking-wide">
                            {t('auth.title', 'Access Port')}
                        </h3>
                    </div>
                    <button onClick={onClose} className="icon-btn hover:bg-white/10 hover:border-white/20 text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 pt-6 space-y-8">
                    <p className="text-slate-300 leading-relaxed text-sm bg-white/5 p-4 rounded-lg border border-white/5">
                        {isAnonymous
                            ? t('auth.link_description', 'Link your neural profile to Google to sync progress across devices.')
                            : t('auth.login_description', 'Authenticate to access the Quantum Network.')
                        }
                    </p>

                    <div className="space-y-4">
                        {/* Google Button */}
                        <button
                            className="w-full group relative flex items-center justify-center gap-3 bg-white text-slate-900 font-bold py-3.5 rounded-xl transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-[0.98]"
                            onClick={handleGoogleClick}
                            disabled={isLoading}
                        >
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm"></div>
                            <svg viewBox="0 0 24 24" width="20" height="20">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            <span className="relative z-10">
                                {isAnonymous
                                    ? t('auth.link_google', 'Link Google Account')
                                    : t('auth.sign_in_google', 'Sign in with Google')
                                }
                            </span>
                        </button>

                        {/* Guest Button */}
                        <button
                            className="w-full btn-glass py-3.5 group hover:bg-white/10 border-white/10 text-slate-300 hover:text-white"
                            onClick={handleGuestClick}
                            disabled={isLoading}
                        >
                            <User size={18} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
                            <span>{t('auth.guest_login', 'Play as Guest')}</span>
                            <ArrowRight size={16} className="ml-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                        </button>
                    </div>

                    {isAnonymous && (
                        <div className="text-center">
                            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase opacity-70">
                                {t('auth.guest_note', '* No sync in guest mode')}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AuthModal;
