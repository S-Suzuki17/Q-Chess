import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundService } from './SoundService';

class TestAudio extends EventTarget {
    static instances: TestAudio[] = [];
    volume=1;loop=false;paused=true;currentTime=0;
    play=vi.fn(async()=>{this.paused=false;});
    pause=vi.fn(()=>{this.paused=true;});
    constructor(public src:string){super();TestAudio.instances.push(this);}
}
beforeEach(()=>{
    TestAudio.instances=[];vi.stubGlobal('window',{});vi.stubGlobal('Audio',TestAudio);
    vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});
    vi.stubGlobal('document',Object.assign(new EventTarget(),{hidden:false}));
});
afterEach(()=>vi.unstubAllGlobals());
describe('match introduction SE respects sound settings',()=>{
    it('plays one short sound and follows the effect volume',async()=>{
        const sound=new SoundService();sound.updateConfig({seVolume:.3});
        const stop=sound.playSE('/audio/se_match_intro.wav');
        expect(TestAudio.instances).toHaveLength(1);expect(TestAudio.instances[0].volume).toBe(.3);
        expect(TestAudio.instances[0].play).toHaveBeenCalledTimes(1);
        sound.updateConfig({seVolume:.6});expect(TestAudio.instances[0].volume).toBe(.6);
        stop();expect(TestAudio.instances[0].paused).toBe(true);
    });
    it('does not create audio while muted, at zero volume, hidden, or ad-paused',()=>{
        const sound=new SoundService();sound.updateConfig({masterMute:true});sound.playSE('/test.wav')();
        sound.updateConfig({masterMute:false,seVolume:0});sound.playSE('/test.wav')();
        sound.updateConfig({seVolume:.5});vi.stubGlobal('document',Object.assign(new EventTarget(),{hidden:true}));sound.playSE('/test.wav')();
        vi.stubGlobal('document',Object.assign(new EventTarget(),{hidden:false}));const release=sound.pauseForAd();sound.playSE('/test.wav')();release();
        expect(TestAudio.instances).toHaveLength(0);
    });
    it('stops an in-flight sound on mute or leaving the foreground',()=>{
        const sound=new SoundService();sound.playSE('/test.wav');sound.updateConfig({masterMute:true});
        expect(TestAudio.instances[0].paused).toBe(true);
        sound.updateConfig({masterMute:false});sound.playSE('/test.wav');
        Object.assign(document,{hidden:true});document.dispatchEvent(new Event('visibilitychange'));
        expect(TestAudio.instances[1].paused).toBe(true);
    });
    it('cleans up listeners when playback finishes',()=>{
        const sound=new SoundService();sound.playSE('/test.wav');const se=TestAudio.instances[0];
        se.dispatchEvent(new Event('ended'));const calls=se.pause.mock.calls.length;
        sound.updateConfig({masterMute:true});document.dispatchEvent(new Event('visibilitychange'));
        expect(se.pause).toHaveBeenCalledTimes(calls);
    });
});
