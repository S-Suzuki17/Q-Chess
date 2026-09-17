// Original Q-Gambit compositions. No sampled or third-party music.
// Deterministic, seamless PCM loops, authored as chord/phrase scores below.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const rate=32000;
const tracks=[
 {id:'midnight',bpm:80,chords:[[45,52,57,60,64],[41,48,53,57,60],[48,55,60,64,67],[43,50,55,59,62]],phrase:[12,7,3,7,10,7,3,0],tone:.2},
 {id:'coronation',bpm:88,chords:[[48,55,60,64,67],[43,50,55,59,62],[45,52,57,60,64],[41,48,53,57,60]],phrase:[0,4,7,12,11,7,4,7],tone:.45},
 {id:'astral',bpm:96,chords:[[38,45,50,53,57],[46,53,58,62,65],[41,48,53,57,60],[48,55,60,64,67]],phrase:[12,7,15,12,7,3,10,7],tone:.7},
 {id:'zenith',bpm:92,chords:[[43,50,55,59,62],[40,47,52,55,59],[48,55,60,64,67],[38,45,50,54,57]],phrase:[7,11,14,19,14,11,7,2],tone:.55},
 {id:'valkyrie',bpm:104,chords:[[40,47,52,55,59],[48,55,60,64,67],[43,50,55,59,62],[47,54,59,63,66]],phrase:[0,7,12,15,14,12,7,3],tone:.82},
 {id:'circuit-1',bpm:76,chords:[[38,45,50,53,57],[43,50,55,58,62],[46,53,58,62,65],[45,52,57,61,64]],phrase:[0,3,7,10,7,3,2,7],tone:.12},
 {id:'circuit-2',bpm:82,chords:[[41,48,53,57,60],[45,52,57,60,64],[38,45,50,53,57],[46,53,58,62,65]],phrase:[12,9,5,0,5,9,7,4],tone:.2},
 {id:'circuit-3',bpm:86,chords:[[43,50,55,58,62],[39,46,51,55,58],[46,53,58,62,65],[41,48,53,57,60]],phrase:[0,7,10,14,10,7,5,2],tone:.28},
 {id:'circuit-4',bpm:90,chords:[[40,47,52,56,59],[45,52,57,61,64],[42,49,54,57,61],[47,54,59,63,66]],phrase:[4,7,11,16,14,11,7,4],tone:.35},
 {id:'circuit-5',bpm:94,chords:[[36,43,48,51,55],[44,51,56,60,63],[41,48,53,56,60],[43,50,55,59,62]],phrase:[12,15,19,15,10,7,3,7],tone:.42},
 {id:'circuit-6',bpm:98,chords:[[42,49,54,57,61],[38,45,50,54,57],[45,52,57,61,64],[40,47,52,56,59]],phrase:[7,12,15,19,14,10,7,3],tone:.5},
 {id:'circuit-7',bpm:102,chords:[[46,53,58,62,65],[41,48,53,57,60],[43,50,55,58,62],[39,46,51,55,58]],phrase:[0,4,12,7,16,12,9,7],tone:.58},
 {id:'circuit-8',bpm:106,chords:[[45,52,57,60,64],[41,48,53,57,60],[38,45,50,53,57],[40,47,52,56,59]],phrase:[19,15,12,7,12,10,7,3],tone:.66},
 {id:'circuit-9',bpm:110,chords:[[47,54,59,62,66],[43,50,55,59,62],[40,47,52,55,59],[42,49,54,58,61]],phrase:[0,7,14,19,15,12,10,7],tone:.74},
 {id:'circuit-10',bpm:114,chords:[[48,55,60,64,67],[45,52,57,61,64],[41,48,53,57,60],[43,50,55,59,62]],phrase:[12,16,19,24,23,19,16,7],tone:.85},
];
const directory=resolve('public/audio/rewards');
mkdirSync(directory,{recursive:true});
for(const score of tracks) {
 const beat=60/score.bpm, duration=64*beat, length=Math.round(rate*duration);
 const dry=new Float32Array(length),mix=new Float32Array(length);
 function note(midi,start,seconds,volume,voice) {
  const hz=440*2**((midi-69)/12), offset=Math.round(start*rate);
  const count=Math.round(seconds*rate);
  for(let i=0;i<count;i++) {
   const t=i/rate, phase=2*Math.PI*hz*t;
   const attack=Math.min(1,t/(voice==='pad'?.25:.014));
   const release=Math.min(1,(seconds-t)/(voice==='pad'?.5:.18));
   const decay=voice==='pad'?.75:Math.exp(-t*(voice==='bass'?1.2:2.5));
   const fundamental=Math.sin(phase);
   const harmonic=voice==='pad'?.18*Math.sin(phase*2+.08*Math.sin(t*3)):.32*Math.sin(phase*2)+.12*Math.sin(phase*3);
   dry[(offset+i)%length]+=(fundamental+harmonic)*attack*release*decay*volume;
  }
 }
 for(let bar=0;bar<16;bar++) {
  const chord=score.chords[bar%4],start=bar*4*beat;
  chord.slice(1).forEach(midi=>note(midi,start,4.2*beat,.033,'pad'));
  note(chord[0]-12,start,2.5*beat,.13,'bass');
  note(chord[0]-12,start+2*beat,1.7*beat,.08,'bass');
  for(let step=0;step<8;step++) {
   note(chord[2]+score.phrase[(step+Math.floor(bar/4)*2)%8],start+step*.5*beat,1.3*beat,.055+score.tone*.025,'bell');
   if(score.tone>.4&&step%2===1) note(chord[1]+12,start+step*.5*beat,.8*beat,.022,'bell');
  }
  // A spacious second phrase answers the arpeggio in the latter half.
  if(bar>=8) note(chord[3]+12,start+beat,2.8*beat,.06,'bell');
 }
 const taps=[[0,1],[.1875,.18],[.375,.12],[.75,.07]];
 for(let i=0;i<length;i++) for(const[delay,gain]of taps) mix[i]+=dry[(i-Math.round(delay*beat*rate)+length)%length]*gain;
 let peak=0,sum=0;for(const value of mix){peak=Math.max(peak,Math.abs(value));sum+=value*value;}
 const gain=.72/peak,pcm=Buffer.alloc(44+length*2);
 pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);
 pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(rate,24);pcm.writeUInt32LE(rate*2,28);
 pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(length*2,40);
 for(let i=0;i<length;i++) pcm.writeInt16LE(Math.round(mix[i]*gain*32767),44+i*2);
 writeFileSync(resolve(directory,score.id+'.wav'),pcm);
 console.log(JSON.stringify({track:score.id,seconds:duration,bytes:pcm.length,peak:.72,rms:Math.sqrt(sum/length)*gain}));
}
