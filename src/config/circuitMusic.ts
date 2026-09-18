import { championshipReward, type ChampionMusicId } from './championshipRewards';
import { REWARD_TRACKS, rewardTrackTitle } from './musicTracks';

export const CIRCUIT_MUSIC = [
    {id:'midnight', url:REWARD_TRACKS[2].url, boss:'nox', requiredWins:0},
    {id:'coronation', url:REWARD_TRACKS[0].url, boss:undefined, requiredWins:1},
    {id:'astral', url:REWARD_TRACKS[1].url, boss:undefined, requiredWins:5},
    {id:'zenith', url:REWARD_TRACKS[1].url, boss:undefined, requiredWins:10},
    {id:'valkyrie', url:REWARD_TRACKS[2].url, boss:undefined, requiredWins:20},
] as const;
export type MusicReward = 'standard' | typeof CIRCUIT_MUSIC[number]['id'] | ChampionMusicId;
export const circuitMusic = (id:string) => CIRCUIT_MUSIC.find(track=>track.id===id);
export const battleMusicUrl = (id:MusicReward) => {
    const reward=championshipReward(id);
    return reward?.kind==='music'?reward.url:circuitMusic(id)?.url ?? '/audio/bgm_playing.mp3';
};
export const battleMusicTitle = (id: string) => rewardTrackTitle(battleMusicUrl(id as MusicReward));
