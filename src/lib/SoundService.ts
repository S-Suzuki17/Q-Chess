export interface SoundConfig {
    bgmVolume: number;
    seVolume: number;
    masterMute: boolean;
}

export class SoundService {
    private bgmAudio: HTMLAudioElement | null = null;
    private currentTrack: string | null = null;
    private listeners: Set<(config: SoundConfig) => void> = new Set();
    private playPromise: Promise<void> | undefined;
    private adPauses=0;

    /** Temporary ad focus; never overwrites the user's saved mute preference. */
    public pauseForAd() {
        this.adPauses++;this.bgmAudio?.pause();
        let released=false;
        return()=>{if(released)return;released=true;this.adPauses=Math.max(0,this.adPauses-1);this.resumeBGM();};
    }
    
    private config: SoundConfig = {
        bgmVolume: 0.5,
        seVolume: 0.7,
        masterMute: false
    };

    constructor() {
        if (typeof window !== 'undefined') {
            let saved:string|null=null;
            try { saved=localStorage.getItem('qg_sound_config'); } catch { /* Session audio works without storage. */ }
            if (saved) {
                try {
                    this.config = JSON.parse(saved);
                } catch(e) {}
            }
        }
    }

    public getConfig() {
        return { ...this.config };
    }

    public updateConfig(newConfig: Partial<SoundConfig>) {
        this.config = { ...this.config, ...newConfig };
        if (typeof window !== 'undefined') {
            try { localStorage.setItem('qg_sound_config', JSON.stringify(this.config)); } catch { /* Keep session settings. */ }
        }
        
        if (this.bgmAudio) {
            this.bgmAudio.volume = this.config.bgmVolume;
            if (this.adPauses || this.config.masterMute || this.config.bgmVolume === 0) {
                if (this.playPromise !== undefined) {
                    const audio=this.bgmAudio;
                    this.playPromise.then(() => {
                        if (this.adPauses || audio!==this.bgmAudio || this.config.masterMute || this.config.bgmVolume===0) audio.pause();
                    }).catch(() => {});
                } else {
                    this.bgmAudio.pause();
                }
            } else if (this.bgmAudio.paused) {
                this.playPromise = this.bgmAudio.play();
                this.playPromise.catch(() => {});
            }
        }

        this.notifyListeners();
    }

    public subscribe(listener: (config: SoundConfig) => void) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private notifyListeners() {
        const c = this.getConfig();
        this.listeners.forEach(l => l(c));
    }

    public playBGM(trackUrl: string) {
        if (typeof window === 'undefined') return;

        if (this.currentTrack === trackUrl && this.bgmAudio) {
            if (!this.adPauses && !this.config.masterMute && this.config.bgmVolume > 0 && this.bgmAudio.paused) {
                this.playPromise = this.bgmAudio.play();
                this.playPromise.catch(e => console.log(e));
            }
            return;
        }

        this.stopBGM();
        this.currentTrack = trackUrl;
        
        this.bgmAudio = new Audio(trackUrl);
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = this.config.bgmVolume;
        
        if (!this.adPauses && !this.config.masterMute && this.config.bgmVolume > 0) {
            this.playPromise = this.bgmAudio.play();
            this.playPromise.catch(e => console.log('Audio play failed:', e));
        }
    }

    public stopBGM() {
        if (this.bgmAudio) {
            const audio = this.bgmAudio;
            audio.pause();
            if (this.playPromise !== undefined) {
                this.playPromise.then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                }).catch(() => {});
            } else {
                audio.pause();
                audio.currentTime = 0;
            }
            this.bgmAudio = null;
        }
        this.currentTrack = null;
        this.playPromise=undefined;
    }

    /** Retry after user activation and pause while the app is hidden. */
    public resumeBGM() {
        if (!this.bgmAudio) return;
        if (this.adPauses || document.hidden || this.config.masterMute || this.config.bgmVolume===0) {
            this.bgmAudio.pause();
            return;
        }
        const audio=this.bgmAudio;
        if (!audio.paused) return;
        this.playPromise=audio.play();
        this.playPromise.then(()=>{
            if (this.adPauses || audio!==this.bgmAudio || document.hidden || this.config.masterMute || this.config.bgmVolume===0) audio.pause();
        }).catch(()=>{ /* A later user gesture can retry autoplay. */ });
    }

    public playSE(trackUrl: string): () => void {
        if (this.adPauses || this.config.masterMute || this.config.seVolume === 0 || typeof window === 'undefined' || document.hidden) return () => {};
        const se = new Audio(trackUrl);
        se.volume = this.config.seVolume;
        let stopped = false;
        const stop = () => {
            if (stopped) return;
            stopped = true;se.pause();unsubscribe();
            se.removeEventListener('ended', stop);se.removeEventListener('error', stop);
            document.removeEventListener('visibilitychange', onVisibility);
        };
        const onVisibility = () => { if (document.hidden) stop(); };
        const unsubscribe = this.subscribe(config => {
            if (config.masterMute || config.seVolume === 0) stop();
            else se.volume = config.seVolume;
        });
        se.addEventListener('ended', stop);se.addEventListener('error', stop);
        document.addEventListener('visibilitychange', onVisibility);
        se.play().then(() => { if (stopped) se.pause(); }).catch(stop);
        return stop;
    }
}

export const soundManager = new SoundService();
