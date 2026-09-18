import { useId } from 'react';
import { BADGE_PIECE_PATHS, type BadgeDefinition } from '../config/profileBadges';

/** No Canvas in lists or live matches. Matches the silhouette of the 3D sculpture. */
export function RankBadgeArtwork({badge}:{badge:BadgeDefinition}) {
    const id=useId();
    return <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="rank-badge-art">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={badge.accent}/><stop offset=".45" stopColor={badge.metal}/><stop offset="1" stopColor={badge.inset}/></linearGradient></defs>
        {badge.silhouette==='crest'&&<path d="M30 44 2 18l3 34 24 24m62-32 27-26-3 34-24 24" fill={badge.metal} stroke={badge.accent} strokeWidth="2"/>}
        {badge.silhouette==='crown'&&Array.from({length:12},(_,i)=><path key={i} d="m58 16 2-15 2 15Z" transform={`rotate(${i*30} 60 60)`} fill={badge.metal}/>)}
        {badge.silhouette==='orbital'?<><ellipse cx="60" cy="60" rx="52" ry="26" transform="rotate(40 60 60)" fill="none" stroke={badge.metal} strokeWidth="4"/><ellipse cx="60" cy="60" rx="52" ry="26" transform="rotate(-40 60 60)" fill="none" stroke={badge.accent} strokeWidth="3"/><circle cx="60" cy="60" r="36" fill={badge.inset}/></>:<path d={badge.silhouette==='fortress'?'M22 23V12h16v11h14V12h16v11h14V12h16v75l-38 26-38-26Z':badge.silhouette==='lens'?'M60 10a50 50 0 1 0 0 100 50 50 0 1 0 0-100Z':'m60 10 40 16-4 54-36 30-36-30-4-54Z'} fill={`url(#${id})`} stroke={badge.metal} strokeWidth="3"/>}
        {badge.silhouette!=='orbital'&&<path d="m60 23 28 11-3 40-25 22-25-22-3-40Z" fill={badge.inset} stroke={badge.accent} strokeWidth="1"/>}
        <path d={BADGE_PIECE_PATHS[badge.id]} transform="translate(0 13)" fill={badge.id==='queen'?badge.accent:`url(#${id})`} stroke={badge.accent} strokeWidth="1.2" strokeLinejoin="round"/>
        {badge.id==='rook'&&<path d="m46 80 8-12-2-11m20 14-7 11 3 9" fill="none" stroke={badge.accent} strokeWidth="2"/>}
        {badge.id==='bishop'&&<path d="M31 59c0-17 11-29 25-32" fill="none" stroke="#fff4dc" strokeWidth="3" opacity=".6"/>}
    </svg>;
}
