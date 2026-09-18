import { championshipReward, type ChampionMusicId } from './championshipRewards';
import { rewardTrackTitle } from './musicTracks';

export const CIRCUIT_MUSIC = [
    {id:'midnight', url:'/audio/rewards/Ivory_and_Stream.mp3', requiredStars:30, boss:'nox', requiredWins:0},
    {id:'coronation', url:'/audio/rewards/Rain_on_the_Board.mp3', requiredStars:75, boss:undefined, requiredWins:1},
    {id:'astral', url:'/audio/rewards/Banjou_no_Kikagaku.mp3', requiredStars:120, boss:undefined, requiredWins:5},
    {id:'zenith', url:'/audio/rewards/Twelve_Moves_Ahead.mp3', requiredStars:180, boss:undefined, requiredWins:10},
    {id:'valkyrie', url:'/audio/rewards/The_Eighth_Rank.mp3', requiredStars:240, boss:undefined, requiredWins:20},
] as const;
export type MusicReward = 'standard' | typeof CIRCUIT_MUSIC[number]['id'] | ChampionMusicId;
export const circuitMusic = (id:string) => CIRCUIT_MUSIC.find(track=>track.id===id);
export const battleMusicUrl = (id:MusicReward) => {
    const reward=championshipReward(id);
    return reward?.kind==='music'?reward.url:circuitMusic(id)?.url ?? '/audio/bgm_playing.mp3';
};
export const battleMusicTitle = (id: string) => rewardTrackTitle(battleMusicUrl(id as MusicReward));
