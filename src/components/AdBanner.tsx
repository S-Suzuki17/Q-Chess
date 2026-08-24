'use client';

import { useEffect } from 'react';

interface AdBannerProps {
    adClient: string;
    adSlot: string;
}

export default function AdBanner({ adClient, adSlot }: AdBannerProps) {
    useEffect(() => {
        try {
            // @ts-ignore
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (err) {
            console.error('AdSense error:', err);
        }
    }, []);

    return (
        <div className="w-full flex justify-center items-center my-4 min-h-[90px] bg-[#0a0a0a] border border-[#333]">
            <ins
                className="adsbygoogle"
                style={{ display: 'inline-block', width: '728px', height: '90px' }}
                data-ad-client={adClient}
                data-ad-slot={adSlot}
            />
        </div>
    );
}
