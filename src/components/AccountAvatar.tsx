import { avatarFrame } from '../config/avatarFrames';
import './account-avatar.css';

export function AccountAvatar({name,url,frame,size=64}:{name:string;url?:string;frame?:string;size?:number}) {
    const decoration=avatarFrame(frame);
    return <span className="account-avatar" style={{width:size,height:size}} data-avatar-frame={decoration?.id??'standard'}>
        <span className="account-avatar-portrait">{url?<img src={url} alt="" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/>:null}<span aria-hidden="true">{name.trim().slice(0,1)||'?'}</span></span>
        {decoration&&<svg viewBox="0 0 120 120" aria-hidden="true" className="account-avatar-frame" fill="none" style={{color:decoration.color}}>
            <circle cx="60" cy="60" r="51" stroke="currentColor" strokeWidth="2"/><circle cx="60" cy="60" r="55" stroke="currentColor" strokeWidth=".6"/>
            {decoration.motif==='laurel'&&[-1,1].map(side=><g key={side} transform={side<0?'translate(120 0) scale(-1 1)':undefined}><path d="M48 115C12 110 0 71 12 30" stroke="currentColor" strokeWidth="2"/>{[0,1,2,3,4].map(i=><path key={i} d="M0 0q-16-4-13-17Q2-14 0 0Zm0 0q13-9 19-3Q13 8 0 0Z" fill="currentColor" transform={`translate(${13+i*3} ${42+i*13}) rotate(${-20+i*11})`}/>)}</g>)}
            {decoration.motif==='facets'&&<><path d="m60 1 43 17 16 42-16 42-43 17-43-17L1 60l16-42Z" stroke="currentColor" strokeWidth="4"/><path d="m60 1 0 8m59 51h-9m-50 59v-9M1 60h9M17 18l7 6m79-6-7 6m7 78-7-7m-79 7 7-7" stroke={decoration.accent} strokeWidth="3"/></>}
            {decoration.motif==='wings'&&[-1,1].map(side=><path key={side} transform={side<0?'translate(120 0) scale(-1 1)':undefined} d="M16 43 0 18l3 38 7-8L1 65l15 26-2-24 8 18 3-30Z" fill="currentColor" stroke={decoration.accent}/>)}
            {decoration.motif==='circuit'&&<><path d="M31 7H13v27H4v48h13v28h27m45-103h18v27h9v48h-13v28H76" stroke="currentColor" strokeWidth="3"/>{[[4,82],[13,34],[44,110],[116,82],[107,34],[76,110]].map(([x,y])=><circle key={x+':'+y} cx={x} cy={y} r="4" fill={decoration.accent}/>)}</>}
            {decoration.motif==='crown'&&<><path d="m31 15-6-17 20 11L60-7 75 9 20-11-6 17Z" fill="currentColor" stroke={decoration.accent}/><path d="M27 104q33 22 66 0l-6 14H33Z" fill="currentColor"/></>}
            {Array.from({length:decoration.tier+3},(_,i)=>{const angle=i/(decoration.tier+3)*Math.PI*2;return <path key={i} d="m0-3 2 3-2 3-2-3Z" fill={decoration.accent} transform={`translate(${60+Math.sin(angle)*55} ${60+Math.cos(angle)*55}) rotate(${-angle*180/Math.PI})`}/>;})}
            {decoration.tier>=6&&<path d="M27 100Q4 80 9 51M93 100q23-20 18-49" stroke="currentColor" strokeWidth="2"/>}
            {decoration.tier>=11&&<path d="m45 13-3-8 10 5 8-9 8 9 10-5-3 8Z" fill={decoration.color} stroke={decoration.accent}/>}
        </svg>}
    </span>;
}
