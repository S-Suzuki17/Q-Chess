'use client';
import React, { useEffect, useRef } from 'react';
import { browserCanRequestWebAds } from '../lib/webAdPolicy';
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
    if (!browserCanRequestWebAds()) return null;
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

/** Ordinary display units must never be wrapped in a homemade interstitial. */
export function InterstitialAd({show,onClose}:InterstitialAdProps) {
    useEffect(()=>{if(show)onClose();},[show,onClose]);
    return null;
}

export default AdBanner;
