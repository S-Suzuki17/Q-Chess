import {useId} from 'react';
import type {AVATAR_FRAMES} from '../config/avatarFrames';

/** Cast metal, cut enamel and bevelled fittings. The portrait is the clear centre. */
export function AvatarFrameArtwork({decoration}:{decoration:typeof AVATAR_FRAMES[number]}) {
    const id=useId(),grade=Math.ceil(decoration.tier/5);
    const metal=`url(#${id}-metal)`,edge=`url(#${id}-edge)`,enamel=`url(#${id}-enamel)`;
    return <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="account-avatar-frame" fill="none" data-frame-grade={grade}>
        <defs>
            <linearGradient id={`${id}-metal`} x1="0" y1="0" x2=".85" y2="1"><stop stopColor={decoration.accent}/><stop offset=".2" stopColor={decoration.color}/><stop offset=".42" stopColor="#f0eadb"/><stop offset=".5" stopColor={decoration.color}/><stop offset=".72" stopColor="#3b3935"/><stop offset="1" stopColor={decoration.color}/></linearGradient>
            <linearGradient id={`${id}-edge`} x2="0" y2="1"><stop stopColor="#fff8e6"/><stop offset=".48" stopColor={decoration.color}/><stop offset="1" stopColor="#443b31"/></linearGradient>
            <linearGradient id={`${id}-enamel`} x2=".8" y2="1"><stop stopColor={decoration.accent}/><stop offset=".3" stopColor="#345366"/><stop offset="1" stopColor="#101c2e"/></linearGradient>
        </defs>
        <circle cx="60" cy="60" r="52" stroke="#070c13" strokeWidth="8"/>
        <circle cx="60" cy="60" r="52" stroke={metal} strokeWidth="5"/>
        <circle cx="60" cy="60" r="49.3" stroke={decoration.accent} strokeWidth=".65"/>
        <circle cx="60" cy="60" r="55.2" stroke={edge} strokeWidth=".7"/>
        {decoration.motif==='laurel'&&[-1,1].map(side=><g key={side} transform={side<0?'translate(120 0) scale(-1 1)':undefined}>
            <path d="M48 114C13 104 4 68 16 28" stroke={metal} strokeWidth="2"/>
            {Array.from({length:4+grade*2},(_,i)=><g key={i} transform={`translate(${13+i*i*.38} ${32+i*9}) rotate(${-25+i*9})`}>
                <path d="M0 8Q-18-1-12-15 1-10 0 8Z" fill={metal} stroke={edge} strokeWidth=".5"/>
                <path d="M0 8Q14 2 15-10 3-10 0 8Z" fill={metal} stroke={edge} strokeWidth=".5"/>
                <path d="M-9-10 0 8 11-6" stroke="#584b33" strokeWidth=".6"/>
            </g>)}
        </g>)}
        {decoration.motif==='facets'&&<>
            <path d="m60 1 43 17 16 42-16 42-43 17-43-17L1 60l16-42Z" stroke={metal} strokeWidth="6"/>
            {Array.from({length:grade===1?4:8},(_,i)=>{const a=i*360/(grade===1?4:8);return <g key={i} transform={`rotate(${a} 60 60)`}>
                <path d="m60 0 7 8-7 8-7-8Z" fill={enamel} stroke={edge} strokeWidth=".8"/><path d="m60 0 0 16-7-8Z" fill={decoration.accent} opacity=".4"/>
            </g>;})}
            {grade===3&&<path d="m60 7 38 16 15 37-15 37-38 16-38-16L7 60l15-37Z" stroke={decoration.accent} strokeWidth=".6" strokeDasharray="2 4"/>}
        </>}
        {decoration.motif==='wings'&&[-1,1].map(side=><g key={side} transform={side<0?'translate(120 0) scale(-1 1)':undefined}>
            {Array.from({length:3+grade},(_,i)=><path key={i} d={`M${19+i} ${40+i*7} ${-7+i*3} ${6+i*12} ${-2+i*3} ${43+i*10} ${15+i} ${69+i*4}Z`} fill={metal} stroke={edge} strokeWidth=".8"/>)}
            <path d="m16 47 7 12-5 20-8-18Z" fill={enamel} stroke={edge} strokeWidth=".8"/>
        </g>)}
        {decoration.motif==='circuit'&&<>
            <path d="M31 7H13v27H4v48h13v28h27m45-103h18v27h9v48h-13v28H76" stroke={metal} strokeWidth="5"/>
            <path d="M31 7H13v27H4v48h13v28h27m45-103h18v27h9v48h-13v28H76" stroke={decoration.accent} strokeWidth=".65"/>
            {[[4,82],[13,34],[44,110],[116,82],[107,34],[76,110]].map(([x,y])=><g key={`${x}-${y}`}><rect x={x-3.5} y={y-3.5} width="7" height="7" rx="1" fill={enamel} stroke={edge}/><circle cx={x} cy={y} r="1.2" fill={decoration.accent}/></g>)}
            {grade>=2&&<path d="M35 3h15M85 3H70M20 20v8m80-8v8M22 94v9m76-9v9" stroke={metal} strokeWidth="2"/>}
        </>}
        {decoration.motif==='crown'&&<>
            <path d="M31 15 25 -2 45 9 60 -7 75 9 95 -2 89 15Z" fill={metal} stroke={edge} strokeWidth=".8"/>
            <path d="m60-7-7 22h14ZM25-2l12 17h8Zm70 0L83 15h-8Z" fill={decoration.accent} opacity=".45"/>
            <path d="M31 15h58v5H31Z" fill={metal} stroke={edge} strokeWidth=".65"/>
            <path d="m60 1 4 6-4 6-4-6Z" fill={enamel} stroke={edge} strokeWidth=".5"/>
            <path d="M27 104q33 22 66 0l-6 14H33Z" fill={metal} stroke={edge} strokeWidth=".65"/>
            {grade>=2&&<path d="M24 20Q4 57 23 88M96 20q20 37 1 68" stroke={metal} strokeWidth="3"/>}
            {grade===3&&[-1,1].map(side=><g key={side} transform={side<0?'translate(120 0) scale(-1 1)':undefined}>{[0,1,2,3].map(i=><path key={i} d="m0 0-9-14 2 24 7 6 4-11Z" fill={metal} stroke={edge} strokeWidth=".6" transform={`translate(${13+i} ${36+i*13})`}/>)}</g>)}
        </>}
        <path d="m60 109 8 6-8 6-8-6Z" fill={enamel} stroke={edge} strokeWidth=".7"/>
        {grade>=2&&<path d="M29 17A52 52 0 0 1 45 10M91 17a52 52 0 0 0-16-7" stroke="#fff8e6" strokeWidth="1.2"/>}
    </svg>;
}
