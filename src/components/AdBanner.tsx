'use client';
import React, { useEffect, useRef } from 'react';
import { matchText } from '../locales/matchText';
import { isAdSenseUnitConfigured, mountAdSenseUnit } from '../lib/adsense';

interface AdBannerProps {
    adClient?: string;
    adSlot?: string;
    adFormat?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
    className?: string;
    style?: React.CSSProperties;
}

function AdUnit({ publisherId, slot, adFormat, style }: {
    publisherId: string;
    slot: string;
    adFormat: NonNullable<AdBannerProps['adFormat']>;
    style?: React.CSSProperties;
}) {
    const elementRef = useRef<HTMLModElement>(null);
    useEffect(() => {
        // Match the root loader: development runs must not request real ads.
        if (process.env.NODE_ENV !== 'production' || !elementRef.current) return;
        return mountAdSenseUnit(elementRef.current, publisherId);
    }, [publisherId, slot, adFormat]);

    return (
        <ins
            ref={elementRef}
            className="adsbygoogle"
            style={{ display: 'block', ...style }}
            data-ad-client={publisherId}
            data-ad-slot={slot}
            data-ad-format={adFormat}
            data-full-width-responsive="false"
        />
    );
}

export function AdBanner({ adClient, adSlot, adFormat = 'auto', className = '', style }: AdBannerProps) {
    const publisherId = adClient || process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID || process.env.NEXT_PUBLIC_ADSENSE_CLIENT || process.env.NEXT_PUBLIC_ADSENSE_PUB_ID || 'ca-pub-1116866075179199';
    const slot = adSlot || process.env.NEXT_PUBLIC_ADSENSE_SLOT;
    if (!isAdSenseUnitConfigured(publisherId, slot) || !slot) return null;

    return (
        <div className={`ad-container ${className}`} style={style}>
            <AdUnit
                key={`${publisherId}:${slot}:${adFormat}`}
                publisherId={publisherId}
                slot={slot}
                adFormat={adFormat}
                style={style}
            />
        </div>
    );
}

interface InterstitialAdProps {
    show: boolean;
    onClose: () => void;
    adSlot: string;
    lang?: string;
}

export function InterstitialAd({ show, onClose, adSlot, lang = 'en' }: InterstitialAdProps) {
    const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUB_ID;
    const configured = isAdSenseUnitConfigured(publisherId, adSlot);
    useEffect(() => {
        if (show && !configured) onClose();
    }, [show, configured, onClose]);

    if (!show || !configured) return null;

    return (
        <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#2A2621] border border-[#4A4238] rounded-lg p-6 max-w-md w-full flex flex-col items-center gap-4">
                <p className="text-[#8C7A5E] text-xs uppercase tracking-widest">
                    {matchText(lang, '広告', 'Advertisement')}
                </p>
                <AdBanner adClient={publisherId} adSlot={adSlot} adFormat="rectangle" style={{ width: '300px', height: '250px' }} />
                <button
                    onClick={onClose}
                    className="mt-4 px-6 py-2 bg-[#D4B872] text-[#1E1C19] rounded font-bold text-sm hover:bg-[#E8E5DF] transition-colors"
                >
                    {matchText(lang, '閉じる', 'Close')}
                </button>
            </div>
        </div>
    );
}

export default AdBanner;
