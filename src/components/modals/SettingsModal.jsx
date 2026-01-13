/**
 * SettingsModal Component
 * Premium Glass Theme
 */
import React, { useState } from 'react';
import { Settings, Volume2, Monitor, X, Check, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { audioSys } from '../../utils/audioSys';

function SettingsModal({ onClose }) {
    const { t } = useTranslation();
    const [masterVol, setMasterVol] = useState(audioSys.masterVolume * 100);
    const [sfxVol, setSfxVol] = useState(audioSys.sfxVolume * 100);
    const [graphicsHigh, setGraphicsHigh] = useState(
        localStorage.getItem('q-gambit-graphics') !== 'low'
    );

    const handleMasterChange = (e) => {
        const val = parseInt(e.target.value);
        setMasterVol(val);
        audioSys.setMasterVolume(val / 100);
    };

    const handleSfxChange = (e) => {
        const val = parseInt(e.target.value);
        setSfxVol(val);
        audioSys.setSfxVolume(val / 100);
    };

    const toggleGraphics = (high) => {
        setGraphicsHigh(high);
        localStorage.setItem('q-gambit-graphics', high ? 'high' : 'low');
        window.dispatchEvent(new Event('graphics-change'));
    };

    // Custom Slider Component
    const RangeSlider = ({ value, onChange, label }) => (
        <div className="space-y-3">
            <div className="flex justify-between items-end">
                <label className="text-sm font-medium text-slate-300">{label}</label>
                <span className="text-xs font-mono text-cyan-400 font-bold bg-cyan-950/30 px-2 py-0.5 rounded border border-cyan-500/20">{value}%</span>
            </div>
            <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                <div
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-100 ease-out shadow-[0_0_10px_cyan]"
                    style={{ width: `${value}%` }}
                ></div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={value}
                    onChange={onChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
            </div>
        </div>
    );

    return (
        <div className="modal-overlay">
            <div className="modal-content-glass max-w-md w-full mx-4">

                {/* Header */}
                <div className="modal-header">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                            <Settings size={22} className="text-indigo-400 animate-spin-slow" />
                        </div>
                        <h3 className="modal-title font-orbitron">{t('settings.title', 'System Config')}</h3>
                    </div>
                    <button onClick={onClose} className="icon-btn hover:bg-white/10 text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="modal-body space-y-8">

                    {/* Audio Section */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-indigo-300 font-bold tracking-wide uppercase text-xs border-b border-indigo-500/20 pb-2">
                            <Volume2 size={14} />
                            {t('settings.audio', 'Audio Systems')}
                        </div>

                        <div className="glass-panel p-5 space-y-6 bg-indigo-950/10 border-indigo-500/10">
                            <RangeSlider
                                label={t('settings.master_volume', 'Master Output')}
                                value={masterVol}
                                onChange={handleMasterChange}
                            />
                            <RangeSlider
                                label={t('settings.sfx_volume', 'SFX Intensity')}
                                value={sfxVol}
                                onChange={handleSfxChange}
                            />
                        </div>
                    </div>

                    {/* Graphics Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-indigo-300 font-bold tracking-wide uppercase text-xs border-b border-indigo-500/20 pb-2">
                            <Monitor size={14} />
                            {t('settings.graphics', 'Visual Fidelity')}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => toggleGraphics(true)}
                                className={`
                                    relative p-4 rounded-xl border flex flex-col items-center gap-2 transition-all duration-300
                                    ${graphicsHigh
                                        ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_20px_-5px_rgba(6,182,212,0.3)]'
                                        : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100 hover:bg-white/10'
                                    }
                                `}
                            >
                                <Zap size={24} className={graphicsHigh ? 'text-cyan-400' : 'text-slate-500'} />
                                <span className={`font-orbitron font-bold ${graphicsHigh ? 'text-cyan-100' : 'text-slate-400'}`}>HIGH</span>
                                {graphicsHigh && <Check size={16} className="absolute top-2 right-2 text-cyan-400" />}
                            </button>

                            <button
                                onClick={() => toggleGraphics(false)}
                                className={`
                                    relative p-4 rounded-xl border flex flex-col items-center gap-2 transition-all duration-300
                                    ${!graphicsHigh
                                        ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]'
                                        : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100 hover:bg-white/10'
                                    }
                                `}
                            >
                                <span className="text-xl font-bold font-mono leading-none my-1">⚡</span>
                                <span className={`font-orbitron font-bold ${!graphicsHigh ? 'text-emerald-100' : 'text-slate-400'}`}>LOW</span>
                                {!graphicsHigh && <Check size={16} className="absolute top-2 right-2 text-emerald-400" />}
                            </button>
                        </div>

                        <p className="text-xs text-center text-slate-500 mt-2">
                            {graphicsHigh ? t('settings.high_desc', 'Full visual effects enabled') : t('settings.low_desc', 'Optimized for performance')}
                        </p>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-black/20 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors text-sm">
                        {t('settings.close', 'Save & Close')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SettingsModal;
