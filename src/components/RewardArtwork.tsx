import { useId } from 'react';
import type { ChampionBoard, ChampionEffect, EffectMotif } from '../config/championshipRewards';
import { rewardFrameParts } from './rewardCraft';
import { championshipReward } from '../config/championshipRewards';
import { rewardPiece, type PieceFinish } from '../config/campaign';

/** Purpose-drawn vector insignia, shared by the catalogue and the actual effect.
 * No font glyphs: the silhouette is identical across languages and devices. */
export function RewardSigil({motif,tier}:{motif:EffectMotif;tier:number}) {
    return <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" focusable="false" className="reward-sigil">
        <g stroke="currentColor" strokeWidth="1.25" strokeLinejoin="miter">
            {motif==='rings' && <>
                <circle cx="100" cy="100" r="48"/><ellipse cx="100" cy="100" rx="65" ry="24" transform="rotate(-35 100 100)"/>
                <path d="M100 70 116 100 100 130 84 100Z"/><path d="M100 70V130M84 100H116" opacity=".6"/>
                {tier>=3 && <ellipse cx="100" cy="100" rx="65" ry="24" transform="rotate(35 100 100)"/>}
                <circle cx="144" cy="65" r="4" fill="var(--fx-accent,currentColor)"/>
            </>}
            {motif==='shards' && <>
                <path d="m100 40 32 48-12 50-20 21-20-21-12-50Z"/><path d="m100 40-12 53 12 66 12-66Zm-32 48 20 5 12-53 12 53 20-5M80 138l20-23 20 23"/>
                {tier>=3 && <><path d="m59 67-15 40 27 27-7-34Zm82 0 15 40-27 27 7-34Z"/><path d="m44 107 20-7 7 34m85-27-20-7-7 34" opacity=".55"/></>}
            </>}
            {motif==='starfall' && <>
                <path d="m114 69 7 21 21 7-21 7-7 21-7-21-21-7 21-7Z" fill="currentColor" fillOpacity=".1"/>
                <path d="m109 47 28-21M139 70l33-25M74 112l-43 42M88 129l-21 30"/>
                <path d="m49 84 16-27 28 1M67 141l31 12 47-34" opacity=".4"/>
                {[ [49,84],[65,57],[93,58],[67,141],[98,153],[145,119] ].slice(0,tier+2).map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="currentColor"/>)}
            </>}
            {motif==='corona' && <>
                <path d="m59 87 20 12 21-30 21 30 20-12-10 44H69Z" fill="currentColor" fillOpacity=".09"/>
                <path d="M69 131h62v9H69ZM77 122l-4-15m54 0-4 15M100 95v25M88 113h24"/>
                <path d="m100 40 6 12-6 12-6-12Z" fill="var(--fx-accent,currentColor)"/>
                {tier>=3 && <path d="M69 149C40 134 36 101 49 78m82 71c29-15 33-48 20-71"/>}
                {tier>=5 && [-1,1].map(side=><g key={side} transform={side===1?'translate(200 0) scale(-1 1)':undefined}>
                    <path d="M47 94q-16-5-12-20 15 5 12 20Zm-3 19q-17-3-17-18 16 2 17 18Zm6 17q-18 1-22-13 16-2 22 13Zm10 15q-17 6-25-7 15-6 25 7Z" fill="currentColor" fillOpacity=".22"/>
                </g>)}
            </>}
            {tier>=2 && <path d="M87 22h26M87 178h26" opacity=".5"/>}
            {tier>=4 && <path d="M35 55 25 65v20m140-30 10 10v20M25 115v20l10 10m140-30v20l-10 10" opacity=".45"/>}
            {tier>=6 && <circle cx="100" cy="100" r="79" strokeDasharray="1 10" opacity=".6"/>}
            {tier>=7 && <path d="M60 30A81 81 0 0 1 140 30M60 170a81 81 0 0 0 80 0" opacity=".65"/>}
            {tier>=8 && <path d="m20 100 5-6 5 6-5 6Zm150 0 5-6 5 6-5 6Z" fill="currentColor"/>}
            {tier>=9 && <circle cx="100" cy="100" r="87" strokeWidth=".6" opacity=".5"/>}
            {tier===10 && <path d="m100 9 4 6-4 6-4-6Zm0 170 4 6-4 6-4-6Z" fill="var(--fx-accent,currentColor)"/>}
        </g>
    </svg>;
}

/** Lightweight catalogue projection of the real 8×8 board. Frame inlays use
 * the same fabrication geometry as WebGL; no ten simultaneous canvases. */
