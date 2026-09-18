import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {REWARD_TRACKS} from './musicTracks';
import {CIRCUIT_MUSIC,battleMusicTitle,battleMusicUrl} from './circuitMusic';
import {CHAMPIONSHIP_REWARDS} from './championshipRewards';
describe('reward recordings',()=>{
 it('maps fifteen rewards to fifteen distinct existing recordings',()=>{
  const rewards=[...CHAMPIONSHIP_REWARDS.filter(item=>item.kind==='music'),...CIRCUIT_MUSIC];
  expect(rewards).toHaveLength(15);
  expect(new Set(rewards.map(item=>item.url)).size).toBe(15);
  expect(new Set(rewards.map(item=>createHash('sha256').update(readFileSync(`public${item.url}`)).digest('hex'))).size).toBe(15);
  for(const reward of rewards){expect(battleMusicUrl(reward.id)).toBe(reward.url);expect(battleMusicTitle(reward.id)).toBeTruthy();}
 });
 it('preserves existing unlock IDs while replacing four remaining recordings',()=>{
  expect(battleMusicTitle('champion-music-087')).toBe('The Quiet Gambit');
  expect(battleMusicTitle('champion-music-097')).toBe('The Architect’s Gambit');
  expect(battleMusicTitle('midnight')).toBe('Ivory and Stream');
  expect(battleMusicTitle('coronation')).toBe('Rain on the Board');
  expect(REWARD_TRACKS.filter(track=>track.url.endsWith('.mp3'))).toHaveLength(12);
  expect(REWARD_TRACKS.filter(track=>track.url.endsWith('.wav'))).toHaveLength(3);
 });
});
