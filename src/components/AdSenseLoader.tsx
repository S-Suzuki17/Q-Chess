'use client';

import { useEffect } from 'react';
import { loadAdSense } from '../lib/adsense';

/** Load after hydration, once for the entire root layout. */
export function AdSenseLoader({ client }: { client: string }) {
    useEffect(() => {
        void loadAdSense(client);
    }, [client]);
    return null;
}
