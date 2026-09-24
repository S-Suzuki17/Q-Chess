import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Original, deterministic synthesis: a wooden chess-piece landing, low body,
// and a restrained lower-register chord. No sampled third-party music.
const rate=44100, seconds=1.25, frames=Math.floor(rate*seconds);
const channels=[new Float64Array(frames),new Float64Array(frames)];
let seed=1741, lowNoise=0;
const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
for(let i=0;i<frames;i++){
    const t=i/rate, attack=Math.min(1,t/.006), fade=Math.min(1,(seconds-t)/.1);
    lowNoise=.88*lowNoise+.12*noise();
    const wood=(Math.sin(2*Math.PI*330*t)+.48*Math.sin(2*Math.PI*570*t)+.25*Math.sin(2*Math.PI*870*t))*Math.exp(-t*36)*.22;
    const body=Math.sin(2*Math.PI*(76*t+1.7*(1-Math.exp(-t*18))))*Math.exp(-t*13)*.3;
    const grain=lowNoise*Math.exp(-t*48)*.9;
    for(let c=0;c<2;c++){
        let chord=0;
        for(const [j,f] of [146.832,184.997,220].entries()){
            const a=Math.max(0,t-.055-j*.018), env=(1-Math.exp(-a*34))*Math.exp(-a*4.8);
            chord+=(Math.sin(2*Math.PI*f*a+(c?0.09:0))+.22*Math.sin(4*Math.PI*f*a))*env*.058;
        }
        channels[c][i]=(wood+body+grain+chord)*attack*fade;
    }
}
let peak=0;for(const channel of channels)for(const v of channel)peak=Math.max(peak,Math.abs(v));
const data=Buffer.alloc(44+frames*4);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);
data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(rate,24);
data.writeUInt32LE(rate*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(frames*4,40);
for(let i=0;i<frames;i++)for(let c=0;c<2;c++)data.writeInt16LE(Math.round(channels[c][i]/peak*.72*32767),44+(i*2+c)*2);
const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../public/audio/se_match_intro.wav');
writeFileSync(output,data);console.log(`Generated original match-intro SE: ${seconds}s, stereo ${rate}Hz, peak -2.85dBFS, ${data.length} bytes`);
