import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {PUBLIC_SUPPORT_EMAIL} from './publicContact';
import {CHAMPIONSHIP_REWARDS,championshipReward} from './championshipRewards';
import {LANGUAGES} from '../locales/dict';
import {championshipName} from '../locales/championshipText';
import {circuitText} from '../locales/circuitText';
import {cosmeticLabelCount} from '../locales/cosmeticNames';
import {siteCopy} from '../locales/siteContent';
import {WEB_AD_RELEASE,canRequestWebAds} from '../lib/webAdPolicy';
import {AD_POLICY} from '../lib/adPolicy';
import {loadAdSense} from '../lib/adsense';
import {AdBanner,InterstitialAd} from '../components/AdBanner';

afterEach(()=>vi.unstubAllGlobals());
describe('review-safe public release',()=>{
 it('keeps all advertisements and quotas off, including native paths',async()=>{
  expect(Object.values(WEB_AD_RELEASE).every(value=>value===false)).toBe(true);
  expect(Object.values(AD_POLICY).every(value=>value===false)).toBe(true);
  for(const pathname of ['/','/rules','/rules/','/updates/','/contact/','/privacy/','/about/','/teaser/']){
   for(const native of [true,false]){
    expect(canRequestWebAds(pathname,native)).toBe(false);
    const createElementSpy=vi.fn(()=>{throw new Error('Ad SDK must not be created');});
    vi.stubGlobal('window',{location:{pathname},Capacitor:{isNativePlatform:()=>native}});
    vi.stubGlobal('document',{createElement:createElementSpy});
    expect(await loadAdSense('ca-pub-1116866075179199')).toBeNull();
    expect(createElementSpy).not.toHaveBeenCalled();
   }
  }
  expect(renderToStaticMarkup(createElement(AdBanner,{adSlot:'123456'}))).toBe('');
  expect(renderToStaticMarkup(createElement(InterstitialAd,{show:true,onClose:()=>{},adSlot:'123456'}))).toBe('');
 });
 it('does not place display advertisements on gameplay or navigation screens',()=>{
  for(const file of ['src/app/layout.tsx','src/app/page.tsx','src/app/rules/page.tsx','src/app/updates/page.tsx','src/components/LocalGameBoard.tsx','src/components/OnlineGameBoard.tsx','src/components/DevDiaryTimeline.tsx']){
   expect(readFileSync(file,'utf8'),file).not.toMatch(/<AdBanner\b|<AdSenseLoader\b/);
  }
 });
 it('uses one public support address without changing private account credentials',()=>{
  expect(PUBLIC_SUPPORT_EMAIL).toBe('qgambit970@gmail.com');
  function scan(dir:string){for(const entry of readdirSync(dir,{withFileTypes:true})){
   const path=join(dir,entry.name);if(entry.isDirectory())scan(path);
   else if(/\.(tsx?|html|json|txt|xml|md)$/i.test(path)){
    for(const email of readFileSync(path,'utf8').match(/[\w.%+-]+@gmail\.com/gi)??[])expect(email,path).toBe(PUBLIC_SUPPORT_EMAIL);
   }
  }}
  scan('src');scan('public');
  for(const file of ['src/components/SiteInformation.tsx','src/app/privacy/page.tsx','src/app/rules/page.tsx'])expect(readFileSync(file,'utf8')).toContain('mailto:${PUBLIC_SUPPORT_EMAIL}');
 });
 it('keeps reward IDs stable and readable labels complete in all 12 languages',()=>{
  expect(CHAMPIONSHIP_REWARDS).toHaveLength(100);
  for(const {code} of LANGUAGES){
   expect(cosmeticLabelCount(code)).toBe(24);
   const labels=CHAMPIONSHIP_REWARDS.map(reward=>championshipName(code,reward));
   expect(new Set(labels).size,code).toBe(100);
   expect(labels.every(label=>Boolean(label)&&!label.includes('undefined'))).toBe(true);
   expect(circuitText(code,'astral')).toBe('盤上の幾何学');
   expect(siteCopy(code).paragraphs).toHaveLength(4);
   expect(siteCopy(code).labels).toHaveLength(9);
  }
  for(const reward of CHAMPIONSHIP_REWARDS)expect(championshipReward(reward.id)?.requiredWins).toBe(reward.requiredWins);
 });
});
