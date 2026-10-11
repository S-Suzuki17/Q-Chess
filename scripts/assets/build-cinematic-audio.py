"""Synthesize a quiet original 3-second reveal cue; no sampled third-party audio.
Generated sound must use the game's existing sound setting and browser audio unlock.
"""
import math, wave, os
import numpy as np
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
sr=48000;n=3*sr;t=np.arange(n)/sr;rng=np.random.default_rng(4701);s=np.zeros(n)
# Brief airy approach and soft descending impact.
u=np.maximum(t-.08,0);s+=.017*rng.standard_normal(n)*np.sin(np.minimum(u/.40,1)*math.pi/2)**2*np.exp(-u*7)*(t>=.08)
u=np.maximum(t-.42,0);s+=.075*np.sin(2*math.pi*(62*u-14*u*u))*np.exp(-u*10)*(t>=.42)
# Original restrained bell chord, spread over the reward reveal.
for f,start,amp in [(261.63,.45,.054),(392,.52,.045),(523.25,.60,.04),(659.26,.69,.031),(783.99,.8,.024)]:
 u=np.maximum(t-start,0);env=(1-np.exp(-u*110))*np.exp(-u*2.35)*(t>=start)
 bell=np.sin(2*math.pi*f*u)+.23*np.sin(2*math.pi*f*2.76*u)*np.exp(-u*4)+.08*np.sin(2*math.pi*f*4.1*u)*np.exp(-u*9)
 s+=amp*env*bell
fade=np.minimum(t/.02,1)*np.minimum((3-t)/.15,1);s*=fade
s=np.clip(s,-.6,.6);pcm=(s*32767).astype('<i2')
out=os.path.join(ROOT,'scratch/cinematic/crown-reveal.wav');os.makedirs(os.path.dirname(out),exist_ok=True)
with wave.open(out,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes(pcm.tobytes())
print(out, 'duration=3.0s', 'peak_dbfs=%.2f'%(20*np.log10(np.max(np.abs(s)))))
