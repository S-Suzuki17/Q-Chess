/** One distinct recording per reward; titles are proper names in every locale. */
export const REWARD_TRACKS = [
    { title: 'Ivory and Wood', url: '/audio/rewards/Ivory_and_Wood.mp3' },
    { title: 'The Ivory Gambit', url: '/audio/rewards/The_Ivory_Gambit.mp3' },
    { title: 'Late Night Gambit', url: '/audio/rewards/Late_Night_Gambit.mp3' },
    { title: 'Ivory and Bamboo', url: '/audio/rewards/Ivory_and_Bamboo.mp3' },
    { title: 'The Quiet Variation', url: '/audio/rewards/The_Quiet_Variation.mp3' },
    { title: 'Calculating the King', url: '/audio/rewards/Calculating_the_King.mp3' },
    { title: 'Sunlight on the Ebony', url: '/audio/rewards/Sunlight_on_the_Ebony.mp3' },
    { title: "The Grandmaster’s Study", url: '/audio/rewards/The_Grandmaster_s_Study.mp3' },
    { title: 'The Quiet Gambit', url: '/audio/rewards/The_Quiet_Gambit.mp3' },
    { title: 'The Architect’s Gambit', url: '/audio/rewards/The_Architect_s_Gambit.mp3' },
    { title: 'Ivory and Stream', url: '/audio/rewards/Ivory_and_Stream.mp3' },
    { title: 'Rain on the Board', url: '/audio/rewards/Rain_on_the_Board.mp3' },
    { title: '盤上の幾何学', url: '/audio/rewards/Banjou_no_Kikagaku.mp3' },
    { title: 'Twelve Moves Ahead', url: '/audio/rewards/Twelve_Moves_Ahead.mp3' },
    { title: 'The Eighth Rank', url: '/audio/rewards/The_Eighth_Rank.mp3' },
] as const;

export const MATCHMAKING_MUSIC_URL = '/audio/chess.mp3';
// Preserve existing reward IDs and progression while replacing the recordings.
export const rewardTrackForTier = (tier: number) => REWARD_TRACKS[tier - 1];
export const rewardTrackTitle = (url: string) => REWARD_TRACKS.find(track => track.url === url)?.title;
