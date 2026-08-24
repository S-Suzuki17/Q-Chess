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
    
    private config: SoundConfig = {
        bgmVolume: 0.5,
        seVolume: 0.7,
        masterMute: false
    };

    constructor() {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('qg_sound_config');
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
            localStorage.setItem('qg_sound_config', JSON.stringify(this.config));
        }
        
        if (this.bgmAudio) {
            this.bgmAudio.volume = this.config.bgmVolume;
            if (this.config.masterMute || this.config.bgmVolume === 0) {
                if (this.playPromise !== undefined) {
                    this.playPromise.then(() => {
                        this.bgmAudio?.pause();
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
            if (!this.config.masterMute && this.config.bgmVolume > 0 && this.bgmAudio.paused) {
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
        
        if (!this.config.masterMute && this.config.bgmVolume > 0) {
            this.playPromise = this.bgmAudio.play();
            this.playPromise.catch(e => console.log('Audio play failed:', e));
        }
    }

    public stopBGM() {
        if (this.bgmAudio) {
            const audio = this.bgmAudio;
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
    }

    public playSE(trackUrl: string) {
        if (this.config.masterMute || this.config.seVolume === 0 || typeof window === 'undefined') return;
        const se = new Audio(trackUrl);
        se.volume = this.config.seVolume;
        se.play().catch(e => console.log('SE play failed:', e));
    }
}

export const soundManager = new SoundService();
