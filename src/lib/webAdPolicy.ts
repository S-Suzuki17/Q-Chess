/**
 * Fail closed during publisher review. Ownership verification uses metadata/ads.txt,
 * not an SDK on every screen. Enabling ads needs an explicit reviewed code change:
 * H5 approval, certified consent handling, child-audience treatment and QA.
 */
export const WEB_AD_RELEASE = Object.freeze({
    enabled: false, h5Approved: false, consentReady: false, childSafetyReady: false,
});
export function canRequestWebAds(pathname: string, native = false): boolean {
    const contentRoute = pathname.replace(/\/+$/, '') === '/rules';
    return WEB_AD_RELEASE.enabled && WEB_AD_RELEASE.consentReady &&
        WEB_AD_RELEASE.childSafetyReady && !native && contentRoute;
}
export function browserCanRequestWebAds(): boolean {
    if (typeof window === 'undefined') return false;
    const native = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
        .Capacitor?.isNativePlatform?.() ?? false;
    return canRequestWebAds(window.location?.pathname ?? '', native);
}
