import { describe,it,expect } from 'vitest';
import { BOSSES,emptyCampaign,finishBoss,equipReward,outcomeStars,parseCampaign,rewardUnlocked } from './campaign';
import { CIRCUIT_MUSIC,battleMusicUrl } from './circuitMusic';
import { LANGUAGES } from '../locales/dict';
import { campaignText } from '../locales/campaignText';
import { circuitText } from '../locales/circuitText';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CHAMPIONSHIP_REWARDS } from './championshipRewards';
import { MATCHMAKING_MUSIC_URL, REWARD_TRACKS } from './musicTracks';
const win={won:true,draw:false,playerMoves:99,hintsUsed:0,initialSeconds:600,remainingSeconds:300};
describe('Crown Circuit clock stars and music',()=>{
 it('awards the time star at exactly half; never from move count',()=>{
  expect(outcomeStars(win)).toBe(3);
  expect(outcomeStars({...win,playerMoves:1,remainingSeconds:299})).toBe(2);
  expect(outcomeStars({...win,hintsUsed:1})).toBe(2);
  expect(outcomeStars({...win,hintsUsed:1,remainingSeconds:0})).toBe(1);
  expect(outcomeStars({...win,won:false})).toBe(0);
  expect(outcomeStars({...win,draw:true})).toBe(0);
  for(const time of [NaN,Infinity,-1,601]) expect(outcomeStars({...win,remainingSeconds:time})).toBe(2);
  expect(outcomeStars({...win,initialSeconds:0})).toBe(2);
 });
 it('keeps old medals and equips only earned music without replacing visual rewards',()=>{
  let progress=parseCampaign(JSON.stringify({version:1,stars:{nox:3},board:'slate'}));
  expect(progress.music).toBe('standard');
  expect(finishBoss(progress,'nox',{...win,remainingSeconds:1,hintsUsed:1}).stars.nox).toBe(3);
  expect(equipReward(progress,'music','coronation')).toBe(progress);
  expect(equipReward(progress,'piece','midnight')).toBe(progress);
  progress=equipReward(progress,'music','midnight');
  expect(progress.music).toBe('midnight');
  expect(progress.board).toBe('slate');
  expect(parseCampaign(JSON.stringify(progress))).toEqual(progress);
  for(let lap=1;lap<=5;lap++) {
   for(const boss of BOSSES) progress=finishBoss(progress,boss.id,win,lap);
   expect(rewardUnlocked(progress,'coronation')).toBe(true);
   expect(rewardUnlocked(progress,'astral')).toBe(lap>=5);
  }
  expect(equipReward(progress,'music','astral').music).toBe('astral');
  expect(equipReward(progress,'music','unknown')).toBe(progress);
 });
 it.each(LANGUAGES.map(item=>item.code))('has new copy and no move-count medal in %s',lang=>{
  expect(campaignText(lang,'title')).toBeTruthy();
  expect(campaignText(lang,'quick')).not.toMatch(/20/);
  for(const key of ['preview','previewOnly','music','timeLeft','midnight','coronation','astral'] as const) expect(circuitText(lang,key)).toBeTruthy();
 });
 it('ships fifteen different reward recordings, including eight supplied MP3s',()=>{
  const tracks=[...CIRCUIT_MUSIC,...CHAMPIONSHIP_REWARDS.filter(reward=>reward.kind==='music')];
  expect(new Set(tracks.map(track=>track.url))).toEqual(new Set(REWARD_TRACKS.map(track=>track.url)));
  expect(tracks).toHaveLength(15);
  expect(new Set(tracks.map(track=>track.url)).size).toBe(15);
  expect(tracks.filter(track=>track.url.endsWith('.mp3'))).toHaveLength(8);
  const headers=REWARD_TRACKS.map(track=>{
   const data=readFileSync('public'+track.url);
   if(track.url.endsWith('.mp3')) {
    expect(data.subarray(0,3).toString()==='ID3'||(data[0]===0xff&&(data[1]&0xe0)===0xe0)).toBe(true);
   } else {
    expect(data.subarray(0,4).toString()).toBe('RIFF');
    expect(data.readUInt32LE(40)).toBeGreaterThan(0);
   }
   expect(data.length).toBeGreaterThan(2_000_000);
   return createHash('sha256').update(data).digest('hex');
  });
  expect(new Set(headers).size).toBe(15);
  expect(readFileSync('public'+MATCHMAKING_MUSIC_URL).length).toBeGreaterThan(1_000_000);
  expect(battleMusicUrl('standard')).toBe('/audio/bgm_playing.mp3');
 });
});
