import { championshipReward, type ChampionMusicId } from './championshipRewards';
import { rewardTrackTitle } from './musicTracks';

export const CIRCUIT_MUSIC = [
    {id:'midnight', url:'/audio/rewards/midnight.wav', boss:'nox', requiredWins:0},
    {id:'coronation', url:'/audio/rewards/coronation.wav', boss:undefined, requiredWins:1},
    {id:'astral', url:'/audio/rewards/astral.wav', boss:undefined, requiredWins:5},
    {id:'zenith', url:'/audio/rewards/zenith.wav', boss:undefined, requiredWins:10},
    {id:'valkyrie', url:'/audio/rewards/valkyrie.wav', boss:undefined, requiredWins:20},
] as const;
export type MusicReward = 'standard' | typeof CIRCUIT_MUSIC[number]['id'] | ChampionMusicId;
export const circuitMusic = (id:string) => CIRCUIT_MUSIC.find(track=>track.id===id);
export const battleMusicUrl = (id:MusicReward) => {
    const reward=championshipReward(id);
    return reward?.kind==='music'?reward.url:circuitMusic(id)?.url ?? '/audio/bgm_playing.mp3';
};
export const battleMusicTitle = (id: string) => rewardTrackTitle(battleMusicUrl(id as MusicReward));
