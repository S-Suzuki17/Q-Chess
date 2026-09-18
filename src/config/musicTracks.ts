/** User-supplied recordings; titles are proper names in every locale. */
export const REWARD_TRACKS = [
    { title: 'Ivory and Wood', url: '/audio/rewards/Ivory_and_Wood.mp3' },
    { title: 'The Ivory Gambit', url: '/audio/rewards/The_Ivory_Gambit.mp3' },
    { title: 'Late Night Gambit', url: '/audio/rewards/Late_Night_Gambit.mp3' },
] as const;

export const MATCHMAKING_MUSIC_URL = '/audio/chess.mp3';
// Preserve existing reward IDs and progression while replacing the recordings.
export const rewardTrackForTier = (tier: number) => REWARD_TRACKS[tier <= 4 ? 0 : tier <= 7 ? 1 : 2];
export const rewardTrackTitle = (url: string) => REWARD_TRACKS.find(track => track.url === url)?.title;
