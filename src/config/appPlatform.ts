/** One shared game, two explicitly selected distribution targets. */
export const ANDROID_BUILD = process.env.NEXT_PUBLIC_APP_TARGET === 'android';

export function platformFeatures(androidBuild: boolean, nativeAndroid: boolean) {
    const android = androidBuild || nativeAndroid;
    return { android, webContent: !android, nativeServices: nativeAndroid } as const;
}

// Distribution is deliberately disabled independently of the server setting.
export const foundersDistributionEnabled = () =>
    process.env.NEXT_PUBLIC_FOUNDERS_REWARDS_ENABLED === 'true';
