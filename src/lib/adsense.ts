import {Capacitor} from '@capacitor/core';
import { browserCanRequestWebAds } from './webAdPolicy';
type AdSenseApi = { push: (request: Record<string, never>) => unknown };
type AdSenseWindow = Window & { adsbygoogle?: AdSenseApi };

const SDK_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
let sdkPromise: Promise<AdSenseApi | null> | undefined;
const requestedSlots = new WeakSet<HTMLElement>();

export function isAdSenseUnitConfigured(client: string | undefined, slot: string | undefined): boolean {
    return /^ca-pub-\d{16}$/.test(client ?? '') && /^\d+$/.test(slot ?? '');
}

/** One SDK load per document, including Strict Mode replays and client navigation. */
export function loadAdSense(client: string): Promise<AdSenseApi | null> {
    if (!browserCanRequestWebAds()) return Promise.resolve(null);
    if (Capacitor.isNativePlatform() || typeof window === 'undefined' || typeof document === 'undefined' || !/^ca-pub-\d{16}$/.test(client)) {
        return Promise.resolve(null);
    }
    if (sdkPromise) return sdkPromise;

    sdkPromise = new Promise((resolve) => {
        // Google validates data-* attributes on its SDK script. next/script adds
        // data-nscript, so this one integration uses Google's exact async tag.
        // Auto ads are configured by the client URL / AdSense dashboard; do not
        // send a second, legacy enable_page_level_ads request.
        const script = document.createElement('script');
        script.async = true;
        script.src = `${SDK_URL}?client=${encodeURIComponent(client)}`;
        script.crossOrigin = 'anonymous';
        const finish = (api: AdSenseApi | null) => {
            script.removeEventListener('load', onLoad);
            script.removeEventListener('error', onError);
            resolve(api);
        };
        const onLoad = () => {
            const api = (window as AdSenseWindow).adsbygoogle;
            if (!api || typeof api.push !== 'function') {
                console.error('AdSense SDK loaded without an available ad API.');
                finish(null);
                return;
            }
            finish(api);
        };
        const onError = () => {
            console.error('AdSense SDK could not be loaded. Ads were not initialized.');
            finish(null);
        };
        script.addEventListener('load', onLoad);
        script.addEventListener('error', onError);
        document.head.appendChild(script);
    });
    return sdkPromise;
}

/** Request an attached, measurable slot once; never claim it has been filled. */
export function mountAdSenseUnit(element: HTMLElement, client: string): () => void {
    let cancelled = false;
    let api: AdSenseApi | null = null;
    let observer: ResizeObserver | undefined;

    const stopObserving = () => {
        observer?.disconnect();
        window.removeEventListener('resize', request);
    };
    const request = () => {
        if (cancelled || !api || !browserCanRequestWebAds()) return;
        if (requestedSlots.has(element) || element.hasAttribute('data-adsbygoogle-status')) {
            stopObserving();
            return;
        }
        if (!element.isConnected || element.getBoundingClientRect().width <= 0) return;
        requestedSlots.add(element);
        try {
            api.push({});
        } catch (error) {
            // A failed push is not a successful request; a later remount may retry.
            requestedSlots.delete(element);
            console.error('AdSense ad unit initialization failed:', error);
        }
        stopObserving();
    };

    if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(request);
        observer.observe(element);
    } else {
        window.addEventListener('resize', request);
    }
    void loadAdSense(client).then((loadedApi) => {
        if (cancelled) return;
        api = loadedApi;
        if (api) request();
        else stopObserving();
    });

    return () => {
        cancelled = true;
        stopObserving();
    };
}
