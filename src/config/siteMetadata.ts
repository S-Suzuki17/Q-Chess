import type { Metadata, Viewport } from 'next';

// Text pages may be enlarged without changing the fixed gameplay viewport.
export const informationViewport: Viewport = {
    width: 'device-width', initialScale: 1, maximumScale: 5, userScalable: true,
};
export const informationMetadata = (title: string, canonical: string): Metadata => ({
    title: `${title} | Q-Gambit`, alternates: { canonical },
});
