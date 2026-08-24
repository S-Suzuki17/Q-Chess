import { useEffect, useRef, useState, useCallback } from 'react';

// React Strict Mode による再レンダリングでバッファが破棄されるのを防ぐためのグローバルキャッシュ
let globalAudioBuffer: AudioBuffer | null = null;
let globalSlices: {start: number, end: number}[] = [];

export function usePieceSound(audioUrl: string) {
    const contextRef = useRef<AudioContext | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let isMounted = true;
        
        const initContext = () => {
            if (!contextRef.current) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioContextClass) {
                    contextRef.current = new AudioContextClass();
                }
            }
            return contextRef.current;
        };

        const loadAudio = async () => {
            try {
                const ctx = initContext();
                if (!ctx) return;

                // すでにキャッシュがある場合は再ロードしない
                if (!globalAudioBuffer) {
                    const response = await fetch(audioUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                    globalAudioBuffer = audioBuffer;

                    // --- オートスライサーロジック ---
                    const channelData = audioBuffer.getChannelData(0);
                    const sampleRate = audioBuffer.sampleRate;
                    // しきい値を 5% から 2% に下げて、音量が小さいファイルにも対応
                    const threshold = 0.02; 
                    const minSilenceLen = sampleRate * 0.15;
                    
                    const slices: {start: number, end: number}[] = [];
                    let isPlaying = false;
                    let startSample = 0;
                    let silenceCounter = 0;

                    for (let i = 0; i < channelData.length; i++) {
                        if (Math.abs(channelData[i]) > threshold) {
                            if (!isPlaying) {
                                isPlaying = true;
                                startSample = Math.max(0, i - Math.floor(sampleRate * 0.02));
                            }
                            silenceCounter = 0;
                        } else {
                            if (isPlaying) {
                                silenceCounter++;
                                if (silenceCounter > minSilenceLen) {
                                    isPlaying = false;
                                    const endSample = Math.min(channelData.length, i - silenceCounter + Math.floor(sampleRate * 0.1));
                                    if ((endSample - startSample) / sampleRate > 0.05) {
                                        slices.push({ start: startSample / sampleRate, end: endSample / sampleRate });
                                    }
                                }
                            }
                        }
                    }
                    
                    if (isPlaying) {
                        slices.push({ start: startSample / sampleRate, end: channelData.length / sampleRate });
                    }

                    globalSlices = slices.length > 0 ? slices : [{start: 0, end: audioBuffer.duration}];
                    console.log(`[AudioSplitter] Successfully loaded and sliced into ${globalSlices.length} pieces.`);
                }
                
                if (isMounted) setIsReady(true);
            } catch (e) {
                console.error('Audio load error:', e);
            }
        };

        loadAudio();

        return () => {
            isMounted = false;
            // 注意: 開発環境ではcontextをここでcloseすると2回目のマウント時に音が鳴らなくなるため維持する
        };
    }, [audioUrl]);

    // useCallback を使って再レンダリング時も関数参照を維持
    const playRandom = useCallback(async () => {
        if (!contextRef.current || !globalAudioBuffer || globalSlices.length === 0) {
            console.warn("Audio is not ready yet or slices are empty.");
            return;
        }
        
        try {
            // ブラウザの自動再生ブロックを確実に解除する（awaitが必須）
            if (contextRef.current.state === 'suspended') {
                await contextRef.current.resume();
            }

            const slice = globalSlices[Math.floor(Math.random() * globalSlices.length)];
            
            const source = contextRef.current.createBufferSource();
            source.buffer = globalAudioBuffer;
            source.connect(contextRef.current.destination);
            
            const duration = slice.end - slice.start;
            source.start(0, slice.start, duration);
        } catch (e) {
            console.error("Audio play error:", e);
        }
    }, []);

    return { playRandom, isReady };
}
