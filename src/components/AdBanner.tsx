'use client';
import React, { useEffect, useRef } from 'react';

interface AdBannerProps {
    adClient?: string;
    adSlot?: string;
    adFormat?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
    className?: string;
    style?: React.CSSProperties;
}

declare global {
    interface Window {
        adsbygoogle: any[];
    }
}

export function AdBanner({ adClient, adSlot, adFormat = 'auto', className = '', style }: AdBannerProps) {
    const adRef = useRef<HTMLDivElement>(null);
    const isLoaded = useRef(false);

    useEffect(() => {
        if (isLoaded.current) return;
        try {
            if (typeof window !== 'undefined' && window.adsbygoogle) {
                window.adsbygoogle.push({});
                isLoaded.current = true;
            }
        } catch (e) {
            console.error('AdSense error:', e);
        }
    }, []);

    // Don't render anything if no adSlot or client is configured
    const publisherId = adClient || process.env.NEXT_PUBLIC_ADSENSE_CLIENT || process.env.NEXT_PUBLIC_ADSENSE_PUB_ID || 'ca-pub-1116866075179199';
    const slot = adSlot || process.env.NEXT_PUBLIC_ADSENSE_SLOT;
    if (!publisherId || !slot || slot === 'XXXXXXXXXX') {
        return null;
    }

    return (
        <div className={`ad-container ${className}`} style={style} ref={adRef}>
            <ins
                className="adsbygoogle"
                style={{ display: 'block', ...style }}
                data-ad-client={publisherId}
                data-ad-slot={slot}
                data-ad-format={adFormat}
                data-full-width-responsive="true"
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

    useEffect(() => {
        if (show && publisherId) {
            try {
                if (typeof window !== 'undefined' && window.adsbygoogle) {
                    window.adsbygoogle.push({});
                }
            } catch (e) {
                console.error('AdSense interstitial error:', e);
            }
        }
    }, [show, publisherId]);

    if (!show) return null;

    // If no ad configured, just skip
    if (!publisherId || !adSlot) {
        onClose();
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#2A2621] border border-[#4A4238] rounded-lg p-6 max-w-md w-full flex flex-col items-center gap-4">
                <p className="text-[#8C7A5E] text-xs uppercase tracking-widest">
                    {lang === 'ja' ? '広告' : 'Advertisement'}
                </p>
                <ins
                    className="adsbygoogle"
                    style={{ display: 'block', width: '300px', height: '250px' }}
                    data-ad-client={publisherId}
                    data-ad-slot={adSlot}
                    data-ad-format="rectangle"
                />
                <button
                    onClick={onClose}
                    className="mt-4 px-6 py-2 bg-[#D4B872] text-[#1E1C19] rounded font-bold text-sm hover:bg-[#E8E5DF] transition-colors"
                >
                    {lang === 'ja' ? '閉じる' : 'Close'}
                </button>
            </div>
        </div>
    );
}

export default AdBanner;