export function BoardRewardArtwork({preset}:{preset:ChampionBoard}) {
    const id=useId();
    return <svg viewBox="0 0 320 220" className="reward-board-art" aria-hidden="true" focusable="false">
        <defs>
            <linearGradient id={`${id}-light`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#fff" stopOpacity=".13"/><stop offset=".45" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".18"/></linearGradient>
            <pattern id={`${id}-grain`} width=".4" height=".7" patternUnits="userSpaceOnUse">
                {preset.motif==='walnut'||preset.motif==='gold'?<path d="M.06 0Q.16.3.06.7M.24 0Q.32.4.24.7" fill="none" stroke="#fff" strokeWidth=".018" opacity=".15"/>
                :preset.motif==='marble'||preset.motif==='crystal'?<path d="M0 .1.1.2.2.18.4.4M.1.2.05.35" fill="none" stroke="#fff" strokeWidth=".018" opacity=".12"/>
                :<path d="M0 .2H.4M0 .4H.4M0 .6H.4" stroke="#fff" strokeWidth=".008" opacity=".1"/>}
            </pattern>
        </defs>
        <ellipse cx="160" cy="172" rx="118" ry="18" fill="#000" opacity=".22"/>
        <path d="M18.4 102 160 153.3 301.6 102v13L160 166.3 18.4 115Z" fill={preset.frameColor}/>
        <path d="m18.4 109 141.6 51.3L301.6 109" fill="none" stroke={preset.rim} strokeWidth="1.2"/>
        <path d="M160 153.3 301.6 102v13L160 166.3Z" fill="#000" opacity=".25"/>
        <g transform="matrix(16 5.8 -16 5.8 160 102)">
            <rect x="-4.425" y="-4.425" width="8.85" height="8.85" rx=".04" fill={preset.frameColor} stroke={preset.rim} strokeWidth=".025"/>
            {Array.from({length:64},(_,index)=><rect key={index} x={index%8-4} y={Math.floor(index/8)-4} width="1" height="1" fill={(Math.floor(index/8)+index)%2?preset.dark:preset.light}/>)}
            <rect x="-4.4" y="-4.4" width="8.8" height="8.8" fill={`url(#${id}-grain)`}/>
            {rewardFrameParts(preset).map((part,i)=><rect key={i} x={part.position[0]-part.size[0]/2} y={part.position[2]-part.size[2]/2} width={part.size[0]} height={part.size[2]} fill={preset[part.finish]} transform={`rotate(${part.rotation*180/Math.PI} ${part.position[0]} ${part.position[2]})`}/>)}
            <rect x="-4.4" y="-4.4" width="8.8" height="8.8" fill={`url(#${id}-light)`}/>
        </g>
    </svg>;
}

export function EffectRewardArtwork({preset}:{preset:ChampionEffect}) {
    return <div className={`reward-effect-art reward-effect-art-${preset.motif}`} style={{color:preset.color}}><RewardSigil motif={preset.motif} tier={preset.tier}/></div>;
}

/** Turned profiles, drawn rather than font-dependent chess glyphs. */
export function PieceRewardArtwork({finish,tier=1}:{finish:PieceFinish;tier?:number}) {
    const id=useId(),surface=rewardPiece(finish),preset=championshipReward(finish);
    const form=preset?.kind==='piece'?preset.form:'staunton';
    const stem=form==='spire'?'M-29 155Q-30 146-21 143L-14 138Q-3 110-5 89H5Q3 110 14 138L21 143Q30 146 29 155Z':form==='citadel'?'M-29 155V144L-23 139-19 94-12 89H12L19 94 23 139 29 144V155Z':form==='faceted'?'M-29 155-24 144-9 112-16 89H16L9 112 24 144 29 155Z':'M-29 155Q-30 146-21 143L-17 138Q-8 111-10 89H10Q8 111 17 138L21 143Q30 146 29 155Z';
    return <svg viewBox="0 0 320 220" className="reward-board-art" aria-hidden="true" focusable="false">
        <defs>{[surface.black,surface.white].map((color,i)=><linearGradient id={`${id}-${i}`} key={i}>
            <stop stopColor={color}/><stop offset=".35" stopColor={color}/><stop offset=".5" stopColor="#eee3c9" stopOpacity=".8"/><stop offset=".7" stopColor={color}/><stop offset="1" stopColor="#13191c"/>
        </linearGradient>)}</defs>
        <ellipse cx="160" cy="186" rx="90" ry="13" fill="#000" opacity=".25"/>
        {[0,1].map(i=><g key={i} transform={`translate(${i?177:100} ${i?2:16}) scale(${i?1:.88})`} stroke={i?'#b9ab86':'#526168'} strokeWidth="1">
            <path d={`M-36 177Q-39 172-33 166L-29 156H29L33 166Q39 172 36 177Z${stem}M-19 88V79H19V88ZM-16 78-23 52-11 62 0 43 11 62 23 52 16 78Z`} fill={`url(#${id}-${i})`}/>
            {form==='fluted'&&[-9,-3,3,9].map(x=><path key={x} d={`M${x} 92v46`} strokeWidth="2" opacity=".65"/>)}
            {form==='crowned'&&[104,117,130].map(y=><path key={y} d={`M-15 ${y}h30v5h-30Z`} fill={`url(#${id}-${i})`}/>)}
            <circle cx="0" cy="35" r="6" fill={`url(#${id}-${i})`}/>
            <path d="M-30 166H30M-28 151H28M-17 83H17" fill="none" opacity=".65"/>
            {Array.from({length:Math.ceil(tier/2)},(_,n)=><path key={n} d={`M${-16+n*7} 143v8`} stroke="#bd9e66" opacity=".8"/>)}
        </g>)}
    </svg>;
}

export function MusicRewardArtwork({tier}:{tier:number}) {
    return <svg viewBox="0 0 320 220" className="reward-board-art" aria-hidden="true" focusable="false">
        <circle cx="160" cy="110" r="65" fill="#181c20" stroke="#a58f63"/>
        {[43,48,54,60].map(r=><circle key={r} cx="160" cy="110" r={r} fill="none" stroke="#a58f63" opacity=".22"/>)}
        <circle cx="160" cy="110" r="22" fill="#a58f63"/><circle cx="160" cy="110" r="4" fill="#181c20"/>
        <g stroke="#deceb0" strokeWidth="2">{Array.from({length:17},(_,i)=><path key={i} d={`M${88+i*9} ${178-Math.sin(i*.8+tier)**2*10}v${4+Math.sin(i*.8+tier)**2*20}`}/>)}</g>
    </svg>;
}
