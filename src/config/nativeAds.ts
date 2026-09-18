export const ADMOB_UNITS={
    hint:'ca-app-pub-1116866075179199/8141474158',
    online:'ca-app-pub-1116866075179199/2288802662',
    circuit:'ca-app-pub-1116866075179199/2980646811',
} as const;
export const ADMOB_TEST_UNITS={
    hint:'ca-app-pub-3940256099942544/5224354917',
    online:'ca-app-pub-3940256099942544/5224354917',
    circuit:'ca-app-pub-3940256099942544/1033173712',
} as const;
// Deliberately opt-in: an ordinary production Web build must never enable live test impressions.
export const nativeAdsLive=()=>process.env.NEXT_PUBLIC_ADMOB_LIVE==='true';
